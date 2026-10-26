import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';

test.before(async () => {
  await runMigrations();
});

test.after(async () => {
  await pool.end();
});

test('POST /api/devices/register emite un token de un solo uso', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'POST', url: '/api/devices/register' });
    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.data.token, 'el token se devuelve una sola vez');
    assert.ok(body.data.deviceId, 'el deviceId se devuelve');
    assert.ok(!body.data.token.includes(' '), 'token sin espacios');

    // El token no se puede re-derivar: el servidor solo guarda su hash
    const { rows } = await pool.query('SELECT token_hash FROM devices WHERE id = $1', [body.data.deviceId]);
    assert.strictEqual(rows.length, 1);
    assert.notStrictEqual(rows[0].token_hash, body.data.token, 'el token crudo nunca se guarda');

    // GET /api/devices/status con el token confirma el registro
    const status = await app.inject({
      method: 'GET',
      url: '/api/devices/status',
      headers: { 'x-device-token': body.data.token },
    });
    assert.strictEqual(status.statusCode, 200);
    assert.strictEqual(JSON.parse(status.body).data.registered, true);

    // Sin token → no registrado
    const noToken = await app.inject({ method: 'GET', url: '/api/devices/status' });
    assert.strictEqual(JSON.parse(noToken.body).data.registered, false);

    // Limpieza
    await pool.query('DELETE FROM devices WHERE id = $1', [body.data.deviceId]);
  } finally {
    await app.close();
  }
});

test('POST /api/auth/google sin token → 400', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'POST', url: '/api/auth/google', payload: {} });
    assert.strictEqual(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('POST /api/auth/google con token inválido → 401', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'token-invalido-que-no-es-jwt' },
    });
    assert.strictEqual(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('POST /api/auth/otp/request sin proveedor → 501 con mensaje claro', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/otp/request',
      payload: { phone: '+34600123456' },
    });
    assert.strictEqual(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.ok(body.message.includes('SMS_PROVIDER') || body.message.includes('proveedor'));
  } finally {
    await app.close();
  }
});

test('GET /api/transparency devuelve agregados públicos', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/transparency' });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body).data;
    assert.ok(typeof body.incidents.active === 'number');
    assert.ok(typeof body.incidents.pending === 'number');
    assert.ok(typeof body.incidents.hidden === 'number');
    assert.ok(typeof body.incidents.total === 'number');
    assert.ok(typeof body.policy.ttlHours === 'number');
    assert.ok(typeof body.policy.quarantineThreshold === 'number');
  } finally {
    await app.close();
  }
});

test('POST /api/incidents/:id/appeal: solo el autor puede recurrir', async () => {
  const app = buildApp();
  try {
    const author = 'dev-appeal-author';
    const other = 'dev-appeal-other';
    const created = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: { 'x-device-id': author },
      payload: {
        category: 'vandalismo',
        zone: { lat: 36.75013, lng: -4.51007 },
        description: 'Aviso que será ocultado y luego recurrido por su autor',
      },
    });
    assert.strictEqual(created.statusCode, 201);
    const id = JSON.parse(created.body).data.id;

    // Ocultar con 3 denuncias de dispositivos distintos
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/incidents/${id}/flag`,
        headers: { 'x-device-id': `flagger-${i}-${Math.random().toString(36).slice(2, 8)}` },
      });
    }
    const hidden = await app.inject({ method: 'GET', url: '/api/incidents', headers: { 'x-device-id': author } });
    assert.ok(!JSON.parse(hidden.body).data.some((i: { id: string }) => i.id === id), 'oculto');

    // Otro dispositivo no puede recurrir
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/incidents/${id}/appeal`,
      headers: { 'x-device-id': other },
    });
    assert.strictEqual(forbidden.statusCode, 403);

    // El autor recurre → pasa a pending
    const appeal = await app.inject({
      method: 'POST',
      url: `/api/incidents/${id}/appeal`,
      headers: { 'x-device-id': author },
    });
    assert.strictEqual(appeal.statusCode, 200);
    assert.strictEqual(JSON.parse(appeal.body).status, 'pending');

    // Limpieza
    await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
  } finally {
    await app.close();
  }
});
