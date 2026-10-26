export const colors = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#F1F5F9',
  line: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#334155',
  muted: '#64748B',
  primary: '#FF5A4F',
  primarySoft: 'rgba(255,90,79,0.12)',
  accent: '#4F46E5',
  ok: '#10B981',
  warn: '#F59E0B',
  danger: '#EF4444',
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
