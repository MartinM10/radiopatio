import assert from 'node:assert';
import test from 'node:test';
import { HEX_RADIUS_METERS, snapToHexGrid } from '../lib/geo';

/** Generador pseudoaleatorio fijo (LCG): la prueba es reproducible. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const metersBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dy = (aLat - bLat) * 111320;
  const dx = (aLng - bLng) * 111320 * Math.cos(((aLat + bLat) / 2 * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

// Latitudes representativas: Canarias, Málaga, Madrid, Bilbao, A Coruña.
const ZONES: [string, number, number][] = [
  ['Canarias', 28.1, -15.4],
  ['Málaga', 36.72, -4.42],
  ['Madrid', 40.42, -3.7],
  ['Bilbao', 43.26, -2.93],
  ['A Coruña', 43.37, -8.4],
];

test('todos los puntos de una celda publican EXACTAMENTE el mismo centro', () => {
  // Regresión de privacidad: el ancho de columna se calculaba con la latitud
  // del punto, y el centro publicado variaba (hasta 35 valores y ~30 m dentro de
  // una celda de Málaga). Eso delataba la posición norte-sur del aviso.
  const rand = rng(42);
  for (const [name, lat0, lng0] of ZONES) {
    const centers = new Map<string, Set<string>>();
    for (let i = 0; i < 20000; i++) {
      const lat = lat0 + (rand() - 0.5) * 0.04;
      const lng = lng0 + (rand() - 0.5) * 0.04;
      const c = snapToHexGrid(lat, lng);
      if (!centers.has(c.key)) centers.set(c.key, new Set());
      centers.get(c.key)!.add(`${c.centerLat},${c.centerLng}`);
    }
    for (const [key, set] of centers) {
      assert.strictEqual(set.size, 1, `${name}: la celda ${key} publica ${set.size} centros distintos`);
    }
  }
});

test('el centro de una celda pertenece a su celda y queda a menos de 1,15 radios del punto', () => {
  const rand = rng(7);
  for (const [name, lat0, lng0] of ZONES) {
    for (let i = 0; i < 5000; i++) {
      const lat = lat0 + (rand() - 0.5) * 0.04;
      const lng = lng0 + (rand() - 0.5) * 0.04;
      const c = snapToHexGrid(lat, lng);
      const again = snapToHexGrid(c.centerLat, c.centerLng);
      assert.strictEqual(again.key, c.key, `${name}: el centro cae en otra celda`);
      assert.deepStrictEqual([again.centerLat, again.centerLng], [c.centerLat, c.centerLng]);
      // La celda se asigna redondeando fila y columna por separado (rectángulo
      // de √3·R × 1,5·R), no por vecindad hexagonal: el punto más lejano de su
      // centro está a √(0,75 + 0,5625)·R ≈ 1,146·R ≈ 516 m.
      const d = metersBetween(lat, lng, c.centerLat, c.centerLng);
      assert.ok(d <= HEX_RADIUS_METERS * 1.15, `${name}: el punto queda a ${d.toFixed(0)} m de su centro`);
    }
  }
});
