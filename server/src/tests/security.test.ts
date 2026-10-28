import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { config, productionConfigProblems } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { identityHashFor, issueDeviceForIdentity } from '../lib/device';
import { devHeaders, verifiedHeaders } from './helpers';

/**
 * Regresiones de seguridad: cada test reproduce un ataque real contra la
 * calidad del dato (identidades fabricadas, confirmaciones dobles, cuentas
 * sin verificar) y comprueba que ya no funciona.
 */

test.before(async () => {
  await runMigrations();
});

test.after(async () => {
  await pool.end();
});

/** Celda propia y lejana para no chocar con dedup ni cuarentena de otros tests. */
const uniqueZone = () => ({
  lat: 36.8 + Math.random() * 0.05,
  lng: -4.6 - Math.random() * 0.05,
});

const incidentPayload = () => ({
  category: 'vandalismo',
  zone: uniqueZone(),
  description: `Contenedores quemados en la plaza esta madrugada ${Math.random().toString(36).slice(2, 8)}`,
});

const uniqueSubject = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('Ataque Sybil por cabecera: sin token emitido por el servidor no se puede escribir', async () => {
  const app = buildApp();
  try {
    // Antes bastaba con inventar un X-Device-Id distinto en cada petición.
    for (const headers of [{}, { 'x-device-id': 'identidad-inventada' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/incidents', headers, payload: incidentPayload() });
      assert.strictEqual(res.statusCode, 401, res.body);
      assert.strictEqual(JSON.parse(res.body).error, 'DEVICE_TOKEN_REQUIRED');
    }

    for (const action of ['confirm', 'flag', 'appeal']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/incidents/cualquiera/${action}`,
        headers: { 'x-device-id': 'identidad-inventada' },
      });
      assert.strictEqual(res.statusCode, 401, `${action}: ${res.body}`);
    }

    const forged = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: { 'x-device-token': 'token-que-el-servidor-nunca-emitio' },
      payload: incidentPayload(),
    });
    assert.strictEqual(forged.statusCode, 401);
    assert.strictEqual(JSON.parse(forged.body).error, 'INVALID_DEVICE_TOKEN');
  } finally {
    await app.close();
  }
});

test('Con un token válido se publica con normalidad', async () => {
  const app = buildApp();
  let id: string | undefined;
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders(uniqueSubject('autor')),
      payload: incidentPayload(),
    });
    assert.strictEqual(res.statusCode, 201, res.body);
    id = JSON.parse(res.body).data.id;
  } finally {
    if (id) await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    await app.close();
  }
});

test('Identidad verificada: una cuenta = un dispositivo; un nuevo login rota el token', async () => {
  const identity = identityHashFor('test', uniqueSubject('rotacion'));
  const first = await issueDeviceForIdentity(identity);
  const second = await issueDeviceForIdentity(identity);
  try {
    assert.strictEqual(second.deviceId, first.deviceId, 'mismo dispositivo para la misma cuenta');
    assert.notStrictEqual(second.token, first.token, 'token nuevo');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM devices WHERE identity_hash = $1', [identity]);
    assert.strictEqual(rows[0].n, 1, 'nunca dos filas para la misma identidad');

    const app = buildApp();
    try {
      const old = await app.inject({
        method: 'GET',
        url: '/api/devices/status',
        headers: { 'x-device-token': first.token },
      });
      assert.strictEqual(JSON.parse(old.body).data.registered, false, 'el token anterior queda invalidado');
      const current = await app.inject({
        method: 'GET',
        url: '/api/devices/status',
        headers: { 'x-device-token': second.token },
      });
      assert.deepStrictEqual(JSON.parse(current.body).data, { registered: true, verified: true });
    } finally {
      await app.close();
    }
  } finally {
    await pool.query('DELETE FROM devices WHERE identity_hash = $1', [identity]);
  }
});

test('Volver a iniciar sesión no permite confirmar dos veces el mismo aviso', async () => {
  const app = buildApp();
  const subject = uniqueSubject('doble-confirmacion');
  let id: string | undefined;
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders(uniqueSubject('autor')),
      payload: incidentPayload(),
    });
    assert.strictEqual(created.statusCode, 201, created.body);
    id = JSON.parse(created.body).data.id;

    const once = await app.inject({ method: 'POST', url: `/api/incidents/${id}/confirm`, headers: await verifiedHeaders(subject) });
    assert.strictEqual(once.statusCode, 200, once.body);

    // Mismo usuario, nuevo token (reinstala la app o vuelve a hacer login).
    const again = await app.inject({ method: 'POST', url: `/api/incidents/${id}/confirm`, headers: await verifiedHeaders(subject) });
    assert.strictEqual(again.statusCode, 409, again.body);
    assert.strictEqual(JSON.parse(again.body).error, 'ALREADY_CONFIRMED');
  } finally {
    if (id) await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    await pool.query('DELETE FROM devices WHERE identity_hash = $1', [identityHashFor('test', subject)]);
    await app.close();
  }
});

test('Alta de dispositivos anónimos limitada por IP', async () => {
  const previous = config.registerRateMax;
  config.registerRateMax = 2;
  const app = buildApp();
  const created: string[] = [];
  try {
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/devices/register' });
      codes.push(res.statusCode);
      if (res.statusCode === 201) created.push(JSON.parse(res.body).data.deviceId);
    }
    assert.deepStrictEqual(codes, [201, 201, 429]);
  } finally {
    config.registerRateMax = previous;
    if (created.length) await pool.query('DELETE FROM devices WHERE id = ANY($1)', [created]);
    await app.close();
  }
});

test('Con REQUIRE_VERIFIED_IDENTITY, un dispositivo anónimo no puede escribir', async () => {
  const previous = config.requireVerifiedIdentity;
  config.requireVerifiedIdentity = true;
  const app = buildApp();
  const subject = uniqueSubject('verificado');
  let id: string | undefined;
  try {
    const anon = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders(uniqueSubject('anonimo')),
      payload: incidentPayload(),
    });
    assert.strictEqual(anon.statusCode, 403, anon.body);
    assert.strictEqual(JSON.parse(anon.body).error, 'IDENTITY_REQUIRED');

    const verified = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await verifiedHeaders(subject),
      payload: incidentPayload(),
    });
    assert.strictEqual(verified.statusCode, 201, verified.body);
    id = JSON.parse(verified.body).data.id;
  } finally {
    config.requireVerifiedIdentity = previous;
    if (id) await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    await pool.query('DELETE FROM devices WHERE identity_hash = $1', [identityHashFor('test', subject)]);
    await app.close();
  }
});

test('Login con Google sin GOOGLE_CLIENT_ID → rechazado (fail-closed)', async () => {
  const previous = config.googleClientId;
  config.googleClientId = '';
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'un-token-de-google-de-otra-aplicacion' },
    });
    assert.strictEqual(res.statusCode, 503, res.body);
    assert.strictEqual(JSON.parse(res.body).error, 'AUTH_NOT_CONFIGURED');
    assert.ok(!JSON.parse(res.body).data, 'no emite ningún token');
  } finally {
    config.googleClientId = previous;
    await app.close();
  }
});

test('SMS: aunque haya proveedor configurado, verify nunca emite cuenta sin verificar el código', async () => {
  const previous = process.env.SMS_PROVIDER;
  process.env.SMS_PROVIDER = 'cualquiera';
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/otp/verify',
      payload: { phone: '600000000', code: '0000' },
    });
    assert.strictEqual(res.statusCode, 501, res.body);
    assert.ok(!JSON.parse(res.body).data, 'no emite ningún token');
  } finally {
    if (previous === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = previous;
    await app.close();
  }
});

test('Producción no arranca con secretos por defecto o débiles', () => {
  const strong = 'x'.repeat(48);
  const good = {
    env: 'production',
    databaseUrl: 'postgres://u:p@db:5432/prod',
    deviceSalt: strong,
    adminToken: strong,
  };
  assert.deepStrictEqual(productionConfigProblems(good), []);

  const defaults = {
    env: 'production',
    databaseUrl: 'postgres://radiopatio:radiopatio_dev_secret@localhost:5432/radiopatio',
    deviceSalt: 'radiopatio_anonymous_salt_change_in_production',
    adminToken: 'radiopatio_admin_dev_change_me',
  };
  assert.strictEqual(productionConfigProblems(defaults).length, 3);
  assert.strictEqual(productionConfigProblems({ ...good, adminToken: 'corto' }).length, 1);

  // En desarrollo los valores por defecto son aceptables.
  assert.deepStrictEqual(productionConfigProblems({ ...defaults, env: 'development' }), []);
});

test('Borrar mi identidad elimina el dispositivo, sus avisos y sus confirmaciones', async () => {
  const app = buildApp();
  const mine = await verifiedHeaders(uniqueSubject('supresion'));
  const other = await devHeaders(uniqueSubject('otro-vecino'));
  let theirs: string | undefined;
  let mineId: string | undefined;
  try {
    const own = await app.inject({ method: 'POST', url: '/api/incidents', headers: mine, payload: incidentPayload() });
    assert.strictEqual(own.statusCode, 201, own.body);
    mineId = JSON.parse(own.body).data.id;

    const foreign = await app.inject({ method: 'POST', url: '/api/incidents', headers: other, payload: incidentPayload() });
    assert.strictEqual(foreign.statusCode, 201, foreign.body);
    theirs = JSON.parse(foreign.body).data.id;
    const confirm = await app.inject({ method: 'POST', url: `/api/incidents/${theirs}/confirm`, headers: mine });
    assert.strictEqual(confirm.statusCode, 200, confirm.body);

    const del = await app.inject({ method: 'DELETE', url: '/api/devices/me', headers: mine });
    assert.strictEqual(del.statusCode, 200, del.body);

    const status = await app.inject({ method: 'GET', url: '/api/devices/status', headers: mine });
    assert.strictEqual(JSON.parse(status.body).data.registered, false, 'el token deja de valer');
    const gone = await pool.query('SELECT 1 FROM incidents WHERE id = $1', [mineId]);
    assert.strictEqual(gone.rowCount, 0, 'su aviso se elimina');
    const conf = await pool.query('SELECT 1 FROM incident_confirmations WHERE incident_id = $1', [theirs]);
    assert.strictEqual(conf.rowCount, 0, 'su confirmación se elimina');
    const kept = await pool.query('SELECT confirmations_count FROM incidents WHERE id = $1', [theirs]);
    assert.strictEqual(kept.rows[0].confirmations_count, 0, 'el contador del aviso ajeno se corrige');

    const again = await app.inject({ method: 'DELETE', url: '/api/devices/me', headers: mine });
    assert.strictEqual(again.statusCode, 401, 'sin identidad no hay nada que borrar');
  } finally {
    await pool.query('DELETE FROM incidents WHERE id = ANY($1::text[])', [[mineId, theirs].filter(Boolean)]);
    await app.close();
  }
});
