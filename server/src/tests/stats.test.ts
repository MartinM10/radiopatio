import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { config } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { purgeExpiredIncidents } from '../db/purge';
import { setPushSender } from '../lib/notify';
import { CONFIRMED_AT } from '../lib/quality';
import { slugify } from '../routes/stats';
import { devHeaders } from './helpers';

// Municipios inventados y únicos por ejecución: la BD persiste entre ejecuciones.
const tag = Math.random().toString(36).slice(2, 8);
const townA = `Villaestadistica ${tag}`;
const townB = `Aldeaotra ${tag}`;
const admin = { 'x-admin-token': config.adminToken };

test.before(async () => {
  await runMigrations();
  setPushSender(async () => ({ invalidTokens: [] }));
});

test.after(async () => {
  await pool.query(`DELETE FROM incident_daily_counts WHERE municipality IN ($1, $2)`, [townA, townB]);
  await pool.query(`DELETE FROM episodes WHERE slug LIKE $1`, [`%${tag}%`]);
  setPushSender(null);
  await pool.end();
});

const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
let n = 0;
async function publish(app: ReturnType<typeof buildApp>, label: string, category: string, town: string, confirmations = 0) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers: await devHeaders(`${label}-${tag}`),
    payload: { category, zone: { lat: baseLat + ++n * 0.02, lng: baseLng }, description: `Aviso de prueba de estadisticas ${tag} ${n} ${Math.random().toString(36).slice(2)} xqz` },
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  const id = JSON.parse(res.body).data.id as string;
  await pool.query(`UPDATE incidents SET municipality = $2, confirmations_count = $3 WHERE id = $1`, [id, town, confirmations]);
  return id;
}

const get = (app: ReturnType<typeof buildApp>, url: string) => app.inject({ method: 'GET', url });

test('slugify: sin acentos ni signos, en minúsculas', () => {
  assert.strictEqual(slugify('Temporal del 8 y 9 de noviembre'), 'temporal-del-8-y-9-de-noviembre');
  assert.strictEqual(slugify('  ¡DANA en Málaga!  '), 'dana-en-malaga');
  assert.strictEqual(slugify('???'), '');
});

test('estadísticas diarias: validan el periodo y filtran por municipio y categoría', async () => {
  const app = buildApp();
  try {
    await pool.query(
      `INSERT INTO incident_daily_counts (day, municipality, category, total, confirmed, verified) VALUES
         ('2001-03-10', $1, 'arbol', 10, 6, 2),
         ('2001-03-10', $1, 'inundacion', 4, 1, 0),
         ('2001-03-11', $1, 'arbol', 5, 3, 1),
         ('2001-03-11', $2, 'arbol', 7, 7, 7),
         ('2001-03-11', '', 'arbol', 2, 0, 0)
       ON CONFLICT DO NOTHING`,
      [townA, townB],
    );
    const url = (q: string) => `/api/stats/daily?${q}`;

    assert.strictEqual((await get(app, url('from=2001-03-10'))).statusCode, 400, 'falta to');
    assert.strictEqual((await get(app, url('from=2001-03-12&to=2001-03-10'))).statusCode, 400, 'from posterior a to');
    assert.strictEqual((await get(app, url('from=2001-01-01&to=2001-12-31'))).statusCode, 400, 'más de 92 días');
    assert.strictEqual((await get(app, url('from=2001-02-30&to=2001-03-01'))).statusCode, 400, 'fecha inexistente');

    const all = JSON.parse((await get(app, url(`from=2001-03-10&to=2001-03-11&municipality=${encodeURIComponent(townA.toUpperCase())}`))).body).data;
    assert.strictEqual(all.length, 3, 'sin distinguir mayúsculas');
    assert.deepStrictEqual(all[0], { day: '2001-03-10', municipality: townA, category: 'arbol', total: 10, confirmed: 6, verified: 2 });

    const onlyTrees = JSON.parse((await get(app, url(`from=2001-03-10&to=2001-03-11&category=arbol`))).body).data as { municipality: string | null }[];
    assert.ok(onlyTrees.some((r) => r.municipality === null), "el municipio desconocido sale como null, no como ''");
    assert.ok(onlyTrees.every((r) => !('device_hash' in r)));

    const known = JSON.parse((await get(app, '/api/stats/municipalities')).body).data as { municipality: string }[];
    assert.ok(Array.isArray(known));
  } finally {
    await app.close();
  }
});

test('episodios: solo un moderador los crea y el balance une lo purgado con lo activo', async () => {
  const app = buildApp();
  try {
    const name = `Temporal de prueba ${tag}`;
    const body = { name, municipalities: [townA], startsOn: '2001-03-10', endsOn: '2001-03-11' };
    const post = (payload: unknown, headers: Record<string, string> = admin) =>
      app.inject({ method: 'POST', url: '/api/admin/episodes', headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });

    assert.strictEqual((await post(body, {})).statusCode, 401);
    assert.strictEqual((await post(body, { 'x-admin-token': 'malo' })).statusCode, 401);
    assert.strictEqual((await post({ ...body, municipalities: [] })).statusCode, 400);
    assert.strictEqual((await post({ ...body, endsOn: '2001-06-30' })).statusCode, 400, 'más de 62 días');
    assert.strictEqual((await post({ ...body, name: '??' })).statusCode, 400);

    const created = await post(body);
    assert.strictEqual(created.statusCode, 201, created.body);
    const slug = JSON.parse(created.body).data.slug as string;
    assert.ok(slug.includes(tag.toLowerCase()));
    assert.strictEqual((await post(body)).statusCode, 409, 'mismo nombre');

    // Un aviso activo hoy no entra en ese periodo; uno purgado antes de ayer sí.
    const old = await publish(app, 'old', 'arbol', townA, CONFIRMED_AT);
    await pool.query(`UPDATE incidents SET created_at = '2001-03-11 12:00:00+01', expires_at = '2001-03-12 12:00:00+01' WHERE id = $1`, [old]);
    await purgeExpiredIncidents();

    const detail = JSON.parse((await get(app, `/api/episodes/${slug}`)).body).data;
    assert.strictEqual(detail.name, name);
    assert.deepStrictEqual(detail.totals, { total: 10 + 4 + 5 + 1, confirmed: 6 + 1 + 3 + 1, verified: 2 + 0 + 1 + 1 });
    assert.deepStrictEqual(detail.byCategory[0], { category: 'arbol', total: 16, confirmed: 10, verified: 4 });
    assert.deepStrictEqual(detail.byDay.map((d: { day: string }) => d.day), ['2001-03-10', '2001-03-11']);
    assert.ok(!JSON.stringify(detail).includes(townB), 'otro municipio no cuenta');

    const list = JSON.parse((await get(app, '/api/episodes')).body).data as { slug: string }[];
    assert.ok(list.some((e) => e.slug === slug));
    assert.strictEqual((await get(app, '/api/episodes/no-existe')).statusCode, 404);

    assert.strictEqual((await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${slug}` })).statusCode, 401);
    assert.strictEqual((await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${slug}`, headers: admin })).statusCode, 200);
    assert.strictEqual((await get(app, `/api/episodes/${slug}`)).statusCode, 404);
  } finally {
    await app.close();
  }
});

test('un aviso aún activo cuenta hoy y no se duplica al purgarse', async () => {
  const app = buildApp();
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    const id = await publish(app, 'live', 'derrumbe', townB, 1);
    const q = `/api/stats/daily?from=${today}&to=${today}&municipality=${encodeURIComponent(townB)}&category=derrumbe`;

    const live = JSON.parse((await get(app, q)).body).data;
    assert.deepStrictEqual(live, [{ day: today, municipality: townB, category: 'derrumbe', total: 1, confirmed: 1, verified: 0 }]);

    // Al caducar pasa al recuento: la cifra no cambia.
    await pool.query(`UPDATE incidents SET created_at = NOW() - INTERVAL '100 hours', expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [id]);
    await purgeExpiredIncidents();
    const gone = await pool.query('SELECT 1 FROM incidents WHERE id = $1', [id]);
    assert.strictEqual(gone.rowCount, 0);
    const wide = `/api/stats/daily?from=${new Date(Date.now() - 6 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}&to=${today}&municipality=${encodeURIComponent(townB)}&category=derrumbe`;
    const after = JSON.parse((await get(app, wide)).body).data as { total: number }[];
    assert.strictEqual(after.reduce((s, r) => s + r.total, 0), 1);
  } finally {
    await app.close();
  }
});
