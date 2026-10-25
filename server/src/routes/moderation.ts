import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { getDeviceHash } from '../lib/device';
import { pool } from '../db';
import { purgeExpiredIncidents } from '../db/purge';

/**
 * Moderación (docs/TRUST.md §3 capa 5): cola de avisos denunciados,
 * resolución con auditoría y canal de retirada (DSA).
 * Sin autoría visible: al moderador le llegan los avisos, nunca hashes de
 * dispositivo de los autores, para mantener el anonimato también dentro.
 */
const resolveSchema = z.object({
  action: z.enum(['keep-hidden', 'restore', 'delete']),
  reason: z.string().max(280).optional(),
});

export async function moderationRoutes(app: FastifyInstance) {
  const isAdmin = (req: FastifyRequest): boolean => {
    const token = req.headers['x-admin-token'];
    if (typeof token !== 'string') return false;
    const a = Buffer.from(token);
    const b = Buffer.from(config.adminToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  // GET /api/admin/moderation — cola de avisos denunciados (activos u ocultos)
  app.get('/api/admin/moderation', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Falta o es inválido el x-admin-token.' });
    }
    const { rows } = await pool.query(
      `SELECT i.id, i.category, i.description, i.grid_x, i.grid_y, i.address,
              i.lat, i.lng, i.hex_lat, i.hex_lng, i.created_at, i.confirmations_count,
              i.flags_count, i.status,
              COALESCE(
                (SELECT json_agg(json_build_object('reason', f.reason, 'created_at', f.created_at)
                                 ORDER BY f.created_at)
                 FROM incident_flags f WHERE f.incident_id = i.id),
                '[]'::json
              ) AS flags
       FROM incidents i
       WHERE i.flags_count > 0 AND i.status IN ('active', 'hidden')
ORDER BY i.judge_score DESC NULLS LAST, i.flags_count DESC, i.created_at DESC
       LIMIT 100`
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        zone: {
          gx: r.grid_x,
          gy: r.grid_y,
          lat: r.hex_lat,
          lng: r.hex_lng,
          address: r.address || undefined,
        },
        createdAt: new Date(r.created_at).getTime(),
        confirmations: parseInt(r.confirmations_count, 10),
        flagsCount: parseInt(r.flags_count, 10),
        status: r.status,
        flags: r.flags,
        judgeScore: r.judge_score,
        judgeReason: r.judge_reason,
        judgeAt: r.judge_at ? new Date(r.judge_at).getTime() : null,
      })),
    };
  });

  // POST /api/admin/incidents/:id/resolve — decisión con auditoría
  app.post<{ Params: { id: string } }>(
    '/api/admin/incidents/:id/resolve',
    async (req, reply) => {
      if (!isAdmin(req)) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Falta o es inválido el x-admin-token.' });
      }
      const parseRes = resolveSchema.safeParse(req.body ?? {});
      if (!parseRes.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseRes.error.format() });
      }
      const { action, reason } = parseRes.data;
      const { id } = req.params;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(`SELECT id, status FROM incidents WHERE id = $1 FOR UPDATE`, [id]);
        if (res.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado' });
        }
        let status: string;
        if (action === 'delete') {
          await client.query(`DELETE FROM incidents WHERE id = $1`, [id]);
          status = 'deleted';
        } else {
          status = action === 'restore' ? 'active' : 'hidden';
          await client.query(`UPDATE incidents SET status = $2 WHERE id = $1`, [id, status]);
        }
        await client.query(
          `INSERT INTO moderation_log (incident_id, action, actor, reason)
           VALUES ($1, $2, $3, $4)`,
          [id, action, 'admin', reason ?? null]
        );
        await client.query('COMMIT');
        return { success: true, id, status };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // GET /api/admin/audit — últimas decisiones de moderación
  app.get('/api/transparency', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'hidden')::int AS hidden,
         COUNT(*) FILTER (WHERE status = 'deleted')::int AS deleted,
         COUNT(*)::int AS total,
         COALESCE(SUM(confirmations_count), 0)::int AS confirmations,
         COALESCE(SUM(flags_count), 0)::int AS flags,
         (SELECT COUNT(*)::int FROM incident_confirmations) AS confirmations_distinct,
         (SELECT COUNT(*)::int FROM incident_flags) AS flags_distinct
       FROM incidents`,
    );
    const r = rows[0];
    return {
      data: {
        incidents: {
          active: r.active,
          pending: r.pending,
          hidden: r.hidden,
          deleted: r.deleted,
          total: r.total,
        },
        confirmations: r.confirmations,
        flags: r.flags,
        moderation: {
          distinctConfirmations: r.confirmations_distinct,
          distinctFlags: r.flags_distinct,
        },
        policy: {
          ttlHours: config.incidentTtlHours,
          maxFlagsBeforeHide: config.maxFlagsBeforeHide,
          quarantineThreshold: config.quarantineThreshold,
        },
      },
    };
  });

  // POST /api/incidents/:id/appeal - recurso del autor (DSA)
  app.post<{ Params: { id: string } }>(
    '/api/incidents/:id/appeal',
    async (req, reply) => {
      const { id } = req.params;
      const deviceHash = getDeviceHash(req);
      const { rows } = await pool.query(
        `SELECT id, status, device_hash FROM incidents WHERE id = $1`,
        [id],
      );
      if (rows.length === 0) {
        return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado' });
      }
      const inc = rows[0];
      if (inc.device_hash !== deviceHash) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Solo el autor puede recurrir.' });
      }
      if (inc.status !== 'hidden') {
        return reply.status(400).send({ error: 'NOT_APPEALABLE', message: 'Solo los avisos ocultados admiten recurso.' });
      }
      await pool.query(`UPDATE incidents SET status = 'pending' WHERE id = $1`, [id]);
      await pool.query(
        `INSERT INTO moderation_log (incident_id, action, actor, reason)
         VALUES ($1, 'appeal', 'autor', 'recurso del autor')`,
        [id],
      );
      return { success: true, id, status: 'pending' };
    },
  );

  // GET /api/admin/audit - últimas decisiones de moderación
  app.get('/api/admin/audit', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Falta o es inválido el x-admin-token.' });
    }
    await purgeExpiredIncidents();
    const { rows } = await pool.query(
      `SELECT id, incident_id, action, actor, reason, at FROM moderation_log ORDER BY at DESC LIMIT 100`
    );
    return { data: rows };
  });
}
