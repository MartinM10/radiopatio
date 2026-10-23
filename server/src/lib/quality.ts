import { CategoryId, Incident } from '../types';

/**
 * Reglas de calidad del dato (espejo de app/src/lib/dataQuality.ts):
 * una sola semántica entre app y servidor. Si cambias una regla aquí,
 * cambia también en la app; los tests de ambos lados deben seguir pasando.
 * Ver docs/DATA-QUALITY.md y docs/TRUST.md.
 */

// ── Límites de contenido ────────────────────────────────────────────────────
export const MIN_DESC = 10;
export const MAX_DESC = 280;
export const CONFIRMATIONS_CAP = 999;

// ── Retención y frescura ────────────────────────────────────────────────────
export const RETENTION_MS = 72 * 3_600_000;

// ── Anti-abuso ──────────────────────────────────────────────────────────────
export const MAX_PER_HOUR = 5;
export const MIN_GAP_MS = 60_000;
export const DUP_WINDOW_MIN = 45;
export const DUP_SIMILARITY = 0.75;

// ── Confianza (docs/TRUST.md §3 capa 3) ─────────────────────────────────────
/** Confirmaciones vecinales para considerar un aviso verificado. */
export const CONFIRMED_AT = 2;
/** Muestra mínima de avisos confirmados para publicar estadística de zona. */
export const MIN_ZONE_SAMPLE = 2;
/** Peso de un aviso sin confirmar en métricas agregadas. */
export const TRUST_UNCONFIRMED = 0.5;

export const trustWeight = (i: Pick<Incident, 'confirmations'>): number =>
  i.confirmations >= CONFIRMED_AT ? 1 : TRUST_UNCONFIRMED;

// ── Texto ───────────────────────────────────────────────────────────────────
export const normalizeText = (raw: unknown, max: number = MAX_DESC): string =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const deaccent = (s: string): string =>
  s
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n');

const tokenize = (text: string): Set<string> =>
  new Set(
    deaccent(text.toLowerCase())
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );

/** Similitud de solape (intersección/conjunto menor) entre dos textos: 0-1. */
export const textSimilarity = (a: string, b: string): number => {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const smaller = Math.min(ta.size, tb.size);
  if (smaller < 2) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / smaller;
};

/** Forma mínima para deduplicar (el servidor usa la clave de celda hex). */
export interface DedupRecord {
  id: string;
  cellKey: string;
  category: CategoryId;
  description: string;
  createdAt: number;
}

export interface DuplicateHit {
  id: string;
  minutesAgo: number;
}

/**
 * Detecta el aviso casi idéntico reciente: misma celda, misma categoría,
 * ventana de DUP_WINDOW_MIN y solape de texto ≥ DUP_SIMILARITY. El vecino
 * correcto es confirmar el aviso existente, no repetirlo.
 */
export const findDuplicate = (
  records: ReadonlyArray<DedupRecord>,
  candidate: { cellKey: string; category: CategoryId; description: string },
  nowMs: number,
): DuplicateHit | null => {
  for (const r of records) {
    if (nowMs - r.createdAt > DUP_WINDOW_MIN * 60_000) continue;
    if (r.cellKey !== candidate.cellKey) continue;
    if (r.category !== candidate.category) continue;
    if (textSimilarity(r.description, candidate.description) >= DUP_SIMILARITY) {
      return { id: r.id, minutesAgo: Math.max(1, Math.round((nowMs - r.createdAt) / 60_000)) };
    }
  }
  return null;
};

export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.asin(Math.sqrt(a));
};

export type ZoneLevel = 'tranquilo' | 'moderado' | 'atencion' | 'alerta';

export const levelForScore = (score: number): ZoneLevel =>
  score === 0 ? 'tranquilo' : score <= 3 ? 'moderado' : score <= 8 ? 'atencion' : 'alerta';
