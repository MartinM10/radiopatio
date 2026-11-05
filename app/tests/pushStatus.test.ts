import { describe, expect, it } from 'vitest';
import { toPushStatus } from '../src/lib/pushStatus';

describe('toPushStatus', () => {
  it('permiso concedido', () => {
    expect(toPushStatus({ status: 'granted', canAskAgain: true })).toBe('granted');
    expect(toPushStatus({ status: 'granted', canAskAgain: false })).toBe('granted');
  });

  it('Android 13+ sin preguntar aún: Expo dice denied, pero se puede pedir', () => {
    expect(toPushStatus({ status: 'denied', canAskAgain: true })).toBe('undetermined');
  });

  it('bloqueado de verdad: ya no se puede volver a preguntar', () => {
    expect(toPushStatus({ status: 'denied', canAskAgain: false })).toBe('denied');
  });

  it('iOS sin preguntar aún', () => {
    expect(toPushStatus({ status: 'undetermined', canAskAgain: true })).toBe('undetermined');
  });
});
