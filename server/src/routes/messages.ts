import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db';
import { authenticateWrite, resolveReadHash } from '../lib/device';
import { notifyMessage } from '../lib/notify';
import { checkText } from '../lib/privacy';

/**
 * Chat anónimo por aviso (TRUST.md: el mismo principio que las confirmaciones,
 * ampliado a conversación). Nadie ve quién escribe, solo «Tú» o «Un vecino»:
 * el servidor nunca manda el device_hash a la app, solo si el mensaje es `mine`.
 */

const postMessageSchema = z.object({
  body: z.string().trim().min(1, 'Escribe algo antes de enviar.').max(280, 'El mensaje no puede superar 280 caracteres'),
});

interface MessageRow {
  id: number;
  body: string;
  created_at: Date;
  device_hash: string;
}

export async function messageRoutes(app: FastifyInstance) {
  // GET /api/incidents/:id/messages — lectura pública, como el resto del aviso.
  app.get<{ Params: { id: string } }>('/api/incidents/:id/messages', async (req, reply) => {
    const { id } = req.params;
    const incRes = await pool.query(`SELECT id FROM incidents WHERE id = $1 AND status = 'active'`, [id]);
    if (incRes.rowCount === 0) {
      return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });
    }
    const myHash = await resolveReadHash(req);
    const rows = await pool.query<MessageRow>(
      `SELECT id, body, created_at, device_hash FROM incident_messages WHERE incident_id = $1 ORDER BY created_at ASC LIMIT 200`,
      [id],
    );
    return {
      data: rows.rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: new Date(r.created_at).getTime(),
        mine: r.device_hash === myHash,
      })),
    };
  });

  // POST /api/incidents/:id/messages
  app.post<{ Params: { id: string }; Body: { body?: string } }>(
    '/api/incidents/:id/messages',
    {
      config: {
        rateLimit: {
          max: () => config.messageRateMax,
          timeWindow: '1 hour',
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string }; Body: { body?: string } }>, reply: FastifyReply) => {
      const auth = await authenticateWrite(req, reply);
      if (!auth) return reply;

      const parsed = postMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      }
      const privacyIssue = checkText(parsed.data.body);
      if (privacyIssue) {
        return reply.status(400).send({ error: 'PRIVACY_VIOLATION', message: privacyIssue });
      }

      const { id } = req.params;
      const incRes = await pool.query(`SELECT device_hash, category FROM incidents WHERE id = $1 AND status = 'active'`, [id]);
      if (incRes.rowCount === 0) {
        return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });
      }
      const incident = incRes.rows[0] as { device_hash: string; category: string };

      const inserted = await pool.query<{ id: number; created_at: Date }>(
        `INSERT INTO incident_messages (incident_id, device_hash, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [id, auth.deviceHash, parsed.data.body],
      );

      void notifyMessage(id, incident.category, incident.device_hash, auth.deviceHash, parsed.data.body);

      return reply.status(201).send({
        data: {
          id: inserted.rows[0].id,
          body: parsed.data.body,
          createdAt: new Date(inserted.rows[0].created_at).getTime(),
          mine: true,
        },
      });
    },
  );

  // GET /api/incidents/:id/photo — pública, igual que el resto del aviso.
  app.get<{ Params: { id: string } }>('/api/incidents/:id/photo', async (req, reply) => {
    const { id } = req.params;
    const res = await pool.query<{ photo: Buffer | null; photo_mime: string | null }>(
      `SELECT photo, photo_mime FROM incidents WHERE id = $1 AND status = 'active'`,
      [id],
    );
    if (res.rowCount === 0 || !res.rows[0].photo) {
      return reply.status(404).send({ error: 'PHOTO_NOT_FOUND', message: 'Este aviso no tiene foto.' });
    }
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type(res.rows[0].photo_mime ?? 'image/jpeg');
    return reply.send(res.rows[0].photo);
  });
}
