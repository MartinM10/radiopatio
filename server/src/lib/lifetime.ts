import { config } from '../config';
import { categories } from '../routes/categories';

/**
 * Cuánto vive un aviso.
 *
 *  - Cada categoría tiene su duración base (ttlHours): un incendio dura 12 h,
 *    una farola rota 7 días.
 *  - «¿Sigue ahí?»: en la segunda mitad de su vida, un vecino distinto del autor
 *    que dice que sigue ahí lo amplía la mitad de su duración base, hasta un
 *    máximo de 3 veces la duración base desde que se publicó.
 *  - «Ya está resuelto»: el autor, o `verifiedAt` vecinos distintos que dicen
 *    que ya no está, lo cierra; desaparece a las 2 horas.
 *  - Las coordenadas exactas se borran siempre a las 72 h (config.incidentTtlHours),
 *    dure lo que dure el aviso.
 */
export const RESOLVED_GRACE_HOURS = 2;
/** Un aviso no puede vivir más de esto, en múltiplos de su duración base. */
export const MAX_LIFETIME_FACTOR = 3;

export const categoryTtlHours = (id: string): number =>
  categories.find((c) => c.id === id)?.ttlHours ?? config.incidentTtlHours;

/** Tras cuánto se puede ampliar: la mitad de su duración base. */
export const extensionHours = (ttlHours: number): number => Math.ceil(ttlHours / 2);

/** «Sigue ahí» solo amplía cuando al aviso le queda la mitad de su duración base o menos. */
export const inExtensionWindow = (ttlHours: number, msLeft: number): boolean => msLeft <= (ttlHours * 3_600_000) / 2;

/** Nueva caducidad tras una ampliación, sin pasar del máximo ni acortar la actual. */
export function extendedExpiry(createdAt: Date, expiresAt: Date, ttlHours: number): Date {
  const cap = createdAt.getTime() + MAX_LIFETIME_FACTOR * ttlHours * 3_600_000;
  const next = expiresAt.getTime() + extensionHours(ttlHours) * 3_600_000;
  return new Date(Math.max(expiresAt.getTime(), Math.min(next, cap)));
}

/**
 * Condición SQL de «aviso público y vivo». `alias` incluye el punto, p. ej. 'i.'.
 * Los anteriores a la migración (sin expires_at) siguen la duración por defecto.
 */
export const liveSql = (alias = ''): string =>
  `${alias}status = 'active' AND COALESCE(${alias}expires_at, ${alias}created_at + INTERVAL '${config.incidentTtlHours} hours') > NOW()`;
