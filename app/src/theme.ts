/**
 * Tema «Nocturna en claro»: la estructura de la propuesta nocturna (mapa a
 * pantalla completa, paneles flotantes, color por categoría) sobre superficies
 * claras. El índigo de la web es el color de acción; el coral queda reservado
 * para avisar (botón de publicar, urgencias, contadores).
 */
export const colors = {
  bg: '#F3F5FB',
  surface: '#FFFFFF',
  surface2: '#EDF0F8',
  line: '#DFE4F1',
  text: '#121A33',
  textMuted: '#39425E',
  muted: '#667092',
  primary: '#4F46E5',
  primarySoft: 'rgba(79,70,229,0.10)',
  accent: '#4F46E5',
  alert: '#FF5A4F',
  alertSoft: 'rgba(255,90,79,0.12)',
  ok: '#0FA97A',
  warn: '#F59E0B',
  danger: '#EF4444',
};

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

/** Sombra de los paneles que flotan sobre el mapa y de las tarjetas. */
export const shadow = {
  float: {
    shadowColor: '#1B2559',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  card: {
    shadowColor: '#1B2559',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;

/**
 * Plus Jakarta Sans (la fuente de la web). Cada peso es una familia propia y
 * se usa SIN fontWeight: si se combinan, Android engorda la letra por su cuenta.
 */
export const font = {
  body: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
} as const;

export const severityColor: Record<1 | 2 | 3, string> = {
  1: '#E0A100',
  2: '#F0792B',
  3: '#F0483E',
};

export const severityLabel: Record<1 | 2 | 3, string> = {
  1: 'Aviso',
  2: 'Importante',
  3: 'Grave',
};
