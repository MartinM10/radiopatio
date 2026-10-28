import { createHash, createHmac, randomBytes } from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { pool } from '../db';

/**
 * Identidad pseudónima de dispositivo.
 *
 * - El servidor EMITE el token (POST /api/devices/register o login verificado).
 *   Solo se guarda su hash; el cliente lo envía como X-Device-Token.
 * - ESCRITURAS (publicar, confirmar, denunciar, recurrir): token válido
 *   obligatorio. Ya no existe identidad elegida por el cliente (X-Device-Id)
 *   ni derivada de la IP: eso permitía fabricar identidades con solo cambiar
 *   una cabecera y saltarse todos los límites por dispositivo.
 * - La identidad que se guarda en los avisos (`device_hash`) deriva del
 *   id interno del dispositivo, no del token: rotar el token (nuevo login)
 *   no crea una identidad nueva, así que no se puede confirmar dos veces.
 * - Identidad VERIFICADA (Google/SMS): `identity_hash` = HMAC con secreto del
 *   id verificado. Es único en BD: una cuenta, un dispositivo. Sigue siendo
 *   dato personal pseudonimizado (RGPD, considerando 26).
 */

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const hashToken = (token: string): string => sha256(`${token}:${config.deviceSalt}`);

/** Hash estable de un dispositivo registrado (es lo que se guarda en los avisos). */
export const deviceHashFor = (deviceId: string): string => sha256(`dev:${deviceId}:${config.deviceSalt}`);

/** HMAC con secreto de un identificador verificado (p. ej. `google:<sub>`). */
export const identityHashFor = (kind: string, subject: string): string =>
  createHmac('sha256', config.deviceSalt).update(`${kind}:${subject}`).digest('hex');

const readToken = (req: FastifyRequest): string | null => {
  const v = req.headers['x-device-token'];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
};

export interface DeviceRecord {
  id: string;
  verified: boolean;
}

export async function lookupDevice(token: string): Promise<DeviceRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, (identity_hash IS NOT NULL) AS verified FROM devices WHERE token_hash = $1`,
    [hashToken(token)],
  );
  return rows.length > 0 ? { id: rows[0].id as string, verified: Boolean(rows[0].verified) } : null;
}

export interface AuthedDevice {
  deviceId: string;
  deviceHash: string;
  verified: boolean;
}

/**
 * Autentica una escritura. Devuelve el dispositivo, o responde 401/403 y
 * devuelve null (el handler debe hacer `return reply`).
 */
export async function authenticateWrite(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthedDevice | null> {
  const token = readToken(req);
  if (!token) {
    reply.status(401).send({
      error: 'DEVICE_TOKEN_REQUIRED',
      message: 'Necesitas una cuenta de dispositivo para esta acción. Reinicia la app e inténtalo de nuevo.',
    });
    return null;
  }
  const device = await lookupDevice(token);
  if (!device) {
    reply.status(401).send({
      error: 'INVALID_DEVICE_TOKEN',
      message: 'Tu sesión ya no es válida. Reinicia la app para volver a iniciarla.',
    });
    return null;
  }
  if (config.requireVerifiedIdentity && !device.verified) {
    reply.status(403).send({
      error: 'IDENTITY_REQUIRED',
      message: 'Para publicar o valorar avisos debes verificar tu identidad (inicia sesión con Google).',
    });
    return null;
  }
  return { deviceId: device.id, deviceHash: deviceHashFor(device.id), verified: device.verified };
}

/**
 * Identidad para LECTURAS (no concede ningún poder): con token válido, el hash
 * del dispositivo (para `mine`, `confirmedByMe`…); sin él, un hash anónimo con
 * otro prefijo que jamás coincide con el de un dispositivo real, así que una
 * cabecera falsa no permite hacerse pasar por nadie.
 */
export async function resolveReadHash(req: FastifyRequest): Promise<string> {
  const token = readToken(req);
  if (token) {
    const device = await lookupDevice(token);
    if (device) return deviceHashFor(device.id);
  }
  return sha256(`anon:${req.ip}:${config.deviceSalt}`);
}

export interface IssuedDevice {
  deviceId: string;
  token: string;
}

/** Alta de dispositivo anónimo (no verificado). */
export async function registerDevice(): Promise<IssuedDevice> {
  const deviceId = randomBytes(16).toString('hex');
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO devices (id, token_hash, created_at) VALUES ($1, $2, NOW())`,
    [deviceId, hashToken(token)],
  );
  return { deviceId, token };
}

/**
 * Emite el token de una identidad verificada. Atómico: si la identidad ya
 * tiene dispositivo, se ROTA su token (el anterior deja de valer) y se
 * conserva el mismo `deviceId`; nunca se crea un segundo dispositivo para la
 * misma cuenta. Así una cuenta de Google no sirve para fabricar identidades.
 */
export async function issueDeviceForIdentity(identityHash: string): Promise<IssuedDevice> {
  const token = randomBytes(32).toString('base64url');
  const candidateId = randomBytes(16).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO devices (id, token_hash, created_at, identity_hash)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (identity_hash) WHERE identity_hash IS NOT NULL
     DO UPDATE SET token_hash = EXCLUDED.token_hash
     RETURNING id`,
    [candidateId, hashToken(token), identityHash],
  );
  return { deviceId: rows[0].id as string, token };
}

/**
 * Derecho de supresión: borra el dispositivo (token, identidad verificada,
 * última posición) y todo lo que escribió: sus avisos, y sus confirmaciones y
 * denuncias en avisos ajenos (con los contadores corregidos). Transaccional.
 */
export async function deleteDeviceData(deviceId: string): Promise<void> {
  const deviceHash = deviceHashFor(deviceId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM incidents WHERE device_hash = $1`, [deviceHash]);
    await client.query(
      `UPDATE incidents SET confirmations_count = GREATEST(confirmations_count - 1, 0)
       WHERE id IN (SELECT incident_id FROM incident_confirmations WHERE device_hash = $1)`,
      [deviceHash],
    );
    await client.query(`DELETE FROM incident_confirmations WHERE device_hash = $1`, [deviceHash]);
    await client.query(
      `UPDATE incidents SET flags_count = GREATEST(flags_count - 1, 0)
       WHERE id IN (SELECT incident_id FROM incident_flags WHERE device_hash = $1)`,
      [deviceHash],
    );
    await client.query(`DELETE FROM incident_flags WHERE device_hash = $1`, [deviceHash]);
    await client.query(`DELETE FROM devices WHERE id = $1`, [deviceId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyDeviceToken(token: string): Promise<string | null> {
  const device = await lookupDevice(token);
  return device ? device.id : null;
}

export async function updateDeviceLocation(deviceId: string, lat: number, lng: number): Promise<void> {
  await pool.query(
    `UPDATE devices SET last_lat = $1, last_lng = $2, last_at = NOW() WHERE id = $3`,
    [lat, lng, deviceId],
  );
}

export async function getDeviceLastLocation(deviceId: string): Promise<{ lat: number; lng: number; at: Date } | null> {
  const { rows } = await pool.query(
    `SELECT last_lat, last_lng, last_at FROM devices WHERE id = $1`,
    [deviceId],
  );
  if (rows.length === 0 || rows[0].last_lat === null) return null;
  return { lat: Number(rows[0].last_lat), lng: Number(rows[0].last_lng), at: new Date(rows[0].last_at) };
}
