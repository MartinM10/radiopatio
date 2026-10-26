import assert from 'node:assert';
import test, { TestContext } from 'node:test';
import { buildApp } from '../app';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { snapToHexGrid } from '../lib/geo';
import { config } from '../config';

/** Coordenadas únicas y lejanas a las celdas sembradas (Málaga norte). */
const BASE = { lat: 36.75013, lng: -4.51007 };
const jitter = (i: number) => ({ lat: BASE.lat + i * 0.0011, lng: BASE.lng - i * 0.0013 });

const device = () => `test-dev-${Math.random().toString(36).slice(2, 12)}`;

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

test.before(async () => {
  if (await dbAvailable()) {
    await runMigrations();
  }
});

test.after(async () => {
  if (await dbAvailable()) {
    await pool.end();
  }
});

async function post(app: any, deviceId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers: { 'x-device-id': deviceId },
    payload,
  });
}

const cleanup = async (ids: string[]) => {
  if (ids.length === 0) return;
  await pool.query(`DELETE FROM incidents WHERE id = ANY($1)`, [ids]);
};

const goodIncident = (i: number, description: string) => ({
  category: 'agresion',
  zone: { lat: jitter(i).lat, lng: jitter(i).lng },
  description,
});

test('Dedup server-side: aviso casi idéntico de otra cuenta → 409', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  const ids: string[] = [];
  try {
    const a = device();
    const b = device();
    const first = await post(app, a, goodIncident(1, 'Carteristas en la entrada del mercado central'));
    assert.strictEqual(first.statusCode, 201);
    const created = JSON.parse(first.body).data;
    ids.push(created.id);

    const dup = await post(app, b, goodIncident(1, 'Carteristas en la entrada del mercado'));
    assert.strictEqual(dup.statusCode, 409);
    assert.strictEqual(JSON.parse(dup.body).error, 'DUPLICATE_INCIDENT');

    // La denuncia correcta no es bloqueada: texto distinto en la misma celda
    const other = await post(
      app,
      b,
      goodIncident(1, 'Ventana del portal del numero 12 forzada esta tarde'),
    );
    assert.strictEqual(other.statusCode, 201);
    ids.push(JSON.parse(other.body).data.id);
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test('Anti-abuso: hueco mínimo entre avisos del mismo dispositivo → 429', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  const ids: string[] = [];
  try {
    const a = device();
    const first = await post(app, a, goodIncident(2, 'Amenazas gritadas frente al instituto al salir'));
    assert.strictEqual(first.statusCode, 201);
    ids.push(JSON.parse(first.body).data.id);
    const second = await post(app, a, goodIncident(3, 'Ruido brutal de reforma en el edificio marron'));
    assert.strictEqual(second.statusCode, 429);
    assert.strictEqual(JSON.parse(second.body).error, 'RATE_LIMIT_EXCEEDED');
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test('Privacidad de coordenadas: la lista devuelve el centro de celda, nunca el GPS exacto', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  const ids: string[] = [];
  try {
    const a = device();
    const created = await post(app, a, goodIncident(4, 'Empujonazon y palabras fuertes en el cierre del bus'));
    assert.strictEqual(created.statusCode, 201);
    const body = JSON.parse(created.body).data;
    ids.push(body.id);

    // Ni en la creación ni en el listado hay coordenadas exactas
    const posted = jitter(4);
    assert.notEqual(body.zone.lat, posted.lat);
    const expected = snapToHexGrid(posted.lat, posted.lng);
    assert.strictEqual(body.zone.lat, expected.centerLat);
    assert.strictEqual(body.zone.lng, expected.centerLng);

    const list = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { 'x-device-id': device() },
    });
    const listed = JSON.parse(list.body).data.find((i: { id: string }) => i.id === body.id);
    assert.ok(listed, 'el aviso debe estar en el listado');
    assert.strictEqual(listed.zone.lat, expected.centerLat);
    assert.strictEqual(listed.zone.lng, expected.centerLng);
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test('Estadística de zona: solo confirmados mueven la aguja y hace falta muestra', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  const ids: string[] = [];
  try {
    const a = device();
    const created = await post(app, a, goodIncident(5, 'Agresion fisica a un repartidor en el meinlocal'));
    const id = JSON.parse(created.body).data.id;
    ids.push(id);

    let alert = await app.inject({
      method: 'GET',
      url: `/api/zones/alert?lat=${jitter(5).lat}&lng=${jitter(5).lng}`,
    });
    let body = JSON.parse(alert.body);
    assert.strictEqual(body.totalCount, 1);
    assert.strictEqual(body.score, 0, 'sin confirmar: score 0');
    assert.strictEqual(body.sampleSufficient, false);
    assert.strictEqual(body.level, 'tranquilo');

    const b = device();
    const c = device();
    for (const d of [b, c]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/incidents/${id}/confirm`,
        headers: { 'x-device-id': d },
      });
      assert.strictEqual(res.statusCode, 200);
    }

    alert = await app.inject({
      method: 'GET',
      url: `/api/zones/alert?lat=${jitter(5).lat}&lng=${jitter(5).lng}`,
    });
    body = JSON.parse(alert.body);
    assert.strictEqual(body.confirmedCount, 1);
    assert.strictEqual(body.score, 3, 'severidad agresion = 3, ya confirmado');
    assert.strictEqual(body.sampleSufficient, false, 'una muestra no basta');
    assert.strictEqual(body.level, 'moderado');
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test('Moderación: 2 denuncias ocultan; cola y auditoría solo con token de admin', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  const ids: string[] = [];
  try {
    const a = device();
    const created = await post(app, a, goodIncident(6, 'Supuesto aviso polémico discutible del vecindario'));
    const id = JSON.parse(created.body).data.id;
    ids.push(id);

    expectStatus(
      await app.inject({ method: 'POST', url: `/api/incidents/${id}/flag`, headers: { 'x-device-id': device() }, payload: { reason: 'me parece falso' } }),
      200,
    );
    // tras 1 denuncia sigue visible
    let list = await app.inject({ method: 'GET', url: '/api/incidents', headers: { 'x-device-id': device() } });
    assert.ok(JSON.parse(list.body).data.some((i: { id: string }) => i.id === id));
    expectStatus(
      await app.inject({ method: 'POST', url: `/api/incidents/${id}/flag`, headers: { 'x-device-id': device() } }),
      200,
    );
    // tras 2 (umbral config.maxFlagsBeforeHide = 3): sigue visible; con 3 se oculta
    expectStatus(
      await app.inject({ method: 'POST', url: `/api/incidents/${id}/flag`, headers: { 'x-device-id': device() } }),
      200,
    );
    list = await app.inject({ method: 'GET', url: '/api/incidents', headers: { 'x-device-id': device() } });
    assert.ok(!JSON.parse(list.body).data.some((i: { id: string }) => i.id === id), 'oculto tras el umbral');

    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation',
      headers: { 'x-admin-token': config.adminToken },
    });
    assert.strictEqual(queue.statusCode, 200);
    const item = JSON.parse(queue.body).data.find((q: { id: string }) => q.id === id);
    assert.ok(item, 'la cola lista el aviso ocultado');
    assert.strictEqual(item.flagsCount, 3);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation',
      headers: { 'x-admin-token': 'malo' },
    });
    assert.strictEqual(unauthorized.statusCode, 401);

    const resolve = await app.inject({
      method: 'POST',
      url: `/api/admin/incidents/${id}/resolve`,
      headers: { 'x-admin-token': config.adminToken, 'content-type': 'application/json' },
      payload: { action: 'restore', reason: 'verificado plausible' },
    });
    assert.strictEqual(resolve.statusCode, 200);

    list = await app.inject({ method: 'GET', url: '/api/incidents', headers: { 'x-device-id': device() } });
    assert.ok(JSON.parse(list.body).data.some((i: { id: string }) => i.id === id), 'restaurado');

    const audit = await app.inject({
      method: 'GET',
      url: '/api/admin/audit',
      headers: { 'x-admin-token': config.adminToken },
    });
    const auditBody = JSON.parse(audit.body);
    assert.ok(auditBody.data.some((l: { incident_id: string; action: string }) => l.incident_id === id && l.action === 'restore'));
  } finally {
    await cleanup(ids);
    await app.close();
  }
});

test('Retención 72 h: los caducados se purgan físicamente al leer', async (t: TestContext) => {
  if (!(await dbAvailable())) return t.skip('requiere PostgreSQL');
  const app = buildApp();
  try {
    const id = `u_old_${Math.random().toString(36).slice(2, 10)}`;
    await pool.query(
      `INSERT INTO incidents (id, category, grid_x, grid_y, description, created_at, confirmations_count, flags_count, status, device_hash, lat, lng, hex_key, hex_lat, hex_lng)
       VALUES ($1, 'hurto', 50, 50, 'Aviso antiguísimo que deberá ser purgado al listar', NOW() - INTERVAL '80 hours', 0, 0, 'active', 'test-old', 36.75013, -4.51007, 'h_old', 36.75013, -4.51007)`,
      [id],
    );
    await pool.query(`INSERT INTO incident_confirmations (incident_id, device_hash) VALUES ($1, 'test-old-c')`, [id]);

    const list = await app.inject({ method: 'GET', url: '/api/incidents', headers: { 'x-device-id': device() } });
    assert.ok(!JSON.parse(list.body).data.some((i: { id: string }) => i.id === id));

    const gone = await pool.query(`SELECT 1 AS x FROM incidents WHERE id = $1`, [id]);
    assert.strictEqual(gone.rowCount, 0, 'la fila ha sido borrada de la base de datos');
    const confs = await pool.query(`SELECT 1 AS x FROM incident_confirmations WHERE incident_id = $1`, [id]);
    assert.strictEqual(confs.rowCount, 0, 'las confirmaciones cascadan con la purga');
  } finally {
    await app.close();
  }
});

function expectStatus(res: { statusCode: number }, code: number) {
  assert.strictEqual(res.statusCode, code, `status esperado ${code}, body: ${(res as any).body}`);
}
