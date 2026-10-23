/**
 * Tests del cliente API: el error del servidor llega como ApiError con
 * código y mensaje estables, para que el store pueda actuar (quitar el
 * aviso fantasma al rechazo y mostrar el motivo).
 * Ejecutar: docker compose run --rm app npm test
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, apiCreateIncident } from '../src/lib/api';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => 'test-device-id'),
    setItem: vi.fn(async () => undefined),
  },
}));

let base = 'http://localhost:3000';

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', base);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const respondWith = (status: number, body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status < 400,
      status,
      statusText: 'x',
      json: async () => body,
    })),
  );
};

test('409 DUPLICATE_INCIDENT llega como ApiError con código y mensaje del servidor', async () => {
  respondWith(409, {
    error: 'DUPLICATE_INCIDENT',
    message: 'Ya hay un aviso casi igual en esa zona, publicado hace 5 min.',
  });
  const err = await apiCreateIncident({
    category: 'hurto',
    zone: { gx: 5, gy: 5 },
    description: 'Carterista en la entrada del mercado',
  }).then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(409);
  expect((err as ApiError).code).toBe('DUPLICATE_INCIDENT');
  expect((err as ApiError).message).toContain('casi igual');
});

test('429 RATE_LIMIT_EXCEEDED llega con su motivo para avisar al vecino', async () => {
  respondWith(429, {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Estás publicando muy rápido. Espera 1 min antes de publicar otro aviso.',
  });
  const err = await apiCreateIncident({
    category: 'vandalismo',
    zone: { gx: 5, gy: 5 },
    description: 'Papeleras volcadas junto a la escuela del barrio',
  }).then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe('RATE_LIMIT_EXCEEDED');
});

test('privacidad: el motivo del filtro server-side se conserva', async () => {
  respondWith(400, { error: 'PRIVACY_VIOLATION', message: 'No incluyas números de teléfono.' });
  const err = await apiCreateIncident({
    category: 'sospechoso',
    zone: { gx: 5, gy: 5 },
    description: 'El hombre era DNI 12345678Z según la víctima',
  }).then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).message).toBe('No incluyas números de teléfono.');
});

test('cuerpo de error sin JSON cae a un mensaje genérico sin colar HTML', async () => {
  respondWith(502, {});
  const err = await apiCreateIncident({
    category: 'otro',
    zone: { gx: 5, gy: 5 },
    description: 'Aviso de prueba con error del gateway de salida',
  }).then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(502);
  expect((err as ApiError).message).toContain('502');
  expect((err as ApiError).code).toBeUndefined();
});
