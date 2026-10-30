import { config } from '../config';

/**
 * Geocodificación inversa: la app sugiere la CALLE donde el vecino fija el
 * pin. La consulta la hace el servidor, no el móvil, para que:
 *  - la IP del vecino y el identificador de su dispositivo no lleguen al
 *    servicio externo (solo llegan unas coordenadas, sin ninguna identidad);
 *  - se pueda cumplir la política de uso de Nominatim (1 petición/s,
 *    User-Agent identificable, caché);
 *  - el servicio sea intercambiable (GEOCODER_URL) o desactivable
 *    (GEOCODER_ENABLED=0) sin tocar la app.
 *
 * Nunca se guardan ni se registran las coordenadas recibidas: solo viven en
 * la caché en memoria (clave redondeada a ~11 m) un máximo de 24 h.
 * Se devuelve solo calle y localidad, jamás número de portal.
 */
export interface GeocodeResult {
  street: string | null;
  locality: string | null;
  /** «Calle Mayor, Málaga»; null si no hay calle ni localidad. */
  label: string | null;
}

export const EMPTY_GEOCODE: GeocodeResult = { street: null, locality: null, label: null };

type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

let fetcher: FetchLike = defaultFetch;

/** Ajustes mutables solo para pruebas. */
export const geocodeTuning = {
  /** Separación mínima entre peticiones al servicio externo (política de Nominatim). */
  minGapMs: 1100,
  /** Peticiones en cola a partir de las cuales se responde sin calle en vez de esperar. */
  maxPending: 8,
  timeoutMs: 4000,
  cacheTtlMs: 24 * 3_600_000,
  cacheMax: 5000,
};

const cache = new Map<string, { at: number; value: GeocodeResult }>();
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
let pending = 0;

/** Sustituye la función de red (pruebas) y limpia el estado. */
export function setGeocoderFetch(f: FetchLike | null): void {
  fetcher = f ?? defaultFetch;
  cache.clear();
  chain = Promise.resolve();
  lastCallAt = 0;
  pending = 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s.slice(0, 80) : null;
};

/** Extrae calle y localidad de la respuesta de Nominatim (sin número de portal). */
export function parseNominatim(body: unknown): GeocodeResult {
  const a = (body as { address?: Record<string, unknown> } | null)?.address;
  if (!a || typeof a !== 'object') return EMPTY_GEOCODE;
  const street =
    clean(a.road) ??
    clean(a.pedestrian) ??
    clean(a.living_street) ??
    clean(a.footway) ??
    clean(a.path) ??
    clean(a.cycleway);
  const locality = clean(a.city) ?? clean(a.town) ?? clean(a.village) ?? clean(a.municipality);
  const label = [street, locality].filter(Boolean).join(', ') || null;
  return { street, locality, label };
}

async function queryUpstream(lat: number, lng: number): Promise<GeocodeResult | null> {
  const wait = lastCallAt + geocodeTuning.minGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  const url =
    `${config.geocoderUrl}/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=es` +
    `&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`;
  try {
    const res = await fetcher(url, {
      headers: {
        'User-Agent': `RadioPatio/1.0 (${config.geocoderContact})`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(geocodeTuning.timeoutMs),
    });
    if (!res.ok) return null;
    return parseNominatim(await res.json());
  } catch {
    return null;
  }
}

/**
 * Calle y localidad de un punto. Nunca lanza: ante cualquier fallo (servicio
 * caído, tiempo agotado, cola llena, función desactivada) devuelve vacío y
 * la app deja que el vecino escriba la calle a mano.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  if (!config.geocoderEnabled) return EMPTY_GEOCODE;

  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < geocodeTuning.cacheTtlMs) return hit.value;

  if (pending >= geocodeTuning.maxPending) return EMPTY_GEOCODE;
  pending += 1;
  const job = chain.then(() => queryUpstream(lat, lng));
  chain = job.catch(() => undefined);
  try {
    const value = await job;
    if (!value) return EMPTY_GEOCODE;
    if (cache.size >= geocodeTuning.cacheMax) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: Date.now(), value });
    return value;
  } finally {
    pending -= 1;
  }
}
