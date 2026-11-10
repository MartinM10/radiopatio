import { describe, expect, test } from 'vitest';
import { categories, categoryById, countsForSafety, isLifeThreatening } from '../src/data/categories';
import { Incident } from '../src/data/types';
import { buildHexGridForIncidents } from '../src/lib/hexgrid';

const at = (category: Incident['category'], confirmations = 3): Incident => ({
  id: `${category}-${confirmations}-${Math.random()}`,
  category,
  zone: { gx: 5, gy: 5, lat: 36.7215, lng: -4.4215 },
  description: 'prueba',
  createdAt: Date.now(),
  confirmations,
});

describe('emergencias y clima', () => {
  test('hay cinco categorías en el grupo, con iconos propios', () => {
    const ids = categories.filter((c) => c.group === 'emergencias').map((c) => c.id);
    expect(ids).toEqual(['inundacion', 'incendio', 'derrumbe', 'arbol', 'calle_cortada']);
  });

  test('no cuentan para el nivel de seguridad; el resto sí', () => {
    expect(countsForSafety('inundacion')).toBe(false);
    expect(countsForSafety('calle_cortada')).toBe(false);
    expect(countsForSafety('hogar')).toBe(true);
    expect(countsForSafety('corte_agua')).toBe(true);
  });

  test('solo las graves piden llamar antes al 112', () => {
    expect(['inundacion', 'incendio', 'derrumbe'].every((id) => isLifeThreatening(id as Incident['category']))).toBe(true);
    expect(isLifeThreatening('arbol')).toBe(false);
    expect(isLifeThreatening('agresion')).toBe(false);
  });

  test('una celda llena de inundaciones sigue «tranquila» en seguridad', () => {
    const flooded = buildHexGridForIncidents([at('inundacion'), at('inundacion'), at('derrumbe'), at('arbol')], false);
    expect(flooded).toHaveLength(1);
    expect(flooded[0].level).toBe('tranquilo');

    const robbed = buildHexGridForIncidents([at('hogar'), at('hogar'), at('agresion')], false);
    expect(robbed[0].level).not.toBe('tranquilo');
  });
});

describe('foto en los avisos', () => {
  test('solo donde no hay una persona señalada: objeto perdido, servicios y emergencias', () => {
    const withPhoto = ['perdido', 'corte_agua', 'corte_luz', 'alumbrado', 'calzada', 'limpieza', 'inundacion', 'incendio', 'derrumbe', 'arbol', 'calle_cortada'];
    const withoutPhoto = ['hogar', 'vehiculo', 'hurto', 'agresion', 'vandalismo', 'sospechoso', 'altercado', 'otro'];
    for (const id of withPhoto) expect(categoryById(id as Incident['category']).allowsPhoto).toBe(true);
    for (const id of withoutPhoto) expect(categoryById(id as Incident['category']).allowsPhoto).toBeFalsy();
    expect(withPhoto.length + withoutPhoto.length).toBe(categories.length);
  });
});
