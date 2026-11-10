import { describe, expect, test } from 'vitest';
import { Incident } from '../src/data/types';
import { CONFIRMED_AT, setVerifiedAt } from '../src/lib/dataQuality';
import { buildHexGridForIncidents } from '../src/lib/hexgrid';
import { LEVEL_INFO, levelForScore, zoneScore } from '../src/lib/zoneLevel';

const H = 3_600_000;
const NOW = Date.now();

const at = (category: Incident['category'], confirmations = 0, ageH = 1): Incident => ({
  id: `${category}-${confirmations}-${ageH}-${Math.random()}`,
  category,
  zone: { gx: 5, gy: 5, lat: 36.7215, lng: -4.4215 },
  description: 'prueba de nivel de zona',
  createdAt: NOW - ageH * H,
  confirmations,
});

describe('nivel de zona', () => {
  test('la escala: menos de 1 tranquilo, 1-3 moderado, 3-6 atención, 6 o más alerta', () => {
    expect([0, 0.5, 0.99, 1, 1.5, 2.99, 3, 5.5, 6, 12].map(levelForScore)).toEqual([
      'tranquilo', 'tranquilo', 'tranquilo', 'moderado', 'moderado', 'moderado', 'atencion', 'atencion', 'alerta', 'alerta',
    ]);
    expect(LEVEL_INFO.alerta.label).toBe('Alerta vecinal');
  });

  test('los casos de los que se habló: gravedad y verificación importan', () => {
    const verified = CONFIRMED_AT;
    // Una agresión verificada ya no es «tranquilo»; sin verificar tampoco, pero pesa la mitad.
    expect(levelForScore(zoneScore([at('agresion', verified)]))).toBe('atencion');
    expect(levelForScore(zoneScore([at('agresion', 0)]))).toBe('moderado');
    expect(levelForScore(zoneScore([at('hogar', verified)]))).toBe('atencion');
    // Un robo de vehículo verificado (2) es moderado; dos (4), atención.
    expect(levelForScore(zoneScore([at('vehiculo', verified)]))).toBe('moderado');
    expect(levelForScore(zoneScore([at('vehiculo', verified), at('vehiculo', verified)]))).toBe('atencion');
    // Dos agresiones verificadas, alerta.
    expect(levelForScore(zoneScore([at('agresion', verified), at('agresion', verified)]))).toBe('alerta');
    // Un vandalismo sin verificar (0,5) no mueve nada.
    expect(levelForScore(zoneScore([at('vandalismo', 0)]))).toBe('tranquilo');
  });

  test('farolas, cortes de agua y emergencias no son seguridad: no cambian el nivel', () => {
    const noSecurity = (['alumbrado', 'corte_agua', 'corte_luz', 'calzada', 'limpieza', 'perdido', 'arbol', 'inundacion', 'incendio', 'derrumbe', 'calle_cortada', 'otro'] as const)
      .map((c) => at(c, CONFIRMED_AT));
    expect(zoneScore(noSecurity)).toBe(0);
    expect(levelForScore(zoneScore(noSecurity))).toBe('tranquilo');
  });

  test('solo cuentan las últimas 72 h, aunque el aviso siga vivo', () => {
    expect(zoneScore([at('agresion', CONFIRMED_AT, 71)])).toBe(3);
    expect(zoneScore([at('agresion', CONFIRMED_AT, 73)])).toBe(0);
  });

  test('la celda del mapa usa la misma escala que la tarjeta', () => {
    const cell = (incs: Incident[]) => buildHexGridForIncidents(incs, false)[0];
    expect(cell([at('agresion', CONFIRMED_AT)]).level).toBe('atencion');
    expect(cell([at('agresion', 0)]).level).toBe('moderado');
    expect(cell([at('alumbrado', CONFIRMED_AT), at('alumbrado', CONFIRMED_AT)]).level).toBe('tranquilo');
    expect(cell([at('agresion', CONFIRMED_AT), at('agresion', CONFIRMED_AT)]).level).toBe('alerta');
  });

  test('si el servidor sube el umbral de verificación, un aviso con menos confirmaciones pesa la mitad', () => {
    const before = CONFIRMED_AT;
    try {
      setVerifiedAt(5);
      expect(levelForScore(zoneScore([at('agresion', 3)]))).toBe('moderado');
      expect(levelForScore(zoneScore([at('agresion', 5)]))).toBe('atencion');
    } finally {
      setVerifiedAt(before);
    }
  });
});
