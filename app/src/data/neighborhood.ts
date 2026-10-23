import { Zone } from './types';
import { placeLabel } from './places';

/** Barrio ficticio de demostración: cuadrícula 10x10, 1 celda ≈ 150 m. */
export const GRID = 10;

interface Area {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Orden importa: la primera que contenga la celda gana.
export const areas: Area[] = [
  { name: 'Plaza Mayor', x0: 3, y0: 3, x1: 6, y1: 6 },
  { name: 'Barrio Norte', x0: 0, y0: 0, x1: 10, y1: 3 },
  { name: 'Parque del Río', x0: 6, y0: 3, x1: 10, y1: 7 },
  { name: 'Casco Antiguo', x0: 0, y0: 3, x1: 3, y1: 7 },
  { name: 'Avenida del Sur', x0: 0, y0: 7, x1: 10, y1: 10 },
];

/**
 * Etiqueta de la zona: si hay GPS usa la ciudad más próxima (todo el
 * territorio nacional); si no, el barrio por celda de la demo antigua.
 */
export const areaName = (z: Zone): string => {
  if (z.lat && z.lng) return placeLabel(z.lat, z.lng);
  const a = areas.find((r) => z.gx >= r.x0 && z.gx < r.x1 && z.gy >= r.y0 && z.gy < r.y1);
  return a ? a.name : 'Barrio Centro';
};

/** Posición (0-100) del centro de una celda. */
export const zoneCenter = (z: Zone) => ({
  x: (z.gx + 0.5) * (100 / GRID),
  y: (z.gy + 0.5) * (100 / GRID),
});

export const zoneFromPoint = (x: number, y: number): Zone => ({
  gx: Math.min(GRID - 1, Math.max(0, Math.floor(x / (100 / GRID)))),
  gy: Math.min(GRID - 1, Math.max(0, Math.floor(y / (100 / GRID)))),
});

export const YOU: Zone = { gx: 4, gy: 5 };
