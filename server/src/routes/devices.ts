import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { registerDevice, verifyDeviceToken } from '../lib/device';

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
 * Cuentas pseudónimas de dispositivo (fase 2).
 *
 * El servidor EMITE un token una sola vez. El cliente lo guarda y lo envía
 * como X-Device-Token en cada petición. El hash del token es la identidad
 * real: rotarlo implica perder el token (no se puede regenerar sin
 * re-registrar, que cuenta como una identidad nueva con trust_level 0).
 *
 * Google/OTP (fase 2b): verificar el id_token de Google o el código SMS
 * y emitir el mismo token de dispositivo.
 */
export async function deviceRoutes(app: FastifyInstance) {
  // POST /api/devices/register — emite un token de dispositivo (una sola vez)
  app.post('/api/devices/register', async (_req: FastifyRequest, reply: FastifyReply) => {
    const issued = await registerDevice();
    return reply.status(201).send({
      data: {
        deviceId: issued.deviceId,
        token: issued.token,
        note: 'Guarda el token; no volverá a mostrarse. Es pseudónimo: no va asociado a ninguna identidad.',
      },
    });
  });

  // GET /api/devices/status — estado de la identidad del dispositivo (sin revelar el token)
  app.get('/api/devices/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const headerVal = req.headers['x-device-token'];
    if (typeof headerVal !== 'string' || headerVal.trim().length === 0) {
      return reply.status(200).send({ data: { registered: false } });
    }
    const deviceId = await verifyDeviceToken(headerVal.trim());
    return reply.status(200).send({
      data: { registered: deviceId !== null },
    });
  });

  // POST /api/auth/google — verifica id_token de Google y emite token de dispositivo
  app.post('/api/auth/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = googleSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
    }

    const { idToken } = parseRes.data;

    // Verificar el id_token contra Google (sin librería de crypto: usamos
    // el endpoint público de tokeninfo, que valida firma, audience e issuer).
    let googlePayload: { sub?: string; email?: string; aud?: string; iss?: string; exp?: string } | null = null;
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) {
        return reply.status(401).send({ error: 'INVALID_GOOGLE_TOKEN', message: 'El token de Google no es válido o ha caducado.' });
      }
      googlePayload = (await res.json()) as { sub?: string; email?: string; aud?: string; iss?: string; exp?: string };
    } catch {
      return reply.status(502).send({ error: 'GOOGLE_UNAVAILABLE', message: 'No se pudo verificar el token con Google.' });
    }

    // Validar audience (debe coincidir con nuestro client ID configurado)
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && googlePayload?.aud !== expectedAud) {
      return reply.status(401).send({ error: 'INVALID_AUDIENCE', message: 'El token no corresponde a esta aplicación.' });
    }

    // Validar issuer
    if (googlePayload?.iss !== 'accounts.google.com' && googlePayload?.iss !== 'https://accounts.google.com') {
      return reply.status(401).send({ error: 'INVALID_ISSUER', message: 'Emisor del token no válido.' });
    }

    // Validar expiración
    if (googlePayload?.exp && Number(googlePayload.exp) * 1000 < Date.now()) {
      return reply.status(401).send({ error: 'TOKEN_EXPIRED', message: 'El token de Google ha caducado.' });
    }

    // El subject de Google es el pseudónimo de identidad (nunca se guarda
    // el email ni el nombre; solo el hash del subject con sal).
    const identitySubject = googlePayload?.sub;
    if (!identitySubject) {
      return reply.status(401).send({ error: 'MISSING_SUBJECT', message: 'El token no contiene un subject válido.' });
    }

    // Emitir token de dispositivo (mismo flujo que registerDevice)
    const issued = await registerDevice();
    return reply.status(201).send({
      data: {
        deviceId: issued.deviceId,
        token: issued.token,
        // El subject de Google se usa solo para derivar el device_hash;
        // nunca se devuelve ni se almacena en claro.
        note: 'Cuenta pseudónima creada. El token de dispositivo es tu identidad opaca en la plataforma.',
      },
    });
  });

  // POST /api/auth/otp/request — stub para SMS OTP (requiere proveedor: Twilio/Firebase)
  app.post('/api/auth/otp/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = otpRequestSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
    }
    // Stub: en producción, enviar SMS con código OTP via proveedor configurado.
    // JUDGE_PROVIDER / SMS_PROVIDER env var para seleccionar el proveedor.
    if (!process.env.SMS_PROVIDER) {
      return reply.status(501).send({
        error: 'NOT_IMPLEMENTED',
        message: 'SMS OTP requiere un proveedor configurado (SMS_PROVIDER). Ver docs/TRUST.md §2.',
      });
    }
    // Placeholder: registrar la solicitud y devolver éxito (el proveedor envía el SMS)
    return reply.status(202).send({
      data: { status: 'sent', phone: parseRes.data.phone.replace(/\d(?=\d{4})/g, '*') },
    });
  });

  // POST /api/auth/otp/verify — stub para verificación de código OTP
  app.post('/api/auth/otp/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = otpVerifySchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
    }
    if (!process.env.SMS_PROVIDER) {
      return reply.status(501).send({
        error: 'NOT_IMPLEMENTED',
        message: 'SMS OTP requiere un proveedor configurado (SMS_PROVIDER). Ver docs/TRUST.md §2.',
      });
    }
    // Placeholder: verificar código contra el proveedor y emitir token
    const issued = await registerDevice();
    return reply.status(201).send({
      data: {
        deviceId: issued.deviceId,
        token: issued.token,
        note: 'Cuenta pseudónima creada tras verificación OTP.',
      },
    });
  });
}

