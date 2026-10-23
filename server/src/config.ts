import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://radiopatio:radiopatio_dev_secret@localhost:5432/radiopatio',
  deviceSalt:
    process.env.DEVICE_SALT || 'radiopatio_anonymous_salt_change_in_production',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  incidentTtlHours: parseInt(process.env.INCIDENT_TTL_HOURS || '72', 10),
  maxFlagsBeforeHide: parseInt(process.env.MAX_FLAGS_BEFORE_HIDE || '3', 10),
  // Moderadores (docs/TRUST.md §3 capa 5). En producción, define ADMIN_TOKEN.
  adminToken: process.env.ADMIN_TOKEN || 'radiopatio_admin_dev_change_me',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  // Fase 2: cuarentena de ráfagas y presencia (anti-teleport).
  quarantineThreshold: parseInt(process.env.QUARANTINE_THRESHOLD || '5', 10),
  teleportKm: parseInt(process.env.TELEPORT_KM || '50', 10),
  teleportWindowMin: parseInt(process.env.TELEPORT_WINDOW_MIN || '120', 10),
  // Juez secundario (Myrmo-style): score-only, nunca gatekeeper.
  judgeEnabled: process.env.JUDGE_ENABLED === '1',
  judgeProvider: process.env.JUDGE_PROVIDER || '',
  judgeModel: process.env.JUDGE_MODEL || '',
  // Purga de retención caducada (minimización RGPD).
  purgeIntervalMinutes: parseInt(process.env.PURGE_INTERVAL_MINUTES || '15', 10),
  // Absorción global por IP por encima del anti-abuso por dispositivo.
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
};

if (config.env === 'production' && config.adminToken === 'radiopatio_admin_dev_change_me') {
  console.warn('[seguridad] ADMIN_TOKEN no definido en producción: usa un valor propio.');
}
if (config.env === 'production' && config.deviceSalt === 'radiopatio_anonymous_salt_change_in_production') {
  console.warn('[seguridad] DEVICE_SALT no definido en producción: usa un valor propio.');
}
