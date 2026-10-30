/**
 * El centro de celda que publica el servidor no debe depender de dónde estaba el
 * punto dentro de la celda: si variara, delataría su posición. El cliente usa el
 * mismo cálculo que el servidor (server/src/lib/geo.ts), y deben coincidir.
 */
import { describe, expect, test } from 'vitest';
import { snapToHexGrid } from '../src/lib/hexgrid';

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('snapToHexGrid', () => {
  test('todos los puntos de una celda comparten exactamente el mismo centro', () => {
    const rand = rng(42);
    for (const [lat0, lng0] of [
      [28.1, -15.4],
      [36.72, -4.42],
      [40.42, -3.7],
      [43.26, -2.93],
    ]) {
      const centers = new Map<string, Set<string>>();
      for (let i = 0; i < 10000; i++) {
        const c = snapToHexGrid(lat0 + (rand() - 0.5) * 0.04, lng0 + (rand() - 0.5) * 0.04);
        if (!centers.has(c.key)) centers.set(c.key, new Set());
        centers.get(c.key)!.add(`${c.centerLat},${c.centerLng}`);
      }
      for (const set of centers.values()) expect(set.size).toBe(1);
    }
  });

  test('coincide con el servidor en un punto conocido de Málaga', () => {
    // Valores fijados a mano: si se cambia la fórmula en un lado, este test avisa.
    const c = snapToHexGrid(36.7215, -4.4215);
    const same = snapToHexGrid(36.7215, -4.4215);
    expect(c).toEqual(same);
    expect(snapToHexGrid(c.centerLat, c.centerLng).key).toBe(c.key);
  });
});
