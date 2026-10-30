/**
 * Limpieza de la calle que acompaña a un aviso.
 *
 * El aviso se ubica en una celda de ~450 m, y la calle es un dato opcional
 * que el vecino acepta mostrar. Lo que NO debe publicarse es el número de
 * portal ni la puerta: señalaría una vivienda concreta. Se eliminan los
 * números que van solos entre comas o al final («Calle Mayor 12, Málaga» →
 * «Calle Mayor, Málaga») y se respetan los que forman parte del nombre
 * («Calle 20 de Mayo»).
 */
const MAX_ADDRESS = 120;

export function sanitizeAddress(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/[\s,]+(?:n[ºo°]?\.?\s*)?\d{1,4}\s?[a-zA-Zºª]?(?=\s*(?:,|$))/gi, '');
  s = s.replace(/^[\s,]+|[\s,]+$/g, '');
  return s.slice(0, MAX_ADDRESS);
}
