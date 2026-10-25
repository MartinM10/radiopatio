import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryId, Incident, Zone } from '../data/types';

const DEVICE_TOKEN_KEY = 'av.device_token.v1';
const DEVICE_ID_KEY = 'av.device_id.v1';

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

export async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback_anonymous_device';
  }
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

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
  // Fallback legacy: si no hay token, usa el id local (retrocompatibilidad)
  if (!token) {
    const legacyId = await getDeviceId();
    headers.set('X-Device-Id', legacyId);
  }

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