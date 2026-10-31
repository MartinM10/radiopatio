import { categories } from '../data/categories';
import { haversineMeters } from '../data/places';
import { CategoryId, Incident } from '../data/types';

export type Timeframe = '24h' | 'week' | 'month';
export type SortMode = 'recent' | 'near';

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '24h': 24 * 3_600_000,
  week: 7 * 24 * 3_600_000,
  month: 30 * 24 * 3_600_000,
};

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  '24h': '24 h',
  week: 'Semana',
  month: 'Mes',
};

/** «hoy», «esta semana», «este mes»: para frases como «3 avisos esta semana». */
export const TIMEFRAME_PHRASE: Record<Timeframe, string> = {
  '24h': 'hoy',
  week: 'esta semana',
  month: 'este mes',
};

export const inTimeframe = (inc: Incident, tf: Timeframe, now = Date.now()): boolean =>
  now - inc.createdAt < TIMEFRAME_MS[tf];

/** Sin categorías elegidas = todas. */
export function filterByCategories(list: Incident[], selected: CategoryId[]): Incident[] {
  if (selected.length === 0) return list;
  const set = new Set(selected);
  return list.filter((i) => set.has(i.category));
}

/** Avisos por categoría, para mostrar «Hurto (3)» en el selector. */
export function countByCategory(list: Incident[]): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = {};
  for (const i of list) out[i.category] = (out[i.category] ?? 0) + 1;
  return out;
}

/** Alterna una categoría en la selección conservando el orden del catálogo. */
export function toggleCategory(selected: CategoryId[], id: CategoryId): CategoryId[] {
  const set = new Set(selected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return categories.map((c) => c.id).filter((c) => set.has(c));
}

/** Distancia del aviso al vecino en metros; infinita si el aviso no tiene coordenadas. */
export function distanceTo(inc: Incident, loc: { lat: number; lng: number }): number {
  if (inc.zone.lat == null || inc.zone.lng == null) return Number.POSITIVE_INFINITY;
  return haversineMeters(loc, { lat: inc.zone.lat, lng: inc.zone.lng });
}

/**
 * Orden de la lista. «Más cercanos» necesita la ubicación; sin ella se ordena
 * por fecha (nunca se rompe la lista). A igual distancia, el más reciente.
 */
export function sortIncidents(
  list: Incident[],
  sort: SortMode,
  loc: { lat: number; lng: number } | null,
): Incident[] {
  const copy = [...list];
  if (sort === 'near' && loc) {
    return copy.sort((a, b) => distanceTo(a, loc) - distanceTo(b, loc) || b.createdAt - a.createdAt);
  }
  return copy.sort((a, b) => b.createdAt - a.createdAt);
}

/** «450 m», «1,2 km»: para mostrar la distancia de un aviso. */
export function formatDistance(meters: number): string | null {
  if (!Number.isFinite(meters)) return null;
  if (meters < 950) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1).replace('.', ',')} km`;
}
