import { categories } from '../data/categories';
import { Incident } from '../data/types';
import { isExpired } from './lifetime';
import { checkText } from './privacy';

/**
 * Calidad del dato en el cliente (espejo de las reglas del servidor,
 * server/src/lib/quality.ts): validación de lo que se lee del caché,
 * normalización de texto, deduplicación, retención y pesos de confianza.
 * El servidor es la autoridad de las reglas; aquí protegen la caché local
 * (JSON.parse ciego nunca entra en la app) y el razonamiento en la UI.
 * Ver docs/DATA-QUALITY.md y docs/TRUST.md.
 */

// ── Límites de contenido ────────────────────────────────────────────────────
export const MIN_DESC = 10;
export const MAX_DESC = 280;
export const CONFIRMATIONS_CAP = 999;

// ── Confianza (docs/TRUST.md §3) ────────────────────────────────────────────
/** Valor por defecto si el servidor aún no ha respondido (el servidor manda: GET /api/config). */
export const DEFAULT_VERIFIED_AT = 3;
/**
 * Confirmaciones vecinales para considerar un aviso verificado. Es `let` a
 * propósito: la app lo actualiza con el valor del servidor (setVerifiedAt) y
 * todo lo que lo lee —pesos, etiquetas, mapa— ve el valor actual.
 */
export let CONFIRMED_AT = DEFAULT_VERIFIED_AT;
export const setVerifiedAt = (n: number): void => {
  if (Number.isFinite(n)) CONFIRMED_AT = Math.min(20, Math.max(2, Math.round(n)));
};
/** Peso de un aviso sin confirmar en métricas agregadas (mapa de calor, alertas). */
export const TRUST_UNCONFIRMED = 0.5;

export const trustWeight = (i: Pick<Incident, 'confirmations'>): number =>
  i.confirmations >= CONFIRMED_AT ? 1 : TRUST_UNCONFIRMED;

// ── Retención y frescura ────────────────────────────────────────────────────
/** Tolerancia a desfase de reloj: un aviso no puede ser "del futuro". */
const CLOCK_SKEW_MS = 5 * 60_000;
/** Antigüedad máxima de un dato en caché antes de considerarlo inválido. */
const MAX_AGE_MS = 30 * 24 * 3_600_000;

/** Minimización: los caducados se purgan del caché en cada guarda (cada aviso con su caducidad). */
export const pruneExpired = (incidents: Incident[], now: number = Date.now()): Incident[] =>
  incidents.filter((i) => !isExpired(i, now));

// ── Validación de campos ────────────────────────────────────────────────────
const CATEGORY_IDS = new Set<string>(categories.map((c) => c.id));

export const isCategory = (v: unknown): v is Incident['category'] =>
  typeof v === 'string' && CATEGORY_IDS.has(v);

/** Normaliza el texto: colapsa espacios/saltos, recorta y limita longitud. */
export const normalizeText = (raw: unknown, max: number = MAX_DESC): string =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Acepta cualquier entrada y devuelve una zona válida, o null. */
export const clampZone = (raw: unknown): Incident['zone'] | null => {
  if (!raw || typeof raw !== 'object') return null;
  const z = raw as Record<string, unknown>;
  if (!finite(z.gx) || !finite(z.gy)) return null;
  const zone: Incident['zone'] = {
    gx: Math.min(100, Math.max(0, Math.round(z.gx))),
    gy: Math.min(100, Math.max(0, Math.round(z.gy))),
  };
  if (finite(z.lat) && finite(z.lng)) {
    zone.lat = Math.min(90, Math.max(-90, z.lat));
    zone.lng = Math.min(180, Math.max(-180, z.lng));
  }
  if (typeof z.address === 'string' && z.address.trim().length > 0) {
    zone.address = z.address.trim().slice(0, 250);
  }
  return zone;
};

// ── Deduplicación (semántica espejo del servidor) ───────────────────────────
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

const DEDUP_WINDOW_MS = 45 * 60_000;
export const DEDUP_SIMILARITY = 0.75;

export const findDuplicate = (
  incidents: ReadonlyArray<Incident>,
  candidate: { category: Incident['category']; zone: { gx: number; gy: number }; description: string },
  now: number = Date.now(),
): { id: string; minutesAgo: number } | null => {
  for (const i of incidents) {
    if (isExpired(i, now)) continue;
    if (i.category !== candidate.category) continue;
    if (i.zone.gx !== candidate.zone.gx || i.zone.gy !== candidate.zone.gy) continue;
    if (now - i.createdAt > DEDUP_WINDOW_MS) continue;
    if (textSimilarity(i.description, candidate.description) >= DEDUP_SIMILARITY) {
      return { id: i.id, minutesAgo: Math.max(1, Math.round((now - i.createdAt) / 60_000)) };
    }
  }
  return null;
};

// ── Saneado del caché local ─────────────────────────────────────────────────
export interface LoadStats {
  kept: number;
  invalid: number;
  expired: number;
  corrupt: boolean;
}

/**
 * Valida un registro del caché de AsyncStorage (JSON.parse ciego nunca
 * llega a la UI). Devuelve el Incident canónico o null si no es recuperable.
 */
export const sanitizeIncident = (raw: unknown, now: number = Date.now()): Incident | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!id || id.length > 64) return null;

  if (!isCategory(r.category)) return null;

  const zone = clampZone(r.zone);
  if (!zone) return null;

  const description = normalizeText(r.description);
  if (description.length < MIN_DESC || description.length > MAX_DESC) return null;
  // Privacidad como requisito de calidad: el filtro protege también el caché.
  if (checkText(description)) return null;

  if (!finite(r.createdAt)) return null;
  if (r.createdAt > now + CLOCK_SKEW_MS || r.createdAt < now - MAX_AGE_MS) return null;

  const confirmations =
    finite(r.confirmations) ? Math.min(CONFIRMATIONS_CAP, Math.max(0, Math.floor(r.confirmations))) : 0;

  const out: Incident = { id, category: r.category, zone, description, createdAt: r.createdAt, confirmations };
  if (finite(r.expiresAt) && r.expiresAt >= r.createdAt && r.expiresAt <= r.createdAt + MAX_AGE_MS) out.expiresAt = r.expiresAt;
  if (r.resolved === true) out.resolved = true;
  if (r.hasPhoto === true) out.hasPhoto = true;
  if (r.status === 'active' || r.status === 'pending') out.status = r.status;
  if (typeof r.presenceVote === 'boolean') out.presenceVote = r.presenceVote;
  if (r.confirmedByMe === true) out.confirmedByMe = true;
  if (r.flaggedByMe === true) out.flaggedByMe = true;
  if (r.mine === true) out.mine = true;
  return out;
};

/**
 * Interpreta el JSON del caché descartando lo inválido: datos corruptos o
 * manipulados nunca llegan a la UI. Con raw === null (primera ejecución)
 * devuelve lista vacía sin marcar corrupción.
 */
export const parseStoredIncidents = (
  raw: string | null,
  now: number = Date.now(),
): { incidents: Incident[]; stats: LoadStats } => {
  if (raw === null) {
    return { incidents: [], stats: { kept: 0, invalid: 0, expired: 0, corrupt: false } };
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { incidents: [], stats: { kept: 0, invalid: 0, expired: 0, corrupt: true } };
  }
  if (!Array.isArray(arr)) {
    return { incidents: [], stats: { kept: 0, invalid: 0, expired: 0, corrupt: true } };
  }

  const seen = new Set<string>();
  const incidents: Incident[] = [];
  let invalid = 0;
  let expired = 0;
  for (const item of arr) {
    const inc = sanitizeIncident(item, now);
    if (!inc || seen.has(inc.id)) {
      invalid++;
      continue;
    }
    seen.add(inc.id);
    if (isExpired(inc, now)) {
      expired++;
      continue;
    }
    incidents.push(inc);
  }
  return { incidents, stats: { kept: incidents.length, invalid, expired, corrupt: false } };
};
