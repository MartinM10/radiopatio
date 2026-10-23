export const colors = {
  bg: '#0B1020',
  surface: '#151B30',
  surface2: '#1E2640',
  line: '#2A3354',
  text: '#F4F6FF',
  muted: '#8A93B2',
  primary: '#FF5A4F',
  primarySoft: 'rgba(255,90,79,0.16)',
  accent: '#5B8CFF',
  ok: '#34D399',
  warn: '#FBBF24',
  danger: '#FF5A4F',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const severityColor: Record<1 | 2 | 3, string> = {
  1: '#FBBF24',
  2: '#FB923C',
  3: '#FF5A4F',
};

export const severityLabel: Record<1 | 2 | 3, string> = {
  1: 'Aviso',
  2: 'Importante',
  3: 'Grave',
};
