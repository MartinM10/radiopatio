import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { PushMessage, setPushSender } from '../lib/notify';
import { CONFIRMED_AT } from '../lib/quality';
import { devHeaders } from './helpers';

const sent: PushMessage[] = [];

test.before(async () => {
  await runMigrations();
  setPushSender(async (msgs) => {
    sent.push(...msgs);
    return { invalidTokens: [] };
  });
});

test.after(async () => {
  setPushSender(null);
  await pool.end();
});

// Zona de pruebas aleatoria por ejecución: la BD persiste entre ejecuciones y
// la deduplicación / cuarentena son por celda.
const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
const farLat = baseLat + 1; // ~111 km

const tag = Math.random().toString(36).slice(2, 8);
let uniq = 0;
const text = (what: string) => `${what} ${tag} ${++uniq} ${Math.random().toString(36).slice(2)} xqz${uniq}`;

/** El envío es en segundo plano: espera a que la condición se cumpla. */
async function eventually<T>(fn: () => Promise<T | null | undefined | false>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('la condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 40));
  }
}

const expoToken = () => `ExponentPushToken[${Math.random().toString(36).slice(2).padEnd(12, 'x')}]`;

async function inbox(app: ReturnType<typeof buildApp>, headers: Record<string, string>) {
  const res = await app.inject({ method: 'GET', url: '/api/notifications', headers });
  assert.strictEqual(res.statusCode, 200);
  return JSON.parse(res.body).data as { unread: number; items: Array<{ id: number; kind: string; title: string; body: string; incidentId: string | null; read: boolean }> };
}

async function publish(app: ReturnType<typeof buildApp>, headers: Record<string, string>, lat: number, lng: number, category = 'vehiculo') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers,
    payload: { category, zone: { lat, lng, address: 'Calle de Prueba' }, description: text('Aviso de prueba de notificaciones') },
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  return JSON.parse(res.body).data as { id: string };
}

test('notificaciones: exigen cuenta de dispositivo', async () => {
  const app = buildApp();
  try {
    for (const [method, url] of [
      ['GET', '/api/notifications'],
      ['GET', '/api/notifications/settings'],
      ['GET', '/api/notifications/zones'],
    ] as const) {
      const res = await app.inject({ method, url });
      assert.strictEqual(res.statusCode, 401, url);
    }
  } finally {
    await app.close();
  }
});

test('confirmar un aviso avisa al autor (sin decir quién) y agrupa mientras no lo lea', async () => {
  const app = buildApp();
  try {
    const author = await devHeaders(`autor-${tag}`);
    const v1 = await devHeaders(`vecino1-${tag}`);
    const v2 = await devHeaders(`vecino2-${tag}`);
    const token = expoToken();
    const put = await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: author, payload: { token } });
    assert.strictEqual(put.statusCode, 200);

    const inc = await publish(app, author, baseLat, baseLng);

    const c1 = await app.inject({ method: 'POST', url: `/api/incidents/${inc.id}/confirm`, headers: v1 });
    assert.strictEqual(c1.statusCode, 200);
    const first = await eventually(async () => {
      const box = await inbox(app, author);
      return box.items.find((n) => n.kind === 'confirmation' && n.incidentId === inc.id);
    });
    assert.match(first.title, /ha confirmado tu aviso/);
    assert.ok(!/vecino1/.test(JSON.stringify(first)), 'no debe revelar quién confirmó');
    assert.ok(sent.some((m) => m.to === token && (m.data as { incidentId?: string }).incidentId === inc.id), 'push enviado');

    const c2 = await app.inject({ method: 'POST', url: `/api/incidents/${inc.id}/confirm`, headers: v2 });
    assert.strictEqual(c2.statusCode, 200);
    // Hasta alcanzar el umbral de verificación sigue siendo «un vecino ha confirmado».
    for (let k = 3; k <= CONFIRMED_AT; k++) {
      const more = await app.inject({ method: 'POST', url: `/api/incidents/${inc.id}/confirm`, headers: await devHeaders(`vecino${k}-${tag}`) });
      assert.strictEqual(more.statusCode, 200);
    }
    const box = await eventually(async () => {
      const b = await inbox(app, author);
      return b.items.find((n) => n.incidentId === inc.id)?.title === 'Tu aviso ya está verificado' ? b : null;
    });
    assert.strictEqual(box.items.filter((n) => n.incidentId === inc.id).length, 1, 'una sola entrada mientras no se lea');
    assert.strictEqual(box.unread, 1);

    // Marcar como leída vacía el contador.
    const read = await app.inject({ method: 'POST', url: '/api/notifications/read', headers: author, payload: {} });
    assert.strictEqual(read.statusCode, 200);
    assert.strictEqual((await inbox(app, author)).unread, 0);

    // Quien confirma no recibe nada, y quien lo desactiva tampoco.
    assert.strictEqual((await inbox(app, v1)).items.length, 0);
    await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: author, payload: { confirmations: false } });
    const inc2 = await publish(app, v2, baseLat + 0.5, baseLng); // otra celda, otro autor
    await app.inject({ method: 'POST', url: `/api/incidents/${inc2.id}/confirm`, headers: author });
    await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: v2, payload: { confirmations: false } });
    const inc3 = await publish(app, await devHeaders(`autor3-${tag}`), baseLat + 0.7, baseLng);
    await app.inject({ method: 'POST', url: `/api/incidents/${inc3.id}/confirm`, headers: author });
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!(await inbox(app, author)).items.some((n) => n.incidentId === inc3.id && n.kind === 'confirmation'));
  } finally {
    await app.close();
  }
});

test('un aviso nuevo llega a quien está cerca y a quien vigila la zona, no al autor ni a los lejanos', async () => {
  const app = buildApp();
  try {
    const author = await devHeaders(`a2-${tag}`);
    const near = await devHeaders(`cerca-${tag}`);
    const far = await devHeaders(`lejos-${tag}`);
    const watcher = await devHeaders(`vigila-${tag}`);
    const both = await devHeaders(`ambos-${tag}`);
    const off = await devHeaders(`apagado-${tag}`);

    // Cerca (~300 m), lejos (~111 km), el propio autor (en la misma zona) y uno con «cerca» apagado.
    for (const [h, lat, lng] of [
      [near, baseLat + 0.003, baseLng],
      [far, farLat, baseLng],
      [author, baseLat, baseLng],
      [both, baseLat, baseLng + 0.003],
      [off, baseLat, baseLng],
    ] as const) {
      const r = await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: h, payload: { area: { lat, lng } } });
      assert.strictEqual(r.statusCode, 200);
    }
    await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: off, payload: { nearby: false } });

    // El vecino que vigila vive lejos, pero vigila la zona de su familiar.
    const wz = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: watcher, payload: { label: 'Casa de mamá', lat: baseLat, lng: baseLng } });
    assert.strictEqual(wz.statusCode, 201);
    // «Ambos» está cerca Y vigila la zona: una sola notificación, la de «cerca de ti».
    await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: both, payload: { label: 'Trabajo', lat: baseLat, lng: baseLng } });

    const inc = await publish(app, author, baseLat, baseLng, 'hogar');

    const nearBox = await eventually(async () => {
      const b = await inbox(app, near);
      return b.items.length > 0 ? b : null;
    });
    assert.strictEqual(nearBox.items[0].kind, 'nearby');
    assert.match(nearBox.items[0].title, /Robo en vivienda cerca de ti/);
    assert.strictEqual(nearBox.items[0].incidentId, inc.id);

    const watchBox = await eventually(async () => {
      const b = await inbox(app, watcher);
      return b.items.length > 0 ? b : null;
    });
    assert.strictEqual(watchBox.items[0].kind, 'watched');
    assert.match(watchBox.items[0].title, /en «Casa de mamá»/);

    const bothBox = await eventually(async () => {
      const b = await inbox(app, both);
      return b.items.length > 0 ? b : null;
    });
    assert.strictEqual(bothBox.items.length, 1);
    assert.strictEqual(bothBox.items[0].kind, 'nearby');

    await new Promise((r) => setTimeout(r, 250));
    assert.strictEqual((await inbox(app, far)).items.length, 0, 'a 111 km no se avisa');
    assert.strictEqual((await inbox(app, author)).items.length, 0, 'el autor no recibe su propio aviso');
    assert.strictEqual((await inbox(app, off)).items.length, 0, 'con «cerca» apagado no se avisa');
  } finally {
    await app.close();
  }
});

test('zona de vigilancia: validación, duplicados, límite y borrado; el área guarda solo el centro de la celda', async () => {
  const app = buildApp();
  try {
    const h = await devHeaders(`zonas-${tag}`);
    const bad = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: '', lat: baseLat, lng: baseLng } });
    assert.strictEqual(bad.statusCode, 400);
    const pii = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: 'Piso de ana@correo.com', lat: baseLat, lng: baseLng } });
    assert.strictEqual(pii.statusCode, 400);

    const ok = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: 'Abuela', lat: baseLat, lng: baseLng } });
    assert.strictEqual(ok.statusCode, 201);
    const zones = JSON.parse(ok.body).data as Array<{ id: number; lat: number; lng: number }>;
    assert.strictEqual(zones.length, 1);
    assert.ok(Math.abs(zones[0].lat - baseLat) < 0.01 && zones[0].lat !== baseLat, 'se guarda el centro de la celda, no el punto');

    const dup = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: 'Otra vez', lat: baseLat + 0.0001, lng: baseLng } });
    assert.strictEqual(dup.statusCode, 409);

    for (let i = 1; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: `Zona ${i}`, lat: baseLat + i * 0.1, lng: baseLng } });
      assert.strictEqual(r.statusCode, 201);
    }
    const over = await app.inject({ method: 'POST', url: '/api/notifications/zones', headers: h, payload: { label: 'Sexta', lat: baseLat + 0.9, lng: baseLng } });
    assert.strictEqual(over.statusCode, 409);
    assert.strictEqual(JSON.parse(over.body).error, 'WATCHED_ZONES_LIMIT');

    const del = await app.inject({ method: 'DELETE', url: `/api/notifications/zones/${zones[0].id}`, headers: h });
    assert.strictEqual(del.statusCode, 200);
    assert.strictEqual(JSON.parse(del.body).data.length, 4);

    // El área también se reduce a la celda, y null la borra.
    const set = await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: h, payload: { area: { lat: baseLat, lng: baseLng } } });
    const area = JSON.parse(set.body).data.area as { lat: number; lng: number };
    assert.ok(area.lat !== baseLat && Math.abs(area.lat - baseLat) < 0.01);
    const clear = await app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: h, payload: { area: null } });
    assert.strictEqual(JSON.parse(clear.body).data.area, null);
  } finally {
    await app.close();
  }
});

test('push: token inválido se rechaza, un token pasa a la última cuenta y Expo lo descarta si no existe', async () => {
  const app = buildApp();
  try {
    const a = await devHeaders(`pa-${tag}`);
    const b = await devHeaders(`pb-${tag}`);
    const bad = await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: a, payload: { token: 'nope' } });
    assert.strictEqual(bad.statusCode, 400);

    const token = expoToken();
    await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: a, payload: { token } });
    await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: b, payload: { token } });
    const sa = JSON.parse((await app.inject({ method: 'GET', url: '/api/notifications/settings', headers: a })).body).data;
    const sb = JSON.parse((await app.inject({ method: 'GET', url: '/api/notifications/settings', headers: b })).body).data;
    assert.strictEqual(sa.pushRegistered, false);
    assert.strictEqual(sb.pushRegistered, true);

    // Expo dice «DeviceNotRegistered»: el token se olvida.
    setPushSender(async (msgs) => ({ invalidTokens: msgs.map((m) => m.to) }));
    const author = await devHeaders(`pc-${tag}`);
    await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: author, payload: { token: expoToken() } });
    const inc = await publish(app, author, baseLat + 1.5, baseLng);
    await app.inject({ method: 'POST', url: `/api/incidents/${inc.id}/confirm`, headers: a });
    await eventually(async () => !JSON.parse((await app.inject({ method: 'GET', url: '/api/notifications/settings', headers: author })).body).data.pushRegistered);
    setPushSender(async (msgs) => {
      sent.push(...msgs);
      return { invalidTokens: [] };
    });
  } finally {
    await app.close();
  }
});
