import assert from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findDuplicate,
  levelForScore,
  textSimilarity,
  trustWeight,
  type DedupRecord,
} from '../lib/quality';
import { SCHEMA_SQL } from '../db/schema';
import { snapToHexGrid } from '../lib/geo';

test('db: schema.sql y SCHEMA_SQL (schema.ts) no divergen', () => {
  // Source of truth duplicado: este guard evita que en un futuro alguien
  // añada una migración en un archivo y no en el otro (trap 42703).
  const sqlFile = readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'), 'utf8');
  const normalize = (s: string) =>
    s
      .replace(/--[^\n]*\n/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  assert.strictEqual(normalize(sqlFile), normalize(SCHEMA_SQL));
});


const rec = (id: string, cellKey: string, category: string, description: string, minutesAgo: number): DedupRecord => ({
  id,
  cellKey,
  category: category as DedupRecord['category'],
  description,
  createdAt: Date.now() - minutesAgo * 60_000,
});

test('textSimilarity: idénticos = 1, sin solape = 0', () => {
  assert.strictEqual(textSimilarity('Han roto la ventana del portal', 'Han roto la ventana del portal'), 1);
  assert.strictEqual(textSimilarity('pintadas en el muro', 'venta de coches en la plaza'), 0);
});

test('textSimilarity: invariante a plurales, acentos y mayúsculas', () => {
  assert.strictEqual(textSimilarity('Carteristas en el mercado', 'Carterista en el mercado'), 1);
  assert.strictEqual(textSimilarity('Pintadas en el muro', 'PINTADAS EN EL MURO'), 1);
});

test('textSimilarity: el umbral 0.75 marca la frontera', () => {
  const a = 'pelea en la puerta del bar';
  assert.strictEqual(textSimilarity(a, 'pelea en la entrada del bar'), 0.75);
  assert.strictEqual(textSimilarity(a, 'pelea en la terraza del barrio'), 0.5);
});

test('findDuplicate: detecta el aviso casi idéntico reciente en la misma celda', () => {
  const cell = snapToHexGrid(36.7215, -4.4215).key;
  const hit = findDuplicate(
    [rec('a', cell, 'hurto', 'Carteristas en la entrada del mercado central', 10)],
    { cellKey: cell, category: 'hurto', description: 'Carteristas en la entrada del mercado' },
    Date.now(),
  );
  assert.ok(hit);
  assert.strictEqual(hit.minutesAgo, 10);
});

test('findDuplicate: no bloquea celdas distintas, categorías distintas o textos distintos', () => {
  const cellA = snapToHexGrid(36.7215, -4.4215).key;
  const cellB = snapToHexGrid(36.7100, -4.5150).key;
  const records = [rec('a', cellA, 'hurto', 'Carteristas en la entrada del mercado', 10)];
  assert.strictEqual(
    findDuplicate(records, { cellKey: cellB, category: 'hurto', description: 'Carteristas en la entrada del mercado' }, Date.now()),
    null,
  );
  assert.strictEqual(
    findDuplicate(records, { cellKey: cellA, category: 'vandalismo', description: 'Carteristas en la entrada del mercado' }, Date.now()),
    null,
  );
  assert.strictEqual(
    findDuplicate(records, { cellKey: cellA, category: 'hurto', description: 'Venta de bicicletas de segunda mano frente alonomico parque' }, Date.now()),
    null,
  );
  // fuera de la ventana de 45 min
  const old = [rec('b', cellA, 'hurto', 'Carteristas en la entrada del mercado', 46)];
  assert.strictEqual(
    findDuplicate(old, { cellKey: cellA, category: 'hurto', description: 'Carteristas en la entrada del mercado' }, Date.now()),
    null,
  );
});

test('geo: snapToHexGrid idempotente sobre el centro de la celda (misma clave)', () => {
  const first = snapToHexGrid(36.7215, -4.4215);
  const again = snapToHexGrid(first.centerLat, first.centerLng);
  assert.strictEqual(again.key, first.key);
});

test('trustWeight: confirmado = 1, sin confirmar = 0.5', () => {
  assert.strictEqual(trustWeight({ confirmations: 2 }), 1);
  assert.strictEqual(trustWeight({ confirmations: 1 }), 0.5);
});

test('levelForScore: fronteras del nivel de alerta (solo confirmados cuentan)', () => {
  assert.strictEqual(levelForScore(0), 'tranquilo');
  assert.strictEqual(levelForScore(3), 'moderado');
  assert.strictEqual(levelForScore(4), 'atencion');
  assert.strictEqual(levelForScore(8), 'atencion');
  assert.strictEqual(levelForScore(9), 'alerta');
});
