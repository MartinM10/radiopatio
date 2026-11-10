import { Incident } from '../data/types';
import { categoryById, countsForSafety } from '../data/categories';
import { trustWeight } from './dataQuality';
import { inZoneLevelWindow } from './lifetime';

/**
 * Nivel de una zona: una sola escala para la tarjeta del mapa y para cada celda
 * (espejo de levelForScore en server/src/lib/quality.ts).
 *
 * Puntos = gravedad × peso (1 verificado, 0,5 sin verificar), sumados sobre los
 * avisos de SEGURIDAD de las últimas 72 h. Una farola rota, un corte de agua o
 * un árbol caído no dicen nada de la seguridad de un barrio, y por eso no cuentan.
 *   menos de 1 → Tranquilo · de 1 a 3 → Moderado · de 3 a 6 → Atención · 6 o más → Alerta
 * Así una agresión verificada (3) ya es «Atención», una sin verificar (1,5) es
 * «Moderado», y un vandalismo sin verificar (0,5) no mueve nada.
 */
export type ZoneLevelId = 'tranquilo' | 'moderado' | 'atencion' | 'alerta';

export const levelForScore = (score: number): ZoneLevelId =>
  score < 1 ? 'tranquilo' : score < 3 ? 'moderado' : score < 6 ? 'atencion' : 'alerta';

export const LEVEL_INFO: Record<ZoneLevelId, { label: string; color: string }> = {
  tranquilo: { label: 'Tranquilo', color: '#22C55E' },
  moderado: { label: 'Moderado', color: '#EAB308' },
  atencion: { label: 'Atención', color: '#F97316' },
  alerta: { label: 'Alerta vecinal', color: '#EF4444' },
};

/** Puntos que aporta un aviso al nivel de la zona. */
export const levelPoints = (i: Pick<Incident, 'category' | 'createdAt' | 'confirmations'>, now: number = Date.now()): number =>
  countsForSafety(i.category) && inZoneLevelWindow(i.createdAt, now) ? categoryById(i.category).severity * trustWeight(i) : 0;

export const zoneScore = (incidents: ReadonlyArray<Pick<Incident, 'category' | 'createdAt' | 'confirmations'>>, now: number = Date.now()): number =>
  incidents.reduce((s, i) => s + levelPoints(i, now), 0);
