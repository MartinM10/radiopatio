/**
 * La calle de un aviso es opcional y se publica: sin número de portal ni
 * coordenadas. Espejo de server/src/lib/address.ts (el servidor es la autoridad).
 */
import { describe, expect, test } from 'vitest';
import { MAX_ADDRESS, readableAddress, sanitizeAddress } from '../src/lib/address';

describe('sanitizeAddress', () => {
  test('quita el número de portal y la puerta', () => {
    expect(sanitizeAddress('Calle Mayor 12, Málaga')).toBe('Calle Mayor, Málaga');
    expect(sanitizeAddress('Calle Mayor, 12')).toBe('Calle Mayor');
    expect(sanitizeAddress('Avenida de Andalucía, 5, Málaga')).toBe('Avenida de Andalucía, Málaga');
    expect(sanitizeAddress('Calle Mayor nº 12')).toBe('Calle Mayor');
    expect(sanitizeAddress('Calle Alcalá 7B')).toBe('Calle Alcalá');
  });

  test('respeta los números que forman parte del nombre', () => {
    expect(sanitizeAddress('Calle 20 de Mayo')).toBe('Calle 20 de Mayo');
  });

  test('normaliza espacios y limita la longitud', () => {
    expect(sanitizeAddress('  Plaza   de la  Merced  ')).toBe('Plaza de la Merced');
    expect(sanitizeAddress('x'.repeat(300))).toHaveLength(MAX_ADDRESS);
  });
});

describe('readableAddress', () => {
  test('descarta los textos con coordenadas de versiones anteriores', () => {
    expect(readableAddress('Ubicación GPS [36.6301, -4.4974]')).toBeNull();
    expect(readableAddress('Zona [36.6301, -4.4974]')).toBeNull();
    expect(readableAddress('36.6301, -4.4974')).toBeNull();
  });

  test('conserva una calle normal y trata el vacío como ausencia', () => {
    expect(readableAddress('Calle Larios, Málaga')).toBe('Calle Larios, Málaga');
    expect(readableAddress('  ')).toBeNull();
    expect(readableAddress(undefined)).toBeNull();
    expect(readableAddress(null)).toBeNull();
  });
});
