/**
 * Calle que acompaña a un aviso (opcional). Espejo de server/src/lib/address.ts:
 * el número de portal y la puerta no se publican porque señalarían una vivienda
 * concreta. «Calle Mayor 12, Málaga» → «Calle Mayor, Málaga»; los números que
 * forman parte del nombre («Calle 20 de Mayo») se respetan.
 */
export const MAX_ADDRESS = 120;

export const sanitizeAddress = (raw: string): string =>
  raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,]+(?:n[ºo°]?\.?\s*)?\d{1,4}\s?[a-zA-Zºª]?(?=\s*(?:,|$))/gi, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .slice(0, MAX_ADDRESS);

/**
 * Calle mostrable de un aviso. Versiones anteriores guardaban textos como
 * «Ubicación GPS [36.63, -4.49]» cuando no se conocía la calle: no se muestran.
 */
export const readableAddress = (address?: string | null): string | null => {
  const a = address?.trim();
  if (!a || a.includes('[') || /\d{1,3}\.\d{3,}/.test(a)) return null;
  return a;
};
