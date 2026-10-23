/**
 * Filtro de privacidad: el texto de un aviso no puede identificar a personas
 * ni contener datos personales (RGPD art. 10 / LOPDGDD art. 10).
 *
 * Espejo del filtro del servidor (server/src/lib/privacy.ts). Primero los
 * patrones más específicos: el mensaje debe decirle al vecino exactamente
 * qué dato está colando. Los genéricos van al final.
 */
const patterns: { re: RegExp; msg: string }[] = [
  { re: /\b\d{8}\s?-?[A-Z]\b/i, msg: 'No incluyas DNI/NIE.' },
  { re: /\b[XYZ]\d{7}\s?-?[A-Z]\b/i, msg: 'No incluyas DNI/NIE.' },
  { re: /\b[A-Z]{1,2}-\d{4,6}(?:-[A-Z]{1,2})?\b/i, msg: 'No incluyas matrículas de vehículos.' },
  { re: /\b\d{4}\s?-?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/i, msg: 'No incluyas matrículas de vehículos.' },
  { re: /\bES\s?\d{2}(?:[\s.-]?\d{4}){5}\b/i, msg: 'No incluyas datos bancarios (IBAN).' },
  { re: /\b\d{4}(?:[\s-]?\d{4}){3}\b/, msg: 'No incluyas números de tarjeta.' },
  { re: /(\+?\d[\s.-]?){9,}/, msg: 'No incluyas números de teléfono.' },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, msg: 'No incluyas correos electrónicos.' },
  { re: /https?:\/\/|www\./i, msg: 'No incluyas enlaces.' },
  {
    re: /\b(moro|moros|gitano|gitanos|negro|negros|inmigrante|inmigrantes|extranjero|extranjeros|sudaca|sudacas|rumano|rumanos|marroqu[ií]es?|magreb[ií]es?|ilegales?)\b/i,
    msg: 'No describas a personas por su origen, etnia o aspecto. Cuenta qué ocurrió, no quién.',
  },
  {
    re: /\b(se llama|llamado|llamada|apodado|conocido como|vive en el|su casa es)\b/i,
    msg: 'No identifiques a personas concretas. Cuenta qué ocurrió, no quién.',
  },
  {
    re: /\b(?:hay que|vamos a|vayamos a|tenemos que)\s+(?:matar|linchar|quemar|pegar)\b/i,
    msg: 'No se permiten llamadas a la violencia.',
  },
  {
    re: /\b(?:m[aá]talo|m[aá]talos|m[aá]tadlo|m[aá]tadlos|linchadlo|linchadlos|lincharlo|lincharlos|quemadlo|quemadlos|pegadlo|pegadlos)\b/i,
    msg: 'No se permiten llamadas a la violencia.',
  },
];

export const checkText = (text: string): string | null => {
  for (const p of patterns) {
    if (p.re.test(text)) return p.msg;
  }
  return null;
};

export const timeAgo = (ts: number): string => {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
};

export const HOURS_VISIBLE = 72;

export const isActive = (ts: number): boolean => Date.now() - ts < HOURS_VISIBLE * 3_600_000;

/** 1 = reciente, 0 = a punto de caducar. */
export const freshness = (ts: number): number =>
  Math.max(0, 1 - (Date.now() - ts) / (HOURS_VISIBLE * 3_600_000));
