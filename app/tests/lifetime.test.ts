import { describe, expect, test } from 'vitest';
import { categories } from '../src/data/categories';
import { Incident } from '../src/data/types';
import { expiresAtOf, expiryLabel, formatDuration, formatTimeLeft, inPresenceWindow, shouldAskPresence } from '../src/lib/lifetime';

const H = 3_600_000;
const NOW = 1_800_000_000_000;

// Misma tabla que server/src/tests/lifetime.test.ts: si cambia una, cambia la otra.
const TTL: Record<string, number> = {
  hogar: 72, vehiculo: 72, hurto: 72, agresion: 72, vandalismo: 72, sospechoso: 24, altercado: 12,
  corte_agua: 48, corte_luz: 48, alumbrado: 168, calzada: 168, limpieza: 168, perdido: 168,
  inundacion: 24, incendio: 12, derrumbe: 168, arbol: 48, calle_cortada: 168, otro: 72,
};

const notice = (over: Partial<Incident> = {}): Incident => ({
  id: 'u1', category: 'arbol', zone: { gx: 1, gy: 1 }, description: 'Un árbol caído en la calle', createdAt: NOW - 30 * H, confirmations: 0, ...over,
});

describe('duración de los avisos', () => {
  test('cada categoría dura lo mismo que en el servidor', () => {
    expect(Object.fromEntries(categories.map((c) => [c.id, c.ttlHours]))).toEqual(TTL);
  });

  test('la caducidad es la del servidor y, en datos antiguos, la de su categoría', () => {
    expect(expiresAtOf(notice({ expiresAt: NOW + 5 * H }))).toBe(NOW + 5 * H);
    expect(expiresAtOf(notice())).toBe(NOW - 30 * H + 48 * H);
  });

  test('formatDuration y formatTimeLeft hablan en horas y días', () => {
    expect([12, 24, 48, 72, 168].map(formatDuration)).toEqual(['12 horas', '24 horas', '2 días', '3 días', '7 días']);
    expect(formatDuration(1)).toBe('1 hora');
    expect(formatTimeLeft(3 * 24 * H + 2 * H)).toBe('3 días');
    expect(formatTimeLeft(71 * H)).toBe('3 días');
    expect(formatTimeLeft(49 * H)).toBe('2 días');
    expect(formatTimeLeft(5 * H + 10 * 60_000)).toBe('5 h');
    expect(formatTimeLeft(40 * 60_000)).toBe('40 min');
    expect(formatTimeLeft(-5)).toBe('1 min');
  });

  test('la etiqueta dice si está resuelto', () => {
    expect(expiryLabel(notice(), NOW)).toBe('Caduca en 18 h');
    expect(expiryLabel(notice({ resolved: true, expiresAt: NOW + 90 * 60_000 }), NOW)).toBe('Resuelto · desaparece en 1 h');
  });
});

describe('«¿sigue ahí?»', () => {
  test('solo se pregunta en la segunda mitad de la vida del aviso', () => {
    // Árbol caído: 48 h. La segunda mitad empieza cuando le quedan 24 h.
    expect(inPresenceWindow(notice({ createdAt: NOW - 10 * H }), NOW)).toBe(false); // le quedan 38 h
    expect(inPresenceWindow(notice({ createdAt: NOW - 24 * H }), NOW)).toBe(true); // le quedan 24 h
    expect(inPresenceWindow(notice({ createdAt: NOW - 47 * H }), NOW)).toBe(true);
    expect(inPresenceWindow(notice({ createdAt: NOW - 49 * H }), NOW)).toBe(false); // ya caducó
  });

  test('no se pregunta al autor, ni si está resuelto, ni a quien ya contestó', () => {
    const late = { createdAt: NOW - 40 * H };
    expect(shouldAskPresence(notice(late), NOW)).toBe(true);
    expect(shouldAskPresence(notice({ ...late, mine: true }), NOW)).toBe(false);
    expect(shouldAskPresence(notice({ ...late, resolved: true }), NOW)).toBe(false);
    expect(shouldAskPresence(notice({ ...late, presenceVote: true }), NOW)).toBe(false);
    expect(shouldAskPresence(notice({ ...late, presenceVote: false }), NOW)).toBe(false);
  });

  test('un aviso ampliado vuelve a quedar fuera de la ventana hasta que se acerque su nuevo final', () => {
    // Le quedaban 5 h, se amplía 24 h: le quedan 29 h (más de la mitad de su base).
    expect(inPresenceWindow(notice({ createdAt: NOW - 43 * H, expiresAt: NOW + 29 * H }), NOW)).toBe(false);
  });
});
