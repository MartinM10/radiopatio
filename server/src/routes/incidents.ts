import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db';
import { purgeExpiredIncidents } from '../db/purge';
import { authenticateWrite, resolveReadHash } from '../lib/device';
import { scheduleJudge } from '../lib/judge';
import { snapToHexGrid } from '../lib/geo';
import {
  haversineKm,
  DUP_WINDOW_MIN,
  findDuplicate,
  MAX_PER_HOUR,
  MIN_GAP_MS,
  type DedupRecord,
} from '../lib/quality';
import { sanitizeAddress } from '../lib/address';
import { checkText } from '../lib/privacy';
import { CategoryId, Incident } from '../types';

const categoryEnum = z.enum([
  'hogar',
  'vehiculo',
  'hurto',
  'agresion',
  'vandalismo',
  'sospechoso',
  'altercado',
  'corte_agua',
  'corte_luz',
  'alumbrado',
  'calzada',
  'limpieza',
  'perdido',
  'otro',
]);

const createIncidentSchema = z.object({
  category: categoryEnum,
  zone: z.object({
    gx: z.number().int().min(0).max(100).optional().default(5),
    gy: z.number().int().min(0).max(100).optional().default(5),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    // La calle es opcional y se publica: sin número de portal ni puerta.
    address: z
      .string()
      .max(250)
      .optional()
      .transform((v) => (v ? sanitizeAddress(v) || undefined : undefined)),
  }),
  description: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(280, 'La descripción no puede superar 280 caracteres'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  since: z.coerce.number().optional(),
  category: categoryEnum.optional(),
  gx: z.coerce.number().int().optional(),
  gy: z.coerce.number().int().optional(),
  timeframe: z.enum(['24h', '72h', 'week', 'month', 'all']).optional(),
});

// Centro por defecto (Málaga): misma referencia que usa el cliente en hexgrid.
const DEFAULT_CENTER_LAT = 36.7196;
const DEFAULT_CENTER_LNG = -4.4450;

interface IncidentRowLike {
  id: string;
  category: string;
  grid_x: number;
  grid_y: number;
  description: string;
  created_at: Date | string;
  confirmations_count: number;
  status: string;
  device_hash: string;
  lat: number | null;
  lng: number | null;
  address?: string | null;
  hex_lat: number | null;
  hex_lng: number | null;
}

/** Coordenada pública: SIEMPRE el centro de la celda hex (~450 m); jamás la exacta. */
const publicCoordinates = (row: {
  lat: number | null;
  lng: number | null;
  hex_lat: number | null;
  hex_lng: number | null;
}): { lat: number; lng: number } => {
  if (row.hex_lat !== null && row.hex_lng !== null) {
    return { lat: Number(row.hex_lat), lng: Number(row.hex_lng) };
  }
  const baseLat = row.lat ?? DEFAULT_CENTER_LAT;
  const baseLng = row.lng ?? DEFAULT_CENTER_LNG;
  const hex = snapToHexGrid(baseLat, baseLng);
  return { lat: hex.centerLat, lng: hex.centerLng };
};

const rowToIncident = (r: IncidentRowLike, deviceHash: string): Incident => {
  const createdMs = new Date(r.created_at).getTime();
  const coords = publicCoordinates(r);
  return {
    id: r.id,
    category: r.category as CategoryId,
    zone: {
      gx: r.grid_x,
      gy: r.grid_y,
      lat: coords.lat,
      lng: coords.lng,
      address: r.address || undefined,
    },
    description: r.description,
    createdAt: createdMs,
    confirmations: parseInt(String(r.confirmations_count), 10),
    mine: r.device_hash === deviceHash,
  };
};

export async function incidentRoutes(app: FastifyInstance) {
  // GET /api/incidents
  app.get('/api/incidents', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = listQuerySchema.safeParse(req.query);
    if (!parseRes.success) {
      return reply.status(400).send({
        error: 'INVALID_QUERY_PARAMS',
        details: parseRes.error.format(),
      });
    }

    const { limit, since, category, gx, gy, timeframe } = parseRes.data;
    const deviceHash = await resolveReadHash(req);

    // Minimización: lo caducado se purga físicamente al leer.
    await purgeExpiredIncidents();

    const intervalMap: Record<string, string> = {
      '24h': '24 hours',
      '72h': `${config.incidentTtlHours} hours`,
      'week': '7 days',
      'month': '30 days',
      'all': '365 days',
    };
    const interval = timeframe ? intervalMap[timeframe] || `${config.incidentTtlHours} hours` : `${config.incidentTtlHours} hours`;

    const conditions: string[] = [
      `i.status = 'active'`,
      `i.created_at >= NOW() - INTERVAL '${interval}'`,
    ];
    const params: unknown[] = [deviceHash];
    let paramIndex = 2;

    if (since) {
      conditions.push(`i.created_at > $${paramIndex}`);
      params.push(new Date(since));
      paramIndex++;
    }

    if (category) {
      conditions.push(`i.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (gx !== undefined && gy !== undefined) {
      conditions.push(`i.grid_x = $${paramIndex} AND i.grid_y = $${paramIndex + 1}`);
      params.push(gx, gy);
      paramIndex += 2;
    }

    const sql = `
      SELECT
        i.id,
        i.category,
        i.grid_x,
        i.grid_y,
        i.lat,
        i.lng,
        i.address,
        i.description,
        i.created_at,
        i.confirmations_count,
        i.device_hash,
        i.hex_lat,
        i.hex_lng,
        (ic.device_hash IS NOT NULL) AS confirmed_by_me,
        (fl.device_hash IS NOT NULL) AS flagged_by_me
      FROM incidents i
      LEFT JOIN incident_confirmations ic
        ON ic.incident_id = i.id AND ic.device_hash = $1
      LEFT JOIN incident_flags fl
        ON fl.incident_id = i.id AND fl.device_hash = $1
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const { rows } = await pool.query(sql, params);

    const incidents: Incident[] = rows.map((r) => {
      const inc = rowToIncident(r as IncidentRowLike, deviceHash);
      // Confirmaciones por dispositivo se rellenan para las etiquetas de la UI.
      inc.confirmedByMe = Boolean(r.confirmed_by_me);
      inc.flaggedByMe = Boolean(r.flagged_by_me);
      inc.status = r.status as Incident['status'];
      return inc;
    });

    return { data: incidents };
  });

  // POST /api/incidents
  app.post('/api/incidents', async (req: FastifyRequest, reply: FastifyReply) => {
    // Identidad emitida por el servidor: sin ella, los límites por
    // dispositivo se saltarían cambiando una cabecera.
    const auth = await authenticateWrite(req, reply);
    if (!auth) return reply;
    const deviceHash = auth.deviceHash;

    const parseRes = createIncidentSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        details: parseRes.error.format(),
      });
    }

    const { category, zone, description } = parseRes.data;

    // Validación de privacidad (RGPD / LOPD / DSA)
    // La calle pasa el mismo filtro que la descripción: no es un hueco para
    // colar teléfonos, correos, matrículas o nombres.
    const privacyProblem = checkText(description) ?? (zone.address ? checkText(zone.address) : null);
    if (privacyProblem) {
      return reply.status(400).send({
        error: 'PRIVACY_VIOLATION',
        message: privacyProblem,
      });
    }

    // Rate limiting por dispositivo (máx MAX_PER_HOUR avisos por hora)
    const rateCheck = await pool.query(
      `SELECT COUNT(*) as count FROM incidents
       WHERE device_hash = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
      [deviceHash]
    );
    const recentCount = parseInt(rateCheck.rows[0]?.count ?? '0', 10);
    if (recentCount >= MAX_PER_HOUR) {
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Has alcanzado el límite de ${MAX_PER_HOUR} avisos por hora. Por favor espera antes de publicar otro.`,
      });
    }

    // Hueco mínimo entre avisos del mismo dispositivo (anti-spam)
    const lastRes = await pool.query(
      `SELECT MAX(created_at) as last FROM incidents WHERE device_hash = $1`,
      [deviceHash]
    );
    const lastAt = lastRes.rows[0]?.last ? new Date(lastRes.rows[0].last).getTime() : null;
    if (lastAt !== null && Date.now() - lastAt < MIN_GAP_MS) {
      const waitMin = Math.max(1, Math.ceil((MIN_GAP_MS - (Date.now() - lastAt)) / 60_000));
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Estás publicando muy rápido. Espera ${waitMin} min antes de publicar otro aviso.`,
      });
    }

    // Presencia (fase 2): anti-teleport. Si el dispositivo publicó recientemente
    // desde una ubicación muy distante, la ubicación es incoherente.
    if (zone.lat !== undefined && zone.lng !== undefined) {
      const lastLoc = await pool.query(
        `SELECT lat, lng, created_at FROM incidents
         WHERE device_hash = $1 AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [deviceHash],
      );
      if (lastLoc.rows.length > 0) {
        const last = lastLoc.rows[0];
        const km = haversineKm(Number(last.lat), Number(last.lng), zone.lat, zone.lng);
        const minutesAgo = (Date.now() - new Date(last.created_at).getTime()) / 60_000;
        if (km > config.teleportKm && minutesAgo < config.teleportWindowMin) {
          return reply.status(422).send({
            error: 'IMPLAUSIBLE_LOCATION',
            message: `La ubicación es incoherente con tu actividad reciente (${Math.round(km)} km en ${Math.round(minutesAgo)} min).`,
          });
        }
      }
    }

    // Minimización: los caducados se purgan físicamente al publicar.
    await purgeExpiredIncidents();

    // Celda hex derivada EN el servidor desde las coordenadas (el cliente no decide).
    // Si solo llega gx/gy sin GPS, se estima el centro por defecto (Málaga).
    const baseLat = zone.lat ?? DEFAULT_CENTER_LAT + (zone.gy - 5) * 0.0025;
    const baseLng = zone.lng ?? DEFAULT_CENTER_LNG + (zone.gx - 5) * 0.0035;
    const hex = snapToHexGrid(baseLat, baseLng);
    const lat = baseLat;
    const lng = baseLng;

    // Deduplicación semántica: un aviso casi idéntico en la misma celda se
    // confirma, no se repite (docs/TRUST.md §3). Contra TODAS las cuentas.
    const candRes = await pool.query(
      `SELECT id, hex_key, category, description, created_at, lat, lng
       FROM incidents
       WHERE status = 'active'
         AND (created_at >= NOW() - INTERVAL '${DUP_WINDOW_MIN} minutes' OR hex_key = $1)
       ORDER BY created_at DESC
       LIMIT 500`,
      [hex.key]
    );
    const dedupRecords: DedupRecord[] = candRes.rows.map((r) => {
      const coords = publicCoordinates(r);
      return {
        id: r.id,
        cellKey: r.hex_key ?? snapToHexGrid(coords.lat, coords.lng).key,
        category: r.category as CategoryId,
        description: r.description,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
    const duplicate = findDuplicate(
      dedupRecords,
      { cellKey: hex.key, category, description },
      Date.now(),
    );
    if (duplicate) {
      return reply.status(409).send({
        error: 'DUPLICATE_INCIDENT',
        message: `Ya hay un aviso casi igual en esa zona, publicado hace ${duplicate.minutesAgo} min. Confírmalo en lugar de repetirlo.`,
      });
    }

    const id = `u${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date();

    // Cuarentena de ráfagas: si esta celda ya recibió muchos avisos en la
    // última hora, el nuevo entra en cuarentena ('pending') y no aparece
    // en listas ni en alertas hasta que un moderador lo apruebe o reciba
    // 2 confirmaciones vecinales (auto-promoción en confirmIncident).
    const recentInCell = await pool.query(
      `SELECT COUNT(*)::int AS n FROM incidents
       WHERE status IN ('active', 'pending') AND hex_key = $1
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [hex.key],
    );
    const quarantined = (recentInCell.rows[0]?.n ?? 0) >= config.quarantineThreshold;
    const initialStatus = quarantined ? 'pending' : 'active';

    if (quarantined) {
      await pool.query(
        `INSERT INTO moderation_log (incident_id, action, actor, reason)
         VALUES ($1, 'quarantine', 'sistema', $2)`,
        [id, `rafaga: ${recentInCell.rows[0].n} avisos en la celda en 1h`],
      );
    }

    await pool.query(
      `INSERT INTO incidents
        (id, category, grid_x, grid_y, description, created_at, confirmations_count, flags_count, status, device_hash, lat, lng, address, hex_key, hex_lat, hex_lng)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, category, zone.gx, zone.gy, description, now, initialStatus, deviceHash, lat, lng, zone.address ?? null, hex.key, hex.centerLat, hex.centerLng]
    );

    // El juez secundario (si está activo) puntúa de forma asíncrona,
    // sin bloquear la publicación ni rechazar nunca por sí solo.
    scheduleJudge(id, description, category);

    const created: Incident = {
      id,
      category,
      zone: {
        gx: zone.gx,
        gy: zone.gy,
        // Al creador le devolvemos también el centro de su celda: la respuesta
        // pública de la API jamás contiene coordenadas exactas.
        lat: hex.centerLat,
        lng: hex.centerLng,
        address: zone.address,
      },
      description,
      createdAt: now.getTime(),
      confirmations: 0,
      confirmedByMe: false,
      flaggedByMe: false,
      mine: true,
      status: initialStatus,
    };

    return reply.status(201).send({ data: created });
  });

  // POST /api/incidents/:id/confirm
  app.post<{ Params: { id: string } }>(
    '/api/incidents/:id/confirm',
    async (req, reply) => {
      const { id } = req.params;
      const auth = await authenticateWrite(req, reply);
      if (!auth) return reply;
      const deviceHash = auth.deviceHash;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const incRes = await client.query(
          `SELECT id, device_hash, status, confirmations_count FROM incidents WHERE id = $1 FOR UPDATE`,
          [id]
        );

        if (incRes.rowCount === 0 || incRes.rows[0].status !== 'active') {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado o inactivo' });
        }

        const incident = incRes.rows[0];

        // No puedes confirmar tu propio aviso
        if (incident.device_hash === deviceHash) {
          await client.query('ROLLBACK');
          return reply.status(400).send({
            error: 'CANNOT_CONFIRM_OWN',
            message: 'No puedes confirmar un aviso creado por ti mismo.',
          });
        }

        // Comprobar si ya fue confirmado por este dispositivo
        const confCheck = await client.query(
          `SELECT 1 FROM incident_confirmations WHERE incident_id = $1 AND device_hash = $2`,
          [id, deviceHash]
        );

        if (confCheck.rowCount && confCheck.rowCount > 0) {
          await client.query('ROLLBACK');
          return reply.status(409).send({
            error: 'ALREADY_CONFIRMED',
            message: 'Ya has confirmado este aviso anteriormente.',
          });
        }

        // Registrar confirmación
        await client.query(
          `INSERT INTO incident_confirmations (incident_id, device_hash, created_at)
           VALUES ($1, $2, NOW())`,
          [id, deviceHash]
        );

        const updateRes = await client.query(
          `UPDATE incidents
           SET confirmations_count = confirmations_count + 1
           WHERE id = $1
           RETURNING confirmations_count`,
          [id]
        );

        await client.query('COMMIT');

        const newCount = parseInt(updateRes.rows[0].confirmations_count, 10);
        const promoted = await client.query("UPDATE incidents SET status = 'active' WHERE id = $1 AND status = 'pending' AND confirmations_count >= 2 RETURNING id", [id]);
        if ((promoted.rowCount ?? 0) > 0) {
          await client.query("INSERT INTO moderation_log (incident_id, action, actor, reason) VALUES ($1, 'auto-promote', 'sistema', '2 confirmaciones vecinales')", [id]);
        }

        await client.query('COMMIT');

        return {
          success: true,
          id,
          confirmations: newCount,
          confirmedByMe: true,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // POST /api/incidents/:id/flag
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/incidents/:id/flag',
    async (req, reply) => {
      const { id } = req.params;
      const { reason } = req.body || {};
      const auth = await authenticateWrite(req, reply);
      if (!auth) return reply;
      const deviceHash = auth.deviceHash;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const incRes = await client.query(
          `SELECT id, status, flags_count FROM incidents WHERE id = $1 FOR UPDATE`,
          [id]
        );

        if (incRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Aviso no encontrado' });
        }

        // Comprobar si ya fue marcado por este dispositivo
        const flagCheck = await client.query(
          `SELECT 1 FROM incident_flags WHERE incident_id = $1 AND device_hash = $2`,
          [id, deviceHash]
        );

        if (flagCheck.rowCount && flagCheck.rowCount > 0) {
          await client.query('ROLLBACK');
          return { success: true, alreadyFlagged: true };
        }

        // Registrar denuncia
        await client.query(
          `INSERT INTO incident_flags (incident_id, device_hash, reason, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [id, deviceHash, reason || null]
        );

        // Si supera el umbral de moderación, pasa a 'hidden'
        const updateRes = await client.query(
          `UPDATE incidents
           SET flags_count = flags_count + 1,
               status = CASE WHEN flags_count + 1 >= $2 THEN 'hidden' ELSE status END
           WHERE id = $1
           RETURNING flags_count, status`,
          [id, config.maxFlagsBeforeHide]
        );

        // La ocultación automática se registra en la auditoría (DSA)
        const newStatus = updateRes.rows[0].status;
        const newFlags = parseInt(updateRes.rows[0].flags_count, 10);
        if (newStatus === 'hidden') {
          await client.query(
            `INSERT INTO moderation_log (incident_id, action, actor, reason)
             VALUES ($1, 'auto-hide', 'sistema', $2)`,
            [id, `${newFlags} denuncias vecinales`]
          );
        }

        await client.query('COMMIT');

        return {
          success: true,
          id,
          flaggedByMe: true,
          hidden: newStatus === 'hidden',
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
