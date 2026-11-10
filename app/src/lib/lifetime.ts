import { categoryById } from '../data/categories';
import { Incident } from '../data/types';

/**
 * Cuánto vive un aviso y cuándo se puede preguntar «¿sigue ahí?».
 * Espejo de server/src/lib/lifetime.ts: el servidor manda y decide; aquí solo
 * se calcula lo que la pantalla necesita mostrar (cuánto le queda, si toca
 * preguntar). Los números salen de la API, no están escritos a mano.
 */
export const H = 3_600_000;

type Timed = Pick<Incident, 'createdAt' | 'category' | 'expiresAt'>;

/** Cuándo caduca: lo que dice el servidor o, en datos antiguos, la duración de su categoría. */
export const expiresAtOf = (i: Timed): number => i.expiresAt ?? i.createdAt + categoryById(i.category).ttlHours * H;

export const isExpired = (i: Timed, now: number = Date.now()): boolean => now >= expiresAtOf(i);

/** «12 horas», «2 días»: para decir cuánto va a durar un aviso. */
export const formatDuration = (hours: number): string => {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} días`;
  if (hours >= 48) return `${Math.round(hours / 24)} días`;
  return hours === 1 ? '1 hora' : `${hours} horas`;
};

/** «5 días», «3 h», «40 min»: lo que le queda a un aviso. */
export const formatTimeLeft = (ms: number): string => {
  const left = Math.max(0, ms);
  const h = Math.floor(left / H);
  // Redondeado: a un aviso de 3 días al que le quedan 71 h no se le llama «2 días».
  if (h >= 48) return `${Math.round(left / (24 * H))} días`;
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.round(left / 60_000))} min`;
};

/** Texto de la caducidad en el detalle. */
export const expiryLabel = (i: Timed & Pick<Incident, 'resolved'>, now: number = Date.now()): string =>
  i.resolved ? `Resuelto · desaparece en ${formatTimeLeft(expiresAtOf(i) - now)}` : `Caduca en ${formatTimeLeft(expiresAtOf(i) - now)}`;

/** ¿Está en la segunda mitad de su vida, que es cuando se pregunta «¿sigue ahí?»? */
export const inPresenceWindow = (i: Timed, now: number = Date.now()): boolean => {
  const left = expiresAtOf(i) - now;
  return left > 0 && left <= (categoryById(i.category).ttlHours * H) / 2;
};

/** ¿Se le debe preguntar «¿sigue ahí?» a este usuario por este aviso? */
export const shouldAskPresence = (i: Timed & Pick<Incident, 'mine' | 'resolved' | 'presenceVote'>, now: number = Date.now()): boolean =>
  !i.mine && !i.resolved && i.presenceVote === undefined && inPresenceWindow(i, now);

/** El nivel de la zona solo mira las últimas 72 h, aunque un aviso dure más (una farola rota no debe disparar «Alerta» una semana). */
export const ZONE_LEVEL_HOURS = 72;
export const inZoneLevelWindow = (createdAt: number, now: number = Date.now()): boolean => now - createdAt < ZONE_LEVEL_HOURS * H;
