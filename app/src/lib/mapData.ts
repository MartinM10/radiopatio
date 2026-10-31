import { categoryById } from '../data/categories';
import { haversineMeters } from '../data/places';
import { CategoryId, Incident } from '../data/types';
import { severityColor } from '../theme';

/**
 * Datos que el mapa dibuja. La agrupación se hace aquí (en la app) y no dentro
 * del WebView: así se prueba con tests y el mapa solo recibe puntos ya listos.
 */
export interface MapCluster {
  /** Estable mientras el punto sea el mismo: sirve para seleccionar y resaltar. */
  key: string;
  lat: number;
  lng: number;
  /** Avisos que hay en este punto (el más reciente primero). */
  ids: string[];
  count: number;
  /** Color del aviso más grave del grupo. */
  color: string;
  severity: 1 | 2 | 3;
  /** Categoría del aviso más grave: es el icono cuando el grupo es de uno solo. */
  category: CategoryId;
}

/** Dos avisos a menos de esta distancia son el mismo punto (el servidor publica el centro de la celda). */
export const CLUSTER_RADIUS_M = 40;

const LEGACY_CENTER = { lat: 40.2, lng: -3.7 };

/** Coordenadas de un aviso; los heredados sin GPS caen en su cuadrícula antigua. */
export const incidentPoint = (inc: Incident): { lat: number; lng: number } => ({
  lat: inc.zone.lat ?? LEGACY_CENTER.lat + (inc.zone.gy - 5) * 0.0025,
  lng: inc.zone.lng ?? LEGACY_CENTER.lng + (inc.zone.gx - 5) * 0.0035,
});

export function clusterIncidents(incidents: Incident[]): MapCluster[] {
  // Orden determinista: el más reciente primero, y por id si empatan.
  const sorted = [...incidents].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const groups: { lat: number; lng: number; items: Incident[] }[] = [];

  for (const inc of sorted) {
    const p = incidentPoint(inc);
    const g = groups.find((x) => haversineMeters({ lat: x.lat, lng: x.lng }, p) <= CLUSTER_RADIUS_M);
    if (g) g.items.push(inc);
    else groups.push({ lat: p.lat, lng: p.lng, items: [inc] });
  }

  return groups.map((g) => {
    const worst = g.items.reduce((a, b) =>
      categoryById(b.category).severity > categoryById(a.category).severity ? b : a,
    );
    const severity = categoryById(worst.category).severity;
    return {
      key: `c_${g.lat.toFixed(5)}_${g.lng.toFixed(5)}`,
      lat: g.lat,
      lng: g.lng,
      ids: g.items.map((i) => i.id),
      count: g.items.length,
      color: severityColor[severity],
      severity,
      category: worst.category,
    };
  });
}

/** Cluster que contiene un aviso, si está en el mapa. */
export const clusterOf = (clusters: MapCluster[], id: string): MapCluster | null =>
  clusters.find((c) => c.ids.includes(id)) ?? null;
