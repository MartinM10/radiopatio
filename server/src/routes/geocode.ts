import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { lookupDevice } from '../lib/device';
import { reverseGeocode } from '../lib/geocode';

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function geocodeRoutes(app: FastifyInstance) {
  // POST (y no GET) para que las coordenadas viajen en el cuerpo y nunca
  // aparezcan en la URL de los registros de acceso.
  app.post(
    '/api/geocode/reverse',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      // Cualquier dispositivo registrado: la sugerencia de calle se pide antes
      // de verificar la identidad, que solo se exige al publicar.
      const header = req.headers['x-device-token'];
      const token = typeof header === 'string' ? header.trim() : '';
      if (!token) {
        return reply.status(401).send({
          error: 'DEVICE_TOKEN_REQUIRED',
          message: 'Necesitas una cuenta de dispositivo para esta acción. Reinicia la app e inténtalo de nuevo.',
        });
      }
      if (!(await lookupDevice(token))) {
        return reply.status(401).send({
          error: 'INVALID_DEVICE_TOKEN',
          message: 'Tu sesión de dispositivo ya no es válida. Reinicia la app e inténtalo de nuevo.',
        });
      }

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Coordenadas no válidas.' });
      }

      const data = await reverseGeocode(parsed.data.lat, parsed.data.lng);
      return reply.status(200).send({ data });
    },
  );
}
