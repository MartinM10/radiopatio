import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import {
  deleteDeviceData,
  identityHashFor,
  issueDeviceForIdentity,
  lookupDevice,
  registerDevice,
} from '../lib/device';

const googleSchema = z.object({
  idToken: z.string().min(10),
});

const otpRequestSchema = z.object({
  phone: z.string().min(9).max(20),
});

const otpVerifySchema = z.object({
  phone: z.string().min(9).max(20),
  code: z.string().min(4).max(8),
});

/**
 * Cuentas pseudónimas de dispositivo.
 *
 * El servidor EMITE el token y solo guarda su hash. Hay dos clases de cuenta:
 *  - anónima (POST /api/devices/register): limitada por IP; con
 *    REQUIRE_VERIFIED_IDENTITY=1 no puede escribir.
 *  - verificada (Google / SMS): una identidad verificada = un dispositivo.
 *    Un nuevo login ROTA el token del mismo dispositivo, no crea otro.
 */
export async function deviceRoutes(app: FastifyInstance) {
  // POST /api/devices/register — alta anónima, con freno por IP.
  app.post(
    '/api/devices/register',
    {
      config: {
        rateLimit: {
          max: () => config.registerRateMax,
          timeWindow: '1 hour',
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const issued = await registerDevice();
      return reply.status(201).send({
        data: {
          deviceId: issued.deviceId,
          token: issued.token,
          verified: false,
          note: 'Guarda el token; no volverá a mostrarse. Es pseudónimo: no va asociado a ninguna identidad.',
        },
      });
    },
  );

  // GET /api/devices/status — estado de la identidad del dispositivo (sin revelar el token)
  app.get('/api/devices/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const headerVal = req.headers['x-device-token'];
    if (typeof headerVal !== 'string' || headerVal.trim().length === 0) {
      return reply.status(200).send({ data: { registered: false, verified: false } });
    }
    const device = await lookupDevice(headerVal.trim());
    return reply.status(200).send({
      data: { registered: device !== null, verified: device?.verified ?? false },
    });
  });

  // DELETE /api/devices/me — derecho de supresión: borra la identidad del
  // dispositivo y todo lo que publicó. Es irreversible.
  app.delete(
    '/api/devices/me',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const headerVal = req.headers['x-device-token'];
      const device =
        typeof headerVal === 'string' && headerVal.trim().length > 0
          ? await lookupDevice(headerVal.trim())
          : null;
      if (!device) {
        return reply.status(401).send({
          error: 'INVALID_DEVICE_TOKEN',
          message: 'No hay ninguna identidad asociada a este dispositivo.',
        });
      }
      await deleteDeviceData(device.id);
      return reply.status(200).send({ data: { deleted: true } });
    },
  );

  // POST /api/auth/google — verifica el id_token de Google y emite el token
  // de la identidad (una cuenta de Google = un dispositivo).
  app.post(
    '/api/auth/google',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseRes = googleSchema.safeParse(req.body);
      if (!parseRes.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
      }

      // Fail-closed: sin el client ID propio no se puede comprobar que el
      // token fue emitido para ESTA aplicación; se rechaza en vez de aceptarlo.
      if (!config.googleClientId) {
        return reply.status(503).send({
          error: 'AUTH_NOT_CONFIGURED',
          message: 'El inicio de sesión con Google no está disponible todavía.',
        });
      }

      const { idToken } = parseRes.data;

      // Verificar el id_token contra Google (el endpoint tokeninfo valida
      // firma y caducidad; audience e issuer se comprueban aquí).
      let payload: { sub?: string; aud?: string; iss?: string; exp?: string } | null = null;
      try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!res.ok) {
          return reply.status(401).send({ error: 'INVALID_GOOGLE_TOKEN', message: 'El token de Google no es válido o ha caducado.' });
        }
        payload = (await res.json()) as { sub?: string; aud?: string; iss?: string; exp?: string };
      } catch {
        return reply.status(502).send({ error: 'GOOGLE_UNAVAILABLE', message: 'No se pudo verificar el token con Google.' });
      }

      if (payload?.aud !== config.googleClientId) {
        return reply.status(401).send({ error: 'INVALID_AUDIENCE', message: 'El token no corresponde a esta aplicación.' });
      }
      if (payload?.iss !== 'accounts.google.com' && payload?.iss !== 'https://accounts.google.com') {
        return reply.status(401).send({ error: 'INVALID_ISSUER', message: 'Emisor del token no válido.' });
      }
      if (payload?.exp && Number(payload.exp) * 1000 < Date.now()) {
        return reply.status(401).send({ error: 'TOKEN_EXPIRED', message: 'El token de Google ha caducado.' });
      }
      const subject = payload?.sub;
      if (!subject) {
        return reply.status(401).send({ error: 'MISSING_SUBJECT', message: 'El token no contiene un subject válido.' });
      }

      // Solo se guarda el HMAC del `sub`: ni email, ni nombre, ni el sub en claro.
      const issued = await issueDeviceForIdentity(identityHashFor('google', subject));
      return reply.status(201).send({
        data: {
          deviceId: issued.deviceId,
          token: issued.token,
          verified: true,
          note: 'Identidad verificada. Un nuevo inicio de sesión invalida el token anterior.',
        },
      });
    },
  );

  // SMS OTP: pendiente de proveedor. Fail-closed: mientras no exista una
  // verificación real del código, NO se emite ninguna cuenta por esta vía.
  app.post('/api/auth/otp/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = otpRequestSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
    }
    return reply.status(501).send({
      error: 'NOT_IMPLEMENTED',
      message: 'La verificación por SMS todavía no está disponible: falta integrar un proveedor de SMS (docs/TRUST.md §2).',
    });
  });

  app.post('/api/auth/otp/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = otpVerifySchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
    }
    return reply.status(501).send({
      error: 'NOT_IMPLEMENTED',
      message: 'La verificación por SMS todavía no está disponible: falta integrar un proveedor de SMS (docs/TRUST.md §2).',
    });
  });
}
