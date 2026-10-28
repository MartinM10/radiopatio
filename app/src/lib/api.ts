import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryId, Incident, Zone } from '../data/types';

const DEVICE_TOKEN_KEY = 'av.device_token.v1';
/** '1' si el token guardado pertenece a una identidad verificada (Google). */
const DEVICE_VERIFIED_KEY = 'av.device_verified.v1';

// En Expo, las variables prefijadas con EXPO_PUBLIC_ están disponibles en runtime.
// Por defecto siempre apunta al backend oficial de producción en radiopatio.app.
const DEFAULT_API_URL = 'https://api.radiopatio.app';

/** Error de la API con información de veracidad: código, status y mensaje del servidor. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getApiBaseUrl(): string {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const url = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
  // Blindaje absoluto: En builds de producción nunca jamás permitir localhost ni 127.0.0.1
  if (!isDev && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    return 'https://api.radiopatio.app';
  }
  return url;
}

export async function getDeviceToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

let deviceTokenRegistered = false;

export async function registerDeviceToken(baseUrl: string): Promise<string | null> {
  if (deviceTokenRegistered) return null; // ya se intentó; no reintentar en bucle
  deviceTokenRegistered = true;
  try {
    const res = await fetch(`${baseUrl}/api/devices/register`, { method: 'POST' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { token?: string } };
    const token = body?.data?.token;
    if (!token) return null;
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** El servidor ya no reconoce este token (base de datos nueva, sal rotada…). */
const STALE_TOKEN_CODES = new Set(['DEVICE_TOKEN_REQUIRED', 'INVALID_DEVICE_TOKEN']);

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    return await sendOnce<T>(endpoint, options);
  } catch (err) {
    // Las escrituras exigen un token emitido por el servidor. Si el guardado
    // dejó de valer, se pide uno nuevo y se reintenta UNA sola vez.
    if (err instanceof ApiError && err.status === 401 && err.code && STALE_TOKEN_CODES.has(err.code)) {
      await AsyncStorage.multiRemove([DEVICE_TOKEN_KEY, DEVICE_VERIFIED_KEY]).catch(() => {});
      deviceTokenRegistered = false;
      return sendOnce<T>(endpoint, options);
    }
    throw err;
  }
}

async function sendOnce<T>(endpoint: string, options: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  let token = await getDeviceToken();
  if (!token) {
    token = await registerDeviceToken(baseUrl);
  }

  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('X-Device-Token', token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new ApiError(0, 'TIMEOUT', 'El servidor ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string; message?: string };
    throw new ApiError(
      res.status,
      body.error ?? body.reason,
      body.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

export async function apiGetIncidents(params?: {
  timeframe?: '24h' | '72h' | 'week' | 'month' | 'all';
}): Promise<Incident[]> {
  const query = params?.timeframe ? `?timeframe=${params.timeframe}` : '';
  const res = await apiFetch<{ data: Incident[] }>(`/api/incidents${query}`);
  return res.data;
}

export async function apiCreateIncident(p: {
  category: CategoryId;
  zone: Zone;
  description: string;
}): Promise<Incident> {
  const res = await apiFetch<{ data: Incident }>('/api/incidents', {
    method: 'POST',
    body: JSON.stringify(p),
  });
  return res.data;
}

export async function apiConfirmIncident(id: string): Promise<{ confirmations: number }> {
  return apiFetch<{ confirmations: number }>(`/api/incidents/${id}/confirm`, {
    method: 'POST',
  });
}

export async function apiFlagIncident(id: string): Promise<{ success: boolean; hidden?: boolean }> {
  return apiFetch<{ success: boolean; hidden?: boolean }>(`/api/incidents/${id}/flag`, {
    method: 'POST',
  });
}

export async function apiAppealIncident(id: string): Promise<{ success: boolean; status: string }> {
  return apiFetch<{ success: boolean; status: string }>(`/api/incidents/${id}/appeal`, {
    method: 'POST',
  });
}

/**
 * Derecho de supresión: el servidor borra la identidad de este dispositivo y
 * todo lo que publicó. Después se olvida el token; la próxima acción pedirá
 * uno nuevo. Sin reintento automático: un 401 significa que ya no había nada.
 */
export async function apiDeleteIdentity(): Promise<void> {
  if (await getDeviceToken()) {
    try {
      await sendOnce<unknown>('/api/devices/me', { method: 'DELETE' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }
  await AsyncStorage.multiRemove([DEVICE_TOKEN_KEY, DEVICE_VERIFIED_KEY]).catch(() => {});
  deviceTokenRegistered = false;
}

export async function isDeviceVerified(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEVICE_VERIFIED_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Canjea el id_token de Google por el token de una identidad verificada.
 * El servidor solo guarda un HMAC del identificador de Google: ni email ni nombre.
 */
export async function apiGoogleLogin(idToken: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }
  const body = (await res.json().catch(() => ({}))) as {
    data?: { token?: string };
    error?: string;
    message?: string;
  };
  const token = body.data?.token;
  if (!res.ok || !token) {
    throw new ApiError(res.status, body.error, body.message ?? 'No se pudo verificar tu cuenta de Google.');
  }
  await AsyncStorage.multiSet([
    [DEVICE_TOKEN_KEY, token],
    [DEVICE_VERIFIED_KEY, '1'],
  ]);
}