import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db';
import { authenticateDevice } from '../lib/device';
import { snapToHexGrid } from '../lib/geo';
import { checkText } from '../lib/privacy';

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

const settingsSchema = z.object({
  confirmations: z.boolean().optional(),
  nearby: z.boolean().optional(),
  watched: z.boolean().optional(),
  messages: z.boolean().optional(),
  // Dónde está el vecino ahora; null la borra. El servidor guarda SOLO el centro de la celda.
  area: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
});

const pushSchema = z.object({
  token: z.string().regex(EXPO_TOKEN, 'Token de Expo Push no válido').nullable(),
});

const readSchema = z.object({
  ids: z.array(z.number().int()).max(200).optional(),
});

const zoneSchema = z.object({
  label: z.string().trim().min(1, 'Ponle un nombre a la zona').max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const invalid = (reply: FastifyReply, error: z.ZodError) =>
  reply.status(400).send({ error: 'VALIDATION_ERROR', details: error.format() });

const settingsFor = async (deviceId: string) => {
  const { rows } = await pool.query(
    `SELECT notify_confirmations, notify_nearby, notify_watched, notify_messages, push_token, area_lat, area_lng FROM devices WHERE id = $1`,
    [deviceId],
  );
  const d = rows[0];
  return {
    confirmations: Boolean(d.notify_confirmations),
    nearby: Boolean(d.notify_nearby),
    watched: Boolean(d.notify_watched),
    messages: Boolean(d.notify_messages),
    pushRegistered: d.push_token !== null,
    // Centro de la celda guardada (nunca la posición exacta); null si no hay.
    area: d.area_lat === null ? null : { lat: Number(d.area_lat), lng: Number(d.area_lng) },
    radiusM: config.notifyRadiusM,
    maxZones: config.maxWatchedZones,
  };
};

const zonesFor = async (deviceId: string) => {
  const { rows } = await pool.query(
    `SELECT id, label, lat, lng FROM watched_zones WHERE device_id = $1 ORDER BY id`,
    [deviceId],
  );
  return rows.map((r) => ({ id: Number(r.id), label: r.label as string, lat: Number(r.lat), lng: Number(r.lng) }));
};

/** Bandeja, ajustes y zonas vigiladas del vecino. Cuenta de dispositivo; no exige identidad verificada. */
export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — la bandeja (lo más reciente primero) y cuántas quedan sin leer.
  app.get('/api/notifications', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    const { rows } = await pool.query(
      `SELECT id, kind, incident_id, title, body, created_at, (read_at IS NOT NULL) AS read
       FROM notifications WHERE device_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
      [device.id],
    );
    const unread = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE device_id = $1 AND read_at IS NULL`,
      [device.id],
    );
    return {
      data: {
        unread: unread.rows[0].n as number,
        items: rows.map((r) => ({
          id: Number(r.id),
          kind: r.kind as string,
          incidentId: (r.incident_id as string | null) ?? null,
          title: r.title as string,
          body: r.body as string,
          createdAt: new Date(r.created_at).getTime(),
          read: Boolean(r.read),
        })),
      },
    };
  });

  // POST /api/notifications/read — marca como leídas (todas, o solo `ids`).
  app.post('/api/notifications/read', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    const parsed = readSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    const { ids } = parsed.data;
    if (ids && ids.length > 0) {
      await pool.query(
        `UPDATE notifications SET read_at = NOW() WHERE device_id = $1 AND id = ANY($2) AND read_at IS NULL`,
        [device.id, ids],
      );
    } else {
      await pool.query(`UPDATE notifications SET read_at = NOW() WHERE device_id = $1 AND read_at IS NULL`, [device.id]);
    }
    return { data: { ok: true } };
  });

  // GET /api/notifications/settings
  app.get('/api/notifications/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    return { data: { ...(await settingsFor(device.id)), zones: await zonesFor(device.id) } };
  });

  // PUT /api/notifications/settings
  app.put('/api/notifications/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const { confirmations, nearby, watched, messages, area } = parsed.data;

    const sets: string[] = [];
    const params: unknown[] = [device.id];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (confirmations !== undefined) add('notify_confirmations', confirmations);
    if (nearby !== undefined) add('notify_nearby', nearby);
    if (watched !== undefined) add('notify_watched', watched);
    if (messages !== undefined) add('notify_messages', messages);
    if (area === null) {
      sets.push('area_lat = NULL', 'area_lng = NULL', 'area_at = NULL');
    } else if (area) {
      // Minimización: del GPS del vecino solo se conserva el centro de su celda.
      const hex = snapToHexGrid(area.lat, area.lng);
      add('area_lat', hex.centerLat);
      add('area_lng', hex.centerLng);
      sets.push('area_at = NOW()');
    }
    if (sets.length > 0) await pool.query(`UPDATE devices SET ${sets.join(', ')} WHERE id = $1`, params);
    return { data: { ...(await settingsFor(device.id)), zones: await zonesFor(device.id) } };
  });

  // PUT /api/notifications/push — registra (o borra, con null) el token de Expo Push.
  app.put('/api/notifications/push', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    const parsed = pushSchema.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const { token } = parsed.data;
    if (token) {
      // Un móvil, un vecino: si el token estaba en otra cuenta (cambio de sesión), se le quita.
      await pool.query(`UPDATE devices SET push_token = NULL WHERE push_token = $1 AND id <> $2`, [token, device.id]);
    }
    await pool.query(`UPDATE devices SET push_token = $2 WHERE id = $1`, [device.id, token]);
    return { data: { pushRegistered: token !== null } };
  });

  // GET /api/notifications/zones
  app.get('/api/notifications/zones', async (req: FastifyRequest, reply: FastifyReply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    return { data: await zonesFor(device.id) };
  });

  // POST /api/notifications/zones — empieza a vigilar un sitio.
  app.post(
    '/api/notifications/zones',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const device = await authenticateDevice(req, reply);
      if (!device) return reply;
      const parsed = zoneSchema.safeParse(req.body);
      if (!parsed.success) return invalid(reply, parsed.error);
      const { label, lat, lng } = parsed.data;

      // El nombre es texto libre que viaja en notificaciones: mismo filtro que los avisos.
      const problem = checkText(label);
      if (problem) return reply.status(400).send({ error: 'PRIVACY_VIOLATION', message: problem });

      const count = await pool.query(`SELECT COUNT(*)::int AS n FROM watched_zones WHERE device_id = $1`, [device.id]);
      if ((count.rows[0].n as number) >= config.maxWatchedZones) {
        return reply.status(409).send({
          error: 'WATCHED_ZONES_LIMIT',
          message: `Puedes vigilar hasta ${config.maxWatchedZones} zonas. Quita alguna para añadir otra.`,
        });
      }
      // Se guarda el centro de la celda (~450 m): el servidor no necesita el punto exacto.
      const hex = snapToHexGrid(lat, lng);
      const dup = await pool.query(`SELECT 1 FROM watched_zones WHERE device_id = $1 AND hex_key = $2`, [device.id, hex.key]);
      if ((dup.rowCount ?? 0) > 0) {
        return reply.status(409).send({ error: 'ZONE_ALREADY_WATCHED', message: 'Ya estás vigilando esa zona.' });
      }
      await pool.query(
        `INSERT INTO watched_zones (device_id, label, hex_key, lat, lng) VALUES ($1, $2, $3, $4, $5)`,
        [device.id, label, hex.key, hex.centerLat, hex.centerLng],
      );
      return reply.status(201).send({ data: await zonesFor(device.id) });
    },
  );

  // DELETE /api/notifications/zones/:id
  app.delete<{ Params: { id: string } }>('/api/notifications/zones/:id', async (req, reply) => {
    const device = await authenticateDevice(req, reply);
    if (!device) return reply;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Zona no válida.' });
    await pool.query(`DELETE FROM watched_zones WHERE id = $1 AND device_id = $2`, [id, device.id]);
    return { data: await zonesFor(device.id) };
  });
}
