import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db';
import { authenticateWrite, resolveReadHash } from '../lib/device';
import { notifyMessage } from '../lib/notify';
import { liveSql } from '../lib/lifetime';
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

/**
 * Cómo se ve cada mensaje: si es del propio lector, si lo escribió el autor del
 * aviso y, para los demás, un número por orden de primera intervención («Vecino 1»,
 * «Vecino 2»…) que solo vale dentro de este aviso. Nunca sale el device_hash.
 */
function describeMessages(rows: MessageRow[], authorHash: string, myHash: string) {
  const numbers = new Map<string, number>();
  return rows.map((r) => {
    const fromAuthor = r.device_hash === authorHash;
    let participant: number | null = null;
    if (!fromAuthor) {
      if (!numbers.has(r.device_hash)) numbers.set(r.device_hash, numbers.size + 1);
      participant = numbers.get(r.device_hash) ?? null;
    }
    return {
      id: r.id,
      body: r.body,
      createdAt: new Date(r.created_at).getTime(),
      mine: r.device_hash === myHash,
      fromAuthor,
      participant,
    };
  });
}

const loadMessages = (incidentId: string) =>
  pool.query<MessageRow>(
    `SELECT id, body, created_at, device_hash FROM incident_messages WHERE incident_id = $1 ORDER BY created_at ASC, id ASC LIMIT 200`,
    [incidentId],
  );

export async function messageRoutes(app: FastifyInstance) {
  // GET /api/incidents/:id/messages — lectura pública, como el resto del aviso.
  app.get<{ Params: { id: string } }>('/api/incidents/:id/messages', async (req, reply) => {
    const { id } = req.params;
    const incRes = await pool.query(`SELECT device_hash FROM incidents WHERE id = $1 AND ${liveSql()}`, [id]);
    if (incRes.rowCount === 0) {
      return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });
    }
    const myHash = await resolveReadHash(req);
    const rows = await loadMessages(id);
    return { data: describeMessages(rows.rows, incRes.rows[0].device_hash as string, myHash) };
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
      const incRes = await pool.query(`SELECT device_hash, category FROM incidents WHERE id = $1 AND ${liveSql()}`, [id]);
      if (incRes.rowCount === 0) {
        return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });
      }
      const incident = incRes.rows[0] as { device_hash: string; category: string };

      const inserted = await pool.query<{ id: number; created_at: Date }>(
        `INSERT INTO incident_messages (incident_id, device_hash, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [id, auth.deviceHash, parsed.data.body],
      );

      void notifyMessage(id, incident.category, incident.device_hash, auth.deviceHash, parsed.data.body);

      const all = describeMessages((await loadMessages(id)).rows, incident.device_hash, auth.deviceHash);
      const created = all.find((m) => m.id === inserted.rows[0].id);
      return reply.status(201).send({ data: created });
    },
  );

  // GET /api/incidents/:id/photo — pública, igual que el resto del aviso.
  app.get<{ Params: { id: string } }>('/api/incidents/:id/photo', async (req, reply) => {
    const { id } = req.params;
    const res = await pool.query<{ photo: Buffer | null; photo_mime: string | null }>(
      `SELECT photo, photo_mime FROM incidents WHERE id = $1 AND ${liveSql()}`,
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
