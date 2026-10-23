import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify, { FastifyInstance } from 'fastify';
import { config } from './config';
import { categoryRoutes } from './routes/categories';
import { deviceRoutes } from './routes/devices';
import { healthRoutes } from './routes/health';
import { incidentRoutes } from './routes/incidents';
import { moderationRoutes } from './routes/moderation';
import { zoneRoutes } from './routes/zones';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // Permitir requests con Content-Type: application/json y cuerpo vacío sin lanzar FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body: string, done) => {
      if (!body || body.trim() === '') {
        return done(null, {});
      }
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // Capa global de absorción por IP (DDoS/ruido raro), por encima del
  // anti-abuso por dispositivo. /health queda exento (monitores).
  app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/health'),
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'RATE_LIMIT_EXCEEDED',
      // errorResponseBuilderContext.after llega como string (segundos restantes)
      message: `Demasiadas peticiones desde tu dirección. Reintenta en ${Math.max(1, Math.ceil(Number(context.after) || 60))} s.`,
    }),
  });

  app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Admin-Token'],
  });

  // Rutas
  app.register(healthRoutes);
  app.register(categoryRoutes);
  app.register(deviceRoutes);
  app.register(incidentRoutes);
  app.register(moderationRoutes);
  app.register(zoneRoutes);

  return app;
}
