import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { config } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { purgeExpiredIncidents } from '../db/purge';
import { extendedExpiry, extensionHours, inExtensionWindow } from '../lib/lifetime';
import { setPushSender } from '../lib/notify';
import { CONFIRMED_AT } from '../lib/quality';
import { devHeaders } from './helpers';

const H = 3_600_000;
const tag = Math.random().toString(36).slice(2, 8);

// Duración base por categoría. La app tiene la misma tabla en su test: si cambia una, cambia la otra.
const TTL: Record<string, number> = {
  hogar: 72, vehiculo: 72, hurto: 72, agresion: 72, vandalismo: 72, sospechoso: 24, altercado: 12,
  corte_agua: 48, corte_luz: 48, alumbrado: 168, calzada: 168, limpieza: 168, perdido: 168,
  inundacion: 24, incendio: 12, derrumbe: 168, arbol: 48, calle_cortada: 168, otro: 72,
};

test.before(async () => {
  await runMigrations();
  setPushSender(async () => ({ invalidTokens: [] }));
});

test.after(async () => {
  setPushSender(null);
  await pool.end();
});

const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
let n = 0;
const spot = () => ({ lat: baseLat + ++n * 0.02, lng: baseLng });
const words = () => `Aviso de prueba de duracion ${tag} ${n} ${Math.random().toString(36).slice(2)} xqz`;

async function publish(app: ReturnType<typeof buildApp>, label: string, category: string, zone = spot()) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers: await devHeaders(`${label}-${tag}`),
    payload: { category, zone, description: words() },
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  return JSON.parse(res.body).data as { id: string; expiresAt: number; resolved: boolean; status: string };
}

const row = async (id: string) =>
  (await pool.query('SELECT created_at, expires_at, resolved_at, lat, lng, hex_key FROM incidents WHERE id = $1', [id])).rows[0] as
    | { created_at: Date; expires_at: Date; resolved_at: Date | null; lat: number | null; lng: number | null; hex_key: string }
    | undefined;

const post = async (app: ReturnType<typeof buildApp>, url: string, label: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: { ...(await devHeaders(`${label}-${tag}`)), 'content-type': 'application/json' }, payload: payload === undefined ? undefined : JSON.stringify(payload) });

/** Deja un aviso con `left` ms de vida y `age` ms de antigüedad. */
const age = (id: string, ageMs: number, leftMs: number) =>
  pool.query(`UPDATE incidents SET created_at = NOW() - make_interval(secs => $2), expires_at = NOW() + make_interval(secs => $3) WHERE id = $1`, [id, ageMs / 1000, leftMs / 1000]);

test('cada categoría tiene su duración y la API la publica', async () => {
  const app = buildApp();
  try {
    const cats = JSON.parse((await app.inject({ method: 'GET', url: '/api/categories' })).body).data as { id: string; ttlHours: number }[];
    assert.deepStrictEqual(Object.fromEntries(cats.map((c) => [c.id, c.ttlHours])), TTL);
  } finally {
    await app.close();
  }
});

test('un aviso nace con la caducidad de su categoría', async () => {
  const app = buildApp();
  try {
    for (const category of ['altercado', 'arbol', 'perdido']) {
      const created = await publish(app, `ttl-${category}`, category);
      const r = (await row(created.id))!;
      assert.ok(Math.abs(new Date(r.expires_at).getTime() - new Date(r.created_at).getTime() - TTL[category] * H) < 2000, category);
      assert.ok(Math.abs(created.expiresAt - new Date(r.expires_at).getTime()) < 2000, 'la respuesta lleva expiresAt');
      assert.strictEqual(created.resolved, false);
    }
  } finally {
    await app.close();
  }
});

test('un aviso caducado deja de verse y de usarse antes incluso de purgarse', async () => {
  const app = buildApp();
  try {
    const created = await publish(app, 'expired', 'arbol');
    const inList = async () =>
      (JSON.parse((await app.inject({ method: 'GET', url: '/api/incidents' })).body).data as { id: string }[]).some((i) => i.id === created.id);
    assert.ok(await inList());

    await pool.query(`UPDATE incidents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [created.id]);
    assert.ok(!(await inList()), 'fuera de la lista');
    for (const url of [`/api/incidents/${created.id}`, `/api/incidents/${created.id}/messages`, `/api/incidents/${created.id}/photo`]) {
      assert.strictEqual((await app.inject({ method: 'GET', url })).statusCode, 404, url);
    }
    assert.strictEqual((await post(app, `/api/incidents/${created.id}/confirm`, 'expired-vecino')).statusCode, 404, 'ya no se confirma');
  } finally {
    await app.close();
  }
});

test('la purga manda por expires_at y la posición exacta cae a las 72 h aunque el aviso siga', async () => {
  const app = buildApp();
  try {
    const long = await publish(app, 'purge-long', 'calzada'); // 7 días
    const gone = await publish(app, 'purge-gone', 'calzada');
    await age(long.id, 80 * H, 80 * H); // publicado hace 80 h, le quedan 80 h
    await age(gone.id, 10 * H, -1000); // publicado hace 10 h, caducó hace un segundo
    await purgeExpiredIncidents();

    assert.strictEqual(await row(gone.id), undefined, 'caducado: se borra aunque sea reciente');
    const kept = (await row(long.id))!;
    assert.ok(kept, 'un aviso de 7 días sobrevive a las 72 h');
    assert.strictEqual(kept.lat, null, 'la posición exacta ya no existe');
    assert.strictEqual(kept.lng, null);
    assert.ok(kept.hex_key, 'la celda pública sigue');
    assert.strictEqual((await app.inject({ method: 'GET', url: `/api/incidents/${long.id}` })).statusCode, 200);

    // Uno reciente conserva su posición exacta (solo la necesita el anti-fraude 72 h).
    const fresh = await publish(app, 'purge-fresh', 'calzada');
    await purgeExpiredIncidents();
    assert.notStrictEqual((await row(fresh.id))!.lat, null);
  } finally {
    await app.close();
  }
});

test('el autor da su aviso por resuelto: desaparece en 2 horas y nadie más puede', async () => {
  const app = buildApp();
  try {
    const created = await publish(app, 'res-author', 'arbol');
    assert.strictEqual((await post(app, `/api/incidents/${created.id}/resolve`, 'res-otro')).statusCode, 403);
    assert.strictEqual((await post(app, `/api/incidents/no-existe/resolve`, 'res-author')).statusCode, 404);

    const ok = await post(app, `/api/incidents/${created.id}/resolve`, 'res-author');
    assert.strictEqual(ok.statusCode, 200, ok.body);
    const data = JSON.parse(ok.body).data as { resolved: boolean; expiresAt: number };
    assert.strictEqual(data.resolved, true);
    assert.ok(data.expiresAt - Date.now() <= 2 * H + 2000 && data.expiresAt - Date.now() > H, 'a unas 2 horas');

    const one = JSON.parse((await app.inject({ method: 'GET', url: `/api/incidents/${created.id}` })).body).data as { resolved: boolean };
    assert.strictEqual(one.resolved, true, 'los demás lo ven como resuelto');
    // Repetirlo no alarga nada.
    const again = JSON.parse((await post(app, `/api/incidents/${created.id}/resolve`, 'res-author')).body).data as { expiresAt: number };
    assert.ok(again.expiresAt <= data.expiresAt + 1000);
  } finally {
    await app.close();
  }
});

test('«¿sigue ahí?»: solo amplía en la segunda mitad, una vez por cuenta y con tope', async () => {
  const app = buildApp();
  try {
    const created = await publish(app, 'here-author', 'arbol'); // 48 h
    const ttl = TTL.arbol;
    const url = `/api/incidents/${created.id}/still-there`;

    assert.strictEqual((await post(app, url, 'here-author', { here: true })).statusCode, 403, 'el autor no vota');
    assert.strictEqual((await post(app, url, 'here-a', { here: 'si' })).statusCode, 400);

    // Recién publicado: el voto se registra pero no amplía.
    const early = JSON.parse((await post(app, url, 'here-a', { here: true })).body).data as { extended: boolean };
    assert.strictEqual(early.extended, false);

    // Cada cuenta ve su propia respuesta y nadie más la ve.
    const seenBy = async (label: string) =>
      (JSON.parse((await app.inject({ method: 'GET', url: `/api/incidents/${created.id}`, headers: await devHeaders(`${label}-${tag}`) })).body).data as { presenceVote?: boolean }).presenceVote;
    assert.strictEqual(await seenBy('here-a'), true);
    assert.strictEqual(await seenBy('here-otro'), undefined);
    const listed = (JSON.parse((await app.inject({ method: 'GET', url: '/api/incidents', headers: await devHeaders(`here-a-${tag}`) })).body).data as { id: string; presenceVote?: boolean }[]).find((i) => i.id === created.id);
    assert.strictEqual(listed?.presenceVote, true, 'también en la lista');

    // En la segunda mitad de su vida, otra cuenta sí amplía la mitad de su duración base.
    await age(created.id, 40 * H, 8 * H);
    const before = new Date((await row(created.id))!.expires_at).getTime();
    const first = JSON.parse((await post(app, url, 'here-b', { here: true })).body).data as { extended: boolean; expiresAt: number };
    assert.strictEqual(first.extended, true);
    assert.ok(Math.abs(first.expiresAt - (before + (ttl / 2) * H)) < 2000);

    // La misma cuenta no amplía dos veces.
    const dup = JSON.parse((await post(app, url, 'here-b', { here: true })).body).data as { extended: boolean };
    assert.strictEqual(dup.extended, false);

    // Tope: nunca más de 3 veces su duración base desde que se publicó.
    await age(created.id, 100 * H, 1 * H);
    const capped = JSON.parse((await post(app, url, 'here-c', { here: true })).body).data as { extended: boolean; expiresAt: number };
    const created_at = new Date((await row(created.id))!.created_at).getTime();
    assert.ok(capped.expiresAt <= created_at + 3 * ttl * H + 1000, 'no pasa del tope');
  } finally {
    await app.close();
  }
});

test('«ya no está»: se cierra con VERIFIED_AT vecinos distintos y si superan a los que dicen que sigue', async () => {
  const app = buildApp();
  try {
    const created = await publish(app, 'gone-author', 'arbol');
    const url = `/api/incidents/${created.id}/still-there`;
    const vote = async (who: string, here: boolean) => JSON.parse((await post(app, url, who, { here })).body).data as { resolved: boolean };

    // Con pocos «ya no está» no se cierra, y con tantos «sigue» como «ya no está» (empate) tampoco.
    for (let k = 1; k <= CONFIRMED_AT; k++) await vote(`gone-stays-${k}`, true);
    for (let k = 1; k < CONFIRMED_AT; k++) assert.strictEqual((await vote(`gone-${k}`, false)).resolved, false, `con ${k} no basta`);
    assert.strictEqual((await vote(`gone-${CONFIRMED_AT}`, false)).resolved, false, 'empate: no se cierra');
    const closed = await vote(`gone-${CONFIRMED_AT + 1}`, false);
    assert.strictEqual(closed.resolved, true);

    const one = JSON.parse((await app.inject({ method: 'GET', url: `/api/incidents/${created.id}` })).body).data as { resolved: boolean; expiresAt: number };
    assert.strictEqual(one.resolved, true);
    assert.ok(one.expiresAt - Date.now() <= 2 * H + 2000);
  } finally {
    await app.close();
  }
});

test('borrar mi identidad borra mis votos de «¿sigue ahí?»', async () => {
  const app = buildApp();
  try {
    const created = await publish(app, 'vote-del-author', 'arbol');
    await post(app, `/api/incidents/${created.id}/still-there`, 'vote-del-leaver', { here: false });
    const count = async () => (await pool.query('SELECT count(*)::int AS n FROM incident_presence_votes WHERE incident_id = $1', [created.id])).rows[0].n as number;
    assert.strictEqual(await count(), 1);
    const del = await app.inject({ method: 'DELETE', url: '/api/devices/me', headers: await devHeaders(`vote-del-leaver-${tag}`) });
    assert.strictEqual(del.statusCode, 200);
    assert.strictEqual(await count(), 0);
  } finally {
    await app.close();
  }
});

test('las emergencias no entran en cuarentena por ráfaga; el resto sí', async () => {
  const app = buildApp();
  const prev = config.quarantineThreshold;
  config.quarantineThreshold = 2;
  try {
    const cell = spot();
    const common = [];
    for (const [i, category] of (['vandalismo', 'sospechoso', 'altercado', 'hurto'] as const).entries()) {
      common.push(await publish(app, `quar-${i}`, category, cell));
    }
    assert.deepStrictEqual(common.map((c) => c.status), ['active', 'active', 'pending', 'pending']);

    const stormCell = spot();
    const storm = [];
    for (const [i, category] of (['inundacion', 'incendio', 'derrumbe', 'arbol', 'calle_cortada'] as const).entries()) {
      storm.push(await publish(app, `storm-${i}`, category, stormCell));
    }
    assert.ok(storm.every((s) => s.status === 'active'), 'todas visibles y contadas');
  } finally {
    config.quarantineThreshold = prev;
    await app.close();
  }
});

test('el nivel de zona solo cuenta avisos de seguridad: una farola verificada no lo mueve', async () => {
  const app = buildApp();
  try {
    const level = async (cell: { lat: number; lng: number }) =>
      JSON.parse((await app.inject({ method: 'GET', url: `/api/zones/alert?lat=${cell.lat}&lng=${cell.lng}` })).body) as { score: number; level: string; confirmedCount: number };
    const verify = async (id: string, who: string) => {
      for (let k = 1; k <= CONFIRMED_AT; k++) assert.strictEqual((await post(app, `/api/incidents/${id}/confirm`, `${who}-${k}`)).statusCode, 200);
    };

    const lampCell = spot();
    const lamp = await publish(app, 'zone-lamp', 'alumbrado', lampCell);
    await verify(lamp.id, 'zone-lamp-v');
    const lampZone = await level(lampCell);
    assert.strictEqual(lampZone.confirmedCount, 1, 'está verificada');
    assert.deepStrictEqual([lampZone.score, lampZone.level], [0, 'tranquilo'], 'pero no es un dato de seguridad');

    const hitCell = spot();
    const hit = await publish(app, 'zone-hit', 'agresion', hitCell);
    await verify(hit.id, 'zone-hit-v');
    const hitZone = await level(hitCell);
    assert.deepStrictEqual([hitZone.score, hitZone.level], [3, 'atencion'], 'una agresión verificada ya es «atención»');
  } finally {
    await app.close();
  }
});

test('la configuración pública lleva el umbral de verificación', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    assert.strictEqual(res.statusCode, 200);
    const data = JSON.parse(res.body).data as { verifiedAt: number; defaultTtlHours: number };
    assert.strictEqual(data.verifiedAt, CONFIRMED_AT);
    assert.strictEqual(data.defaultTtlHours, config.incidentTtlHours);
  } finally {
    await app.close();
  }
});

test('lib/lifetime: la ampliación es la mitad de la duración, con ventana y tope', () => {
  assert.strictEqual(extensionHours(48), 24);
  assert.strictEqual(extensionHours(25), 13);
  assert.ok(inExtensionWindow(48, 24 * H));
  assert.ok(!inExtensionWindow(48, 24 * H + 1));
  const created = new Date('2026-01-01T00:00:00Z');
  const expires = new Date(created.getTime() + 48 * H);
  assert.strictEqual(extendedExpiry(created, expires, 48).getTime(), expires.getTime() + 24 * H);
  const nearCap = new Date(created.getTime() + 140 * H);
  assert.strictEqual(extendedExpiry(created, nearCap, 48).getTime(), created.getTime() + 144 * H, 'tope 3 × 48 h');
  const pastCap = new Date(created.getTime() + 150 * H);
  assert.strictEqual(extendedExpiry(created, pastCap, 48).getTime(), pastCap.getTime(), 'nunca acorta');
});
