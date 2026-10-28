import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { devHeaders } from './helpers';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { snapToHexGrid } from '../lib/geo';
import { heuristicProvider } from '../lib/judge';

test.before(async () => {
  await runMigrations();
});

test.after(async () => {
  await pool.end();
});

const BASE_LAT = 36.75013;
const BASE_LNG = -4.51007;

test('juez secundario: desactivado por defecto, no puntúa ni modifica la fila', async () => {
  const app = buildApp();
  const ids: string[] = [];
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders(`judge-dev-${Math.random().toString(36).slice(2, 10)}`),
      payload: {
        category: 'vandalismo',
        zone: { lat: BASE_LAT, lng: BASE_LNG },
        description: 'Pintadas nuevas en la fachada del edificio del casco viejo',
      },
    });
    assert.strictEqual(res.statusCode, 201, res.body);
    const id = JSON.parse(res.body).data.id;
    ids.push(id);

    await new Promise((r) => setTimeout(r, 200));

    const { rows } = await pool.query('SELECT judge_score, judge_reason FROM incidents WHERE id = $1', [id]);
    assert.strictEqual(rows[0].judge_score, null);
    assert.strictEqual(rows[0].judge_reason, null);
  } finally {
    await pool.query('DELETE FROM incidents WHERE id = ANY($1)', [ids]);
    await app.close();
  }
});

test('juez secundario: el contrato JudgeResult se respeta al puntuar con un proveedor', async () => {
  const { runJudge } = await import('../lib/judge');
  const fakeProvider = async (_text: string, category: string) => ({
    score: 0.1,
    reason: `test:${category}`,
  });
  process.env.JUDGE_ENABLED = '1';
  const id = `judge-test-${Math.random().toString(36).slice(2, 10)}`;
  const hex = snapToHexGrid(BASE_LAT, BASE_LNG);
  try {
    await pool.query(
      `INSERT INTO incidents (id, category, grid_x, grid_y, description, created_at, device_hash, lat, lng, hex_key, hex_lat, hex_lng)
       VALUES ($1, 'vandalismo', 0, 0, 'pintadas en la fachada', NOW(), 'test', $2, $3, $4, $5, $6)`,
      [id, BASE_LAT, BASE_LNG, hex.key, hex.centerLat, hex.centerLng],
    );
    const result = await runJudge(id, 'pintadas en la fachada', 'vandalismo', fakeProvider);
    assert.ok(result);
    assert.strictEqual(result?.score, 0.1);
    assert.strictEqual(result?.reason, 'test:vandalismo');

    const { rows } = await pool.query('SELECT judge_score, judge_reason FROM incidents WHERE id = $1', [id]);
    assert.strictEqual(Number(rows[0].judge_score), 0.1);
    assert.strictEqual(rows[0].judge_reason, 'test:vandalismo');
  } finally {
    await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    process.env.JUDGE_ENABLED = '0';
  }
});

test('juez heurístico: puntúa sin modelo externo cuando JUDGE_ENABLED=1', async () => {
  const { runJudge } = await import('../lib/judge');
  process.env.JUDGE_ENABLED = '1';
  const id = `judge-heur-${Math.random().toString(36).slice(2, 10)}`;
  const hex = snapToHexGrid(BASE_LAT, BASE_LNG);
  try {
    await pool.query(
      `INSERT INTO incidents (id, category, grid_x, grid_y, description, created_at, device_hash, lat, lng, hex_key, hex_lat, hex_lng)
       VALUES ($1, 'vandalismo', 0, 0, 'PINTADAS EN LA FACHADA DEL EDIFICIO DEL CASCO VIEJO!!!', NOW(), 'test', $2, $3, $4, $5, $6)`,
      [id, BASE_LAT, BASE_LNG, hex.key, hex.centerLat, hex.centerLng],
    );
    const result = await runJudge(id, 'PINTADAS EN LA FACHADA DEL EDIFICIO DEL CASCO VIEJO!!!', 'vandalismo', heuristicProvider);
    assert.ok(result);
    // Mayúsculas excesivas + emoji spam → score > 0
    assert.ok(result!.score > 0, `score debería ser > 0, got ${result!.score}`);
    assert.ok(result!.reason.includes('mayusculas'), `reason debería incluir 'mayusculas', got ${result!.reason}`);

    const { rows } = await pool.query('SELECT judge_score, judge_reason FROM incidents WHERE id = $1', [id]);
    assert.ok(Number(rows[0].judge_score) > 0);
  } finally {
    await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    process.env.JUDGE_ENABLED = '0';
  }
});

test('juez heurístico: texto normal obtiene score bajo', async () => {
  const result = await heuristicProvider('Pintadas menores en la pared del portal', 'vandalismo');
  assert.ok(result.score < 0.3, `score debería ser bajo, got ${result.score}`);
  assert.strictEqual(result.reason, 'ok');
});

test('juez heurístico: texto con números y lenguaje ofensivo obtiene score alto', async () => {
  const result = await heuristicProvider('Llamadme al 600123456, el chorizo del barrio', 'sospechoso');
  assert.ok(result.score >= 0.5, `score debería ser alto, got ${result.score}`);
  assert.ok(result.reason.includes('numeros'));
  assert.ok(result.reason.includes('lenguaje-ofensivo'));
});
