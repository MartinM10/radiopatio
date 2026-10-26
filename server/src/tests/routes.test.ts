import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { pool } from '../db';

test.after(async () => {
  await pool.end();
});

test('Fastify app starts and responds to /api/categories', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/api/categories',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 14);
    assert.strictEqual(body.data[0].id, 'hogar');
  } finally {
    await app.close();
  }
});

test('Fastify app validates incident creation schema', async () => {
  const app = buildApp();
  try {
    // Missing fields
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      payload: {},
    });

    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});

test('Fastify app rejects privacy violations on POST /api/incidents', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      payload: {
        category: 'hogar',
        zone: { gx: 3, gy: 3 },
        description: 'Llamadme al 612345678 para más detalles sobre el incidente',
      },
    });

    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'PRIVACY_VIOLATION');
    assert.ok(body.message.includes('números de teléfono'));
  } finally {
    await app.close();
  }
});

test('Fastify app accepts empty body with application/json header', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents/non-existent-id/confirm',
      headers: {
        'content-type': 'application/json',
      },
      payload: '',
    });

    // Should not fail with FST_ERR_CTP_EMPTY_JSON_BODY (which returns 400 with "Body cannot be empty")
    // It should proceed to route logic (e.g. 404 INCIDENT_NOT_FOUND if DB connected or 500 DB error)
    assert.notStrictEqual(res.statusCode, 400);
  } finally {
    await app.close();
  }
});
