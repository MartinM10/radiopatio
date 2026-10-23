/**
 * Comprobaciones de la capa de calidad del dato en el cliente (suite
 * permanente, ejecútalas en contenedor: docker compose run --rm app npm test).
 * El servidor es la autoridad de las reglas; aquí se verifican los espejos
 * que protegen la caché local y el razonamiento en la UI.
 */
import { describe, expect, test } from 'vitest';
import * as dq from '../src/lib/dataQuality';
import * as priv from '../src/lib/privacy';
import { makeSeed } from '../src/data/seed';
import { snapToHexGrid } from '../src/lib/hexgrid';

const NOW = Date.now();
const goodZone = { gx: 50, gy: 45 };

// ── Normalización y dominio ─────────────────────────────────────────────────
describe('normalización y dominio', () => {
  test('normalizeText: colapsa espacios, saltos y recorta', () => {
    expect(dq.normalizeText('  Hola   mundo\n\ntest  ')).toBe('Hola mundo test');
    expect(dq.normalizeText(42)).toBe('');
    expect(dq.normalizeText('x'.repeat(400)).length).toBe(dq.MAX_DESC);
  });

  test('clampZone: recorta la rejilla y acepta GPS y dirección', () => {
    expect(dq.clampZone({ gx: -5, gy: 150 })).toEqual({ gx: 0, gy: 100 });
    expect(dq.clampZone({ gx: 3.7, gy: 2.1 })).toEqual({ gx: 4, gy: 2 });
    const withGps = dq.clampZone({ gx: 10, gy: 20, lat: 36.7215, lng: -4.4215, address: ' Calle Larios, Málaga ' });
    expect(withGps?.lat).toBe(36.7215);
    expect(withGps?.lng).toBe(-4.4215);
    expect(withGps?.address).toBe('Calle Larios, Málaga');
    expect(dq.clampZone(null)).toBeNull();
    expect(dq.clampZone({ gx: NaN, gy: 1 })).toBeNull();
  });
});

// ── Saneado de la caché ─────────────────────────────────────────────────────
const validIncident = {
  id: 'u-abc-123',
  category: 'hurto' as const,
  zone: { ...goodZone, lat: 36.7215, lng: -4.4215, address: 'Calle Larios' },
  description: 'Carterista en la entrada del mercado',
  createdAt: NOW - 60_000,
  confirmations: 2,
  confirmedByMe: true,
  flaggedByMe: false,
  mine: false,
};

describe('sanitizeIncident (caché de AsyncStorage)', () => {
  test('acepta un registro válido intacto', () => {
    const out = dq.sanitizeIncident(validIncident, NOW);
    expect(out?.id).toBe('u-abc-123');
    expect(out?.confirmedByMe).toBe(true);
    expect(out?.flaggedByMe).toBeUndefined();
  });

  test('descarta datos corruptos o manipulados', () => {
    expect(dq.sanitizeIncident(null, NOW)).toBeNull();
    expect(dq.sanitizeIncident('hola', NOW)).toBeNull();
    expect(dq.sanitizeIncident({ ...validIncident, category: 'hackeo' }, NOW)).toBeNull();
    expect(dq.sanitizeIncident({ ...validIncident, description: 'corto' }, NOW)).toBeNull();
    // dato personal: no sobrevive ni aunque venga del caché o del servidor
    expect(
      dq.sanitizeIncident({ ...validIncident, description: 'Llama al 600 123 456, se llama Juan' }, NOW),
    ).toBeNull();
    // fecha futura: se tolera un desfase de reloj de 5 min, no más
    expect(dq.sanitizeIncident({ ...validIncident, createdAt: NOW + 60_000 }, NOW)).not.toBeNull();
    expect(dq.sanitizeIncident({ ...validIncident, createdAt: NOW + 10 * 60_000 }, NOW)).toBeNull();
    expect(dq.sanitizeIncident({ ...validIncident, id: '   ' }, NOW)).toBeNull();
  });

  test('repara lo reparable: coordenadas imposibles se recortan a rango', () => {
    const repaired = dq.sanitizeIncident(
      { ...validIncident, zone: { ...goodZone, lat: 999, lng: -4.4215 } },
      NOW,
    );
    expect(repaired?.zone.lat).toBe(90);
    const capped = dq.sanitizeIncident({ ...validIncident, confirmations: 50_000 }, NOW);
    expect(capped?.confirmations).toBe(dq.CONFIRMATIONS_CAP);
  });
});

describe('parseStoredIncidents', () => {
  test('JSON corrupto nunca llega a la UI', () => {
    const { incidents, stats } = dq.parseStoredIncidents('{esto no es json', NOW);
    expect(incidents).toEqual([]);
    expect(stats.corrupt).toBe(true);
  });

  test('mezcla válidos, inválidos y caducados con recuento; dedupe por id', () => {
    const expired = { ...validIncident, id: 'x1', createdAt: NOW - 80 * 3_600_000 };
    const dup = { ...validIncident, id: 'u-abc-123' };
    const arr = JSON.stringify([validIncident, expired, dup, { foo: 1 }]);
    const { incidents, stats } = dq.parseStoredIncidents(arr, NOW);
    expect(incidents.length).toBe(1);
    expect(stats.kept).toBe(1);
    expect(stats.invalid).toBe(2);
    expect(stats.expired).toBe(1);
  });

  test('null (primera ejecución) no marca corrupción', () => {
    const { incidents, stats } = dq.parseStoredIncidents(null, NOW);
    expect(incidents).toEqual([]);
    expect(stats.corrupt).toBe(false);
  });
});

// ── Retención y confianza ───────────────────────────────────────────────────
describe('retención y confianza', () => {
  test('isExpired/pruneExpired: 72 h exactas', () => {
    expect(dq.isExpired(NOW - 72 * 3_600_000, NOW)).toBe(true);
    expect(dq.isExpired(NOW - 72 * 3_600_000 + 1, NOW)).toBe(false);
    const pruned = dq.pruneExpired([validIncident, { ...validIncident, id: 'x2', createdAt: NOW - 100 * 3_600_000 }], NOW);
    expect(pruned.map((i) => i.id)).toEqual(['u-abc-123']);
  });

  test('trustWeight: confirmado = 1, sin confirmar = 0.5', () => {
    expect(dq.trustWeight({ confirmations: 2 })).toBe(1);
    expect(dq.trustWeight({ confirmations: 1 })).toBe(0.5);
  });
});

// ── Deduplicación (espejo del servidor) ─────────────────────────────────────
describe('deduplicación semántica', () => {
  test('findDuplicate: detecta el aviso casi idéntico reciente en la misma celda', () => {
    const existing = [
      { ...validIncident, createdAt: NOW - 10 * 60_000, description: 'Carteristas en la entrada del mercado esta mañana' },
    ];
    const hit = dq.findDuplicate(
      existing,
      { category: 'hurto', zone: goodZone, description: 'Carterista en la entrada del mercado' },
      NOW,
    );
    expect(hit).not.toBeNull();
    expect(hit?.minutesAgo).toBe(10);
  });

  test('findDuplicate: no bloquea lo que no es duplicado', () => {
    const existing = [{ ...validIncident, createdAt: NOW - 10 * 60_000 }];
    expect(
      dq.findDuplicate(existing, { category: 'hurto', zone: goodZone, description: 'Intento de robbery con otra descripción completamente distinta' }, NOW),
    ).toBeNull();
    expect(
      dq.findDuplicate(existing, { category: 'vandalismo', zone: goodZone, description: 'Carterista en la entrada del mercado' }, NOW),
    ).toBeNull();
    // fuera de la ventana (46 min) y en otra celda
    expect(
      dq.findDuplicate([{ ...validIncident, createdAt: NOW - 46 * 60_000 }], { category: 'hurto', zone: goodZone, description: 'Carterista en la entrada del mercado' }, NOW),
    ).toBeNull();
    expect(
      dq.findDuplicate(existing, { category: 'hurto', zone: { gx: 99, gy: 99 }, description: 'Carterista en la entrada del mercado' }, NOW),
    ).toBeNull();
  });

  test('textSimilarity: idénticos = 1, sin solape = 0, invariante a plurales', () => {
    expect(dq.textSimilarity('Han roto la ventana del portal', 'Han roto la ventana del portal')).toBe(1);
    expect(dq.textSimilarity('pintadas en el muro', 'venta de coches en la plaza')).toBe(0);
    expect(dq.textSimilarity('Carteristas en el mercado', 'Carterista en el mercado')).toBe(1);
  });
});

// ── Filtro de privacidad ────────────────────────────────────────────────────
describe('checkText (privacidad como requisito de calidad)', () => {
  test('sin falsos positivos en texto normal', () => {
    for (const text of [
      'Botellón hasta las 3 de la madrugada en la zona deportiva',
      'Han forzado la puerta del portal número 12',
      'Ruido y peleas en la avenida del sur durante la noche',
    ]) {
      expect(priv.checkText(text), `falso positivo en: ${text}`).toBeNull();
    }
  });

  test('bloquea datos personales y variantes de incitación', () => {
    expect(priv.checkText('mi DNI es 12345678-Z')).toBe('No incluyas DNI/NIE.');
    expect(priv.checkText('el IBAN ES91 2100 0418 4502 0005 1332 era suyo')).toBe('No incluyas datos bancarios (IBAN).');
    expect(priv.checkText('Hay que lincharlos esta misma noche')).toBe('No se permiten llamadas a la violencia.');
  });
});

// ── Semillas y geo ──────────────────────────────────────────────────────────
describe('semillas y celda hexagonal', () => {
  test('las semillas pasan el saneado y el filtro', () => {
    for (const s of makeSeed()) {
      expect(dq.sanitizeIncident(s, NOW), `semilla inválida: ${s.description}`).not.toBeNull();
    }
  });

  test('snapToHexGrid es idempotente sobre el centro de su celda (y del servidor)', () => {
    const first = snapToHexGrid(36.7215, -4.4215);
    const again = snapToHexGrid(first.centerLat, first.centerLng);
    expect(again.key).toBe(first.key);
  });
});
