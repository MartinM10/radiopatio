import { config } from '../config';
import { pool } from '../db';
import { categories } from '../routes/categories';
import { haversineKm } from './quality';

/**
 * Notificaciones de Radio Patio.
 *
 * Tres motivos para avisar a un vecino:
 *  - `confirmation`: alguien ha confirmado un aviso SUYO.
 *  - `nearby`: han publicado un aviso en la celda donde está (su «área»).
 *  - `watched`: han publicado un aviso en una zona que vigila aunque no esté allí.
 *
 * Cada notificación se guarda SIEMPRE en la bandeja (tabla `notifications`, que
 * la app consulta) y, además, se envía por push si el dispositivo registró un
 * token de Expo. Así la bandeja funciona sin push (web, permiso denegado, sin
 * Firebase configurado) y el push es solo el empujón.
 *
 * Privacidad: nunca se notifica quién confirmó. De la posición del vecino solo
 * se guarda el centro de su celda (~450 m), y el autor de un aviso jamás recibe
 * avisos de «cerca de ti» sobre su propio aviso.
 */

export type NotificationKind = 'confirmation' | 'nearby' | 'watched';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** Resultado por mensaje: token que Expo ya no reconoce → hay que olvidarlo. */
export type PushSender = (messages: PushMessage[]) => Promise<{ invalidTokens: string[] }>;

const expoSender: PushSender = async (messages) => {
  const invalidTokens: string[] = [];
  // Expo admite hasta 100 mensajes por petición.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(config.expoPushUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', channelId: 'alerts', priority: 'high' }))),
    });
    if (!res.ok) throw new Error(`Expo push respondió ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    (body.data ?? []).forEach((ticket, idx) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(chunk[idx].to);
      }
    });
  }
  return { invalidTokens };
};

let sender: PushSender = expoSender;

/** Para tests: sustituye el envío real por uno propio (null restaura el de Expo). */
export function setPushSender(fn: PushSender | null): void {
  sender = fn ?? expoSender;
}

interface Pending {
  deviceId: string;
  pushToken: string | null;
  kind: NotificationKind;
  incidentId: string;
  title: string;
  body: string;
}

const categoryOf = (id: string) => categories.find((c) => c.id === id);

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Guarda en la bandeja y empuja. Nunca lanza: una notificación fallida no puede romper la acción que la origina. */
async function deliver(list: Pending[]): Promise<void> {
  if (list.length === 0) return;
  try {
    for (const n of list) {
      await pool.query(
        `INSERT INTO notifications (device_id, kind, incident_id, title, body) VALUES ($1, $2, $3, $4, $5)`,
        [n.deviceId, n.kind, n.incidentId, n.title, n.body],
      );
    }
    if (!config.pushEnabled) return;
    const messages: PushMessage[] = list
      .filter((n): n is Pending & { pushToken: string } => Boolean(n.pushToken))
      .map((n) => ({ to: n.pushToken, title: n.title, body: n.body, data: { kind: n.kind, incidentId: n.incidentId } }));
    if (messages.length === 0) return;
    const { invalidTokens } = await sender(messages);
    if (invalidTokens.length > 0) {
      await pool.query(`UPDATE devices SET push_token = NULL WHERE push_token = ANY($1)`, [invalidTokens]);
    }
  } catch (err) {
    console.error('[notificaciones] envío fallido:', err);
  }
}

/** Alguien ha confirmado un aviso: se lo decimos al autor. */
export async function notifyConfirmation(
  incidentId: string,
  authorHash: string,
  category: string,
  confirmations: number,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, push_token FROM devices WHERE device_hash = $1 AND notify_confirmations`,
      [authorHash],
    );
    if (rows.length === 0) return;
    const cat = categoryOf(category);
    const name = cat ? `${cat.emoji} ${cat.label}` : 'tu aviso';
    const verified = confirmations >= 2;
    const device = rows[0] as { id: string; push_token: string | null };

    // Si el autor aún no leyó la anterior, la bandeja la actualiza en vez de apilar una por vecino.
    const unread = await pool.query(
      `SELECT id FROM notifications
       WHERE device_id = $1 AND kind = 'confirmation' AND incident_id = $2 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [device.id, incidentId],
    );
    const title = verified ? 'Tu aviso ya está verificado' : 'Un vecino ha confirmado tu aviso';
    const body = `${name}: ${confirmations} ${confirmations === 1 ? 'vecino lo ha confirmado' : 'vecinos lo han confirmado'}.`;
    if ((unread.rowCount ?? 0) > 0) {
      await pool.query(`UPDATE notifications SET title = $2, body = $3, created_at = NOW() WHERE id = $1`, [
        unread.rows[0].id,
        title,
        body,
      ]);
      if (config.pushEnabled && device.push_token) {
        const { invalidTokens } = await sender([
          { to: device.push_token, title, body, data: { kind: 'confirmation', incidentId } },
        ]);
        if (invalidTokens.length > 0) await pool.query(`UPDATE devices SET push_token = NULL WHERE id = $1`, [device.id]);
      }
      return;
    }
    await deliver([
      { deviceId: device.id, pushToken: device.push_token, kind: 'confirmation', incidentId, title, body },
    ]);
  } catch (err) {
    console.error('[notificaciones] confirmación fallida:', err);
  }
}

export interface NewIncidentInfo {
  id: string;
  category: string;
  description: string;
  address?: string | null;
  authorHash: string;
  /** Centro de la celda hex del aviso (nunca la coordenada exacta). */
  hexLat: number;
  hexLng: number;
}

/** Cajita en grados para prefiltrar en SQL antes de medir la distancia real. */
function boundingBox(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Un aviso nuevo y visible: avisa a quien está cerca y a quien vigila la zona. */
export async function notifyNewIncident(inc: NewIncidentInfo): Promise<void> {
  try {
    const km = config.notifyRadiusM / 1000;
    const box = boundingBox(inc.hexLat, inc.hexLng, km);
    const cat = categoryOf(inc.category);
    const name = cat ? `${cat.emoji} ${cat.label}` : 'Nuevo aviso';
    const where = inc.address ? inc.address : clip(inc.description, 90);
    const within = (lat: number, lng: number) => haversineKm(inc.hexLat, inc.hexLng, lat, lng) * 1000 <= config.notifyRadiusM;

    const nearby = await pool.query(
      `SELECT id, push_token, area_lat, area_lng FROM devices
       WHERE notify_nearby AND device_hash <> $1
         AND area_lat BETWEEN $2 AND $3 AND area_lng BETWEEN $4 AND $5`,
      [inc.authorHash, box.minLat, box.maxLat, box.minLng, box.maxLng],
    );
    const watched = await pool.query(
      `SELECT d.id, d.push_token, w.label, w.lat, w.lng
       FROM watched_zones w JOIN devices d ON d.id = w.device_id
       WHERE d.notify_watched AND d.device_hash <> $1
         AND w.lat BETWEEN $2 AND $3 AND w.lng BETWEEN $4 AND $5
       ORDER BY w.id`,
      [inc.authorHash, box.minLat, box.maxLat, box.minLng, box.maxLng],
    );

    // Un vecino recibe UNA notificación por aviso: «cerca de ti» manda sobre la zona vigilada.
    const byDevice = new Map<string, Pending>();
    for (const r of watched.rows) {
      if (!within(Number(r.lat), Number(r.lng)) || byDevice.has(r.id)) continue;
      byDevice.set(r.id, {
        deviceId: r.id,
        pushToken: r.push_token,
        kind: 'watched',
        incidentId: inc.id,
        title: `${name} en «${r.label}»`,
        body: where,
      });
    }
    for (const r of nearby.rows) {
      if (!within(Number(r.area_lat), Number(r.area_lng))) continue;
      byDevice.set(r.id, {
        deviceId: r.id,
        pushToken: r.push_token,
        kind: 'nearby',
        incidentId: inc.id,
        title: `${name} cerca de ti`,
        body: where,
      });
    }
    if (byDevice.size === 0) return;

    // Sin repetir (p. ej. aviso en cuarentena que se promociona) y con tope por hora.
    const ids = [...byDevice.keys()];
    const already = await pool.query(
      `SELECT DISTINCT device_id FROM notifications WHERE incident_id = $1 AND device_id = ANY($2) AND kind IN ('nearby','watched')`,
      [inc.id, ids],
    );
    for (const r of already.rows) byDevice.delete(r.device_id);
    const busy = await pool.query(
      `SELECT device_id FROM notifications
       WHERE device_id = ANY($1) AND kind IN ('nearby','watched') AND created_at >= NOW() - INTERVAL '1 hour'
       GROUP BY device_id HAVING COUNT(*) >= $2`,
      [ids, config.notifyMaxPerHour],
    );
    for (const r of busy.rows) byDevice.delete(r.device_id);

    await deliver([...byDevice.values()]);
  } catch (err) {
    console.error('[notificaciones] aviso nuevo fallido:', err);
  }
}
