import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db';
import { authenticateWrite } from '../lib/device';
import {
  MAX_LIFETIME_FACTOR,
  RESOLVED_GRACE_HOURS,
  categoryTtlHours,
  extendedExpiry,
  inExtensionWindow,
  liveSql,
} from '../lib/lifetime';

/**
 * Cuánto dura un aviso y cómo se cierra o se amplía (lib/lifetime.ts):
 *  - POST /api/incidents/:id/resolve      el autor lo da por resuelto.
 *  - POST /api/incidents/:id/still-there  «¿sigue ahí?»: un vecino lo amplía o pide cerrarlo.
 *  - GET  /api/config                     valores que la app necesita conocer.
 */
const stillThereSchema = z.object({ here: z.boolean() });

interface LiveRow {
  id: string;
  device_hash: string;
  category: string;
  created_at: Date;
  expires_at: Date | null;
  resolved_at: Date | null;
}

const SELECT_LIVE = (extra = '') =>
  `SELECT id, device_hash, category, created_at, expires_at, resolved_at FROM incidents WHERE id = $1 AND ${liveSql()} ${extra}`;

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });

export async function lifetimeRoutes(app: FastifyInstance) {
  // GET /api/config — pública: nada de aquí es secreto ni identifica a nadie.
  app.get('/api/config', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      data: {
        /** Confirmaciones de vecinos distintos para considerar un aviso verificado. */
        verifiedAt: config.verifiedAt,
        /** Duración por defecto y plazo de conservación de las coordenadas exactas. */
        defaultTtlHours: config.incidentTtlHours,
        resolvedGraceHours: RESOLVED_GRACE_HOURS,
        maxLifetimeFactor: MAX_LIFETIME_FACTOR,
      },
    };
  });

  // POST /api/incidents/:id/resolve — solo el autor
  app.post<{ Params: { id: string } }>('/api/incidents/:id/resolve', async (req, reply) => {
    const auth = await authenticateWrite(req, reply);
    if (!auth) return reply;
    const { rows } = await pool.query<LiveRow>(SELECT_LIVE(), [req.params.id]);
    if (rows.length === 0) return notFound(reply);
    if (rows[0].device_hash !== auth.deviceHash) {
      return reply.status(403).send({ error: 'NOT_AUTHOR', message: 'Solo quien publicó el aviso puede darlo por resuelto.' });
    }
    const res = await pool.query<{ expires_at: Date }>(
      `UPDATE incidents
       SET resolved_at = COALESCE(resolved_at, NOW()),
           expires_at = LEAST(COALESCE(expires_at, 'infinity'::timestamptz), NOW() + make_interval(hours => $2))
       WHERE id = $1 RETURNING expires_at`,
      [req.params.id, RESOLVED_GRACE_HOURS],
    );
    return { data: { resolved: true, expiresAt: new Date(res.rows[0].expires_at).getTime() } };
  });

  // POST /api/incidents/:id/still-there {here}
  app.post<{ Params: { id: string }; Body: { here?: boolean } }>(
    '/api/incidents/:id/still-there',
    async (req: FastifyRequest<{ Params: { id: string }; Body: { here?: boolean } }>, reply: FastifyReply) => {
      const auth = await authenticateWrite(req, reply);
      if (!auth) return reply;
      const parsed = stillThereSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      }
      const { here } = parsed.data;
      const { id } = req.params;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query<LiveRow>(SELECT_LIVE('FOR UPDATE'), [id]);
        if (found.rows.length === 0) {
          await client.query('ROLLBACK');
          return notFound(reply);
        }
        const inc = found.rows[0];
        if (inc.device_hash === auth.deviceHash) {
          await client.query('ROLLBACK');
          return reply.status(403).send({
            error: 'AUTHOR_CANNOT_VOTE',
            message: 'Eres el autor de este aviso: si ya no está, pulsa «Ya está resuelto».',
          });
        }
        const createdAt = new Date(inc.created_at);
        const expiresAt = inc.expires_at ? new Date(inc.expires_at) : new Date(createdAt.getTime() + config.incidentTtlHours * 3_600_000);

        let resolved = inc.resolved_at !== null;
        let nextExpiry = expiresAt;
        let extended = false;

        if (!resolved) {
          const prior = await client.query<{ here: boolean }>(
            `SELECT here FROM incident_presence_votes WHERE incident_id = $1 AND device_hash = $2`,
            [id, auth.deviceHash],
          );
          await client.query(
            `INSERT INTO incident_presence_votes (incident_id, device_hash, here) VALUES ($1, $2, $3)
             ON CONFLICT (incident_id, device_hash) DO UPDATE SET here = EXCLUDED.here, created_at = NOW()`,
            [id, auth.deviceHash, here],
          );

          const ttl = categoryTtlHours(inc.category);
          // Solo el primer voto de cada cuenta amplía, y solo en la segunda mitad de la vida del aviso.
          if (here && prior.rows.length === 0 && inExtensionWindow(ttl, expiresAt.getTime() - Date.now())) {
            const candidate = extendedExpiry(createdAt, expiresAt, ttl);
            if (candidate.getTime() > expiresAt.getTime()) {
              nextExpiry = candidate;
              extended = true;
              await client.query(`UPDATE incidents SET expires_at = $2 WHERE id = $1`, [id, candidate]);
            }
          }

          // Se cierra cuando bastantes vecinos distintos dicen que ya no está y son más que los que dicen que sigue.
          const tally = await client.query<{ gone: string; here: string }>(
            `SELECT COUNT(*) FILTER (WHERE NOT here) AS gone, COUNT(*) FILTER (WHERE here) AS here
             FROM incident_presence_votes WHERE incident_id = $1`,
            [id],
          );
          const gone = parseInt(tally.rows[0].gone, 10);
          const stay = parseInt(tally.rows[0].here, 10);
          if (gone >= config.verifiedAt && gone > stay) {
            const closed = await client.query<{ expires_at: Date }>(
              `UPDATE incidents
               SET resolved_at = NOW(), expires_at = LEAST(COALESCE(expires_at, 'infinity'::timestamptz), NOW() + make_interval(hours => $2))
               WHERE id = $1 RETURNING expires_at`,
              [id, RESOLVED_GRACE_HOURS],
            );
            resolved = true;
            nextExpiry = new Date(closed.rows[0].expires_at);
            extended = false;
          }
        }

        await client.query('COMMIT');
        return { data: { extended, resolved, expiresAt: nextExpiry.getTime() } };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
