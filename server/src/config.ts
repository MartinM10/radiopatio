import dotenv from 'dotenv';

dotenv.config();

/** Valores de desarrollo: públicos en el repositorio, jamás válidos en producción. */
const DEV_DATABASE_URL = 'postgres://radiopatio:radiopatio_dev_secret@localhost:5432/radiopatio';
const DEV_DEVICE_SALT = 'radiopatio_anonymous_salt_change_in_production';
const DEV_ADMIN_TOKEN = 'radiopatio_admin_dev_change_me';
const MIN_SECRET_LENGTH = 32;

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || DEV_DATABASE_URL,
  deviceSalt: process.env.DEVICE_SALT || DEV_DEVICE_SALT,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  incidentTtlHours: parseInt(process.env.INCIDENT_TTL_HOURS || '72', 10),
  maxFlagsBeforeHide: parseInt(process.env.MAX_FLAGS_BEFORE_HIDE || '3', 10),
  // Moderadores (docs/TRUST.md §3 capa 5). En producción, define ADMIN_TOKEN.
  adminToken: process.env.ADMIN_TOKEN || DEV_ADMIN_TOKEN,
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

  // ── Identidad y anti-Sybil ────────────────────────────────────────────────
  // Detrás de un proxy inverso (Caddy), req.ip es la IP del proxy salvo que se
  // confíe en X-Forwarded-For. SOLO activar si el servidor no es accesible
  // directamente: si no, cualquiera falsificaría su IP y evitaría los límites.
  trustProxy: process.env.TRUST_PROXY === '1',
  // Altas de dispositivo por IP y hora. Freno, no muro: varios vecinos pueden
  // compartir IP (CGNAT móvil), así que el tope no puede ser muy bajo.
  registerRateMax: parseInt(process.env.REGISTER_RATE_MAX || '10', 10),
  // Si está activo, solo las cuentas con identidad verificada (Google/SMS)
  // pueden publicar, confirmar o denunciar. Activar en cuanto la app incluya
  // el inicio de sesión; sin esto, un dispositivo anónimo basta para escribir.
  requireVerifiedIdentity: process.env.REQUIRE_VERIFIED_IDENTITY === '1',
  // Client ID de OAuth de Google. Sin él, el login con Google se rechaza
  // (fail-closed): jamás se aceptan tokens emitidos para otra aplicación.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // ── Geocodificación inversa (calle sugerida al fijar el pin) ──────────────
  // El servidor consulta un servicio externo con las coordenadas, sin ninguna
  // identidad del vecino (ver lib/geocode.ts). GEOCODER_ENABLED=0 la apaga y
  // la app pide la calle a mano; GEOCODER_URL permite un Nominatim propio.
  geocoderEnabled: process.env.GEOCODER_ENABLED !== '0',
  geocoderUrl: (process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, ''),
  geocoderContact: process.env.GEOCODER_CONTACT || 'privacidad@radiopatio.app',
};

type ProductionView = Pick<typeof config, 'env' | 'databaseUrl' | 'deviceSalt' | 'adminToken'>;

/** Problemas que impiden arrancar en producción (vacío = configuración válida). */
export function productionConfigProblems(c: ProductionView = config): string[] {
  if (c.env !== 'production') return [];
  const problems: string[] = [];
  if (c.deviceSalt === DEV_DEVICE_SALT || c.deviceSalt.length < MIN_SECRET_LENGTH) {
    problems.push(`DEVICE_SALT debe definirse con un secreto propio de al menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  if (c.adminToken === DEV_ADMIN_TOKEN || c.adminToken.length < MIN_SECRET_LENGTH) {
    problems.push(`ADMIN_TOKEN debe definirse con un secreto propio de al menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  if (c.databaseUrl === DEV_DATABASE_URL) {
    problems.push('DATABASE_URL apunta a la base de datos de desarrollo');
  }
  return problems;
}

/** Fail-closed: en producción, con secretos débiles o por defecto el servidor NO arranca. */
export function assertProductionConfig(c: ProductionView = config): void {
  const problems = productionConfigProblems(c);
  if (problems.length > 0) {
    throw new Error(`[seguridad] configuración de producción inválida:\n - ${problems.join('\n - ')}`);
  }
}
