import { describe, expect, test } from 'vitest';
import { Incident } from '../src/data/types';
import {
  countByCategory,
  filterByCategories,
  formatDistance,
  inTimeframe,
  sortIncidents,
  toggleCategory,
} from '../src/lib/filters';
import { clusterIncidents, clusterOf } from '../src/lib/mapData';

const NOW = 1_800_000_000_000;
const make = (id: string, category: Incident['category'], lat: number, lng: number, ageMin = 10): Incident => ({
  id,
  category,
  zone: { gx: 5, gy: 5, lat, lng },
  description: 'x'.repeat(20),
  createdAt: NOW - ageMin * 60_000,
  confirmations: 0,
});

describe('clusterIncidents', () => {
  test('agrupa los avisos del mismo punto y respeta los distintos', () => {
    const list = [
      make('a', 'hurto', 36.72116, -4.41995),
      make('b', 'vandalismo', 36.72116, -4.41994), // ~1 m: el centro de la celda, con la fórmula antigua
      make('c', 'perdido', 36.72116, -4.41997),
      make('d', 'calzada', 36.7295, -4.4201), // ~1 km al norte
    ];
    const c = clusterIncidents(list);
    expect(c).toHaveLength(2);
    expect(c.find((x) => x.count === 3)?.ids.sort()).toEqual(['a', 'b', 'c']);
    expect(c.find((x) => x.count === 1)?.ids).toEqual(['d']);
  });

  test('el grupo toma el color y el icono del aviso más grave', () => {
    const [g] = clusterIncidents([make('a', 'vandalismo', 36.7, -4.4), make('b', 'hogar', 36.7, -4.4)]);
    expect(g.severity).toBe(3);
    expect(g.category).toBe('hogar');
  });

  test('es determinista y el más reciente va primero', () => {
    const list = [make('viejo', 'hurto', 36.7, -4.4, 90), make('nuevo', 'hurto', 36.7, -4.4, 5)];
    const a = clusterIncidents(list);
    const b = clusterIncidents([...list].reverse());
    expect(a).toEqual(b);
    expect(a[0].ids).toEqual(['nuevo', 'viejo']);
  });

  test('la clave no cambia al añadir avisos al mismo punto', () => {
    const base = [make('a', 'hurto', 36.7, -4.4, 20)];
    const more = [...base, make('b', 'perdido', 36.7, -4.4, 5)];
    // el recién llegado es el más reciente: el punto de la celda sigue siendo el mismo
    expect(clusterIncidents(more)[0].key).toBe(clusterIncidents(base)[0].key);
  });

  test('clusterOf encuentra el grupo de un aviso', () => {
    const c = clusterIncidents([make('a', 'hurto', 36.7, -4.4), make('z', 'hurto', 37.5, -5)]);
    expect(clusterOf(c, 'z')?.count).toBe(1);
    expect(clusterOf(c, 'nope')).toBeNull();
  });
});

describe('filtros y orden', () => {
  const list = [
    make('1', 'hurto', 36.7213, -4.4214, 30),
    make('2', 'agresion', 36.73, -4.43, 5),
    make('3', 'hurto', 36.9, -4.6, 60),
  ];

  test('sin categorías elegidas se ve todo; con varias, es una unión', () => {
    expect(filterByCategories(list, [])).toHaveLength(3);
    expect(filterByCategories(list, ['hurto']).map((i) => i.id)).toEqual(['1', '3']);
    expect(filterByCategories(list, ['hurto', 'agresion'])).toHaveLength(3);
  });

  test('countByCategory cuenta por categoría', () => {
    expect(countByCategory(list)).toEqual({ hurto: 2, agresion: 1 });
  });

  test('toggleCategory añade y quita sin duplicar', () => {
    const a = toggleCategory([], 'agresion');
    const b = toggleCategory(a, 'hurto');
    expect(b).toEqual(['hurto', 'agresion']); // orden del catálogo, no de pulsación
    expect(toggleCategory(b, 'hurto')).toEqual(['agresion']);
  });

  test('inTimeframe respeta los plazos', () => {
    expect(inTimeframe(make('x', 'hurto', 0, 0, 60 * 23), '24h', NOW)).toBe(true);
    expect(inTimeframe(make('x', 'hurto', 0, 0, 60 * 25), '24h', NOW)).toBe(false);
    expect(inTimeframe(make('x', 'hurto', 0, 0, 60 * 24 * 6), 'week', NOW)).toBe(true);
  });

  test('sortIncidents: recientes, cercanos y sin ubicación', () => {
    const me = { lat: 36.7213, lng: -4.4214 };
    expect(sortIncidents(list, 'recent', me).map((i) => i.id)).toEqual(['2', '1', '3']);
    expect(sortIncidents(list, 'near', me).map((i) => i.id)).toEqual(['1', '2', '3']);
    // sin ubicación no se rompe: cae a por fecha
    expect(sortIncidents(list, 'near', null).map((i) => i.id)).toEqual(['2', '1', '3']);
    // los avisos sin coordenadas van al final
    const sinGps: Incident = { ...make('9', 'hurto', 0, 0, 1), zone: { gx: 5, gy: 5 } };
    expect(sortIncidents([sinGps, ...list], 'near', me).at(-1)?.id).toBe('9');
  });

  test('formatDistance', () => {
    expect(formatDistance(120)).toBe('100 m');
    expect(formatDistance(130)).toBe('150 m');
    expect(formatDistance(10)).toBe('50 m'); // nunca «0 m»: la ubicación es aproximada
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(18_400)).toBe('18 km');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
