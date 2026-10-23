import { createHash, randomBytes } from 'crypto';
import { FastifyRequest } from 'fastify';
import { config } from '../config';
import { pool } from '../db';

/**
 * Identidad pseudónima por dispositivo.
 *
 * Fase 1 (actual): el cliente manda un X-Device-Id aleatorio; el servidor
 * guarda su hash con sal. Es pseudonimato, pero el id lo elige el cliente
 * (rotarlo es trivial: Sybil barato).
 *
 * Fase 2 (este módulo): el servidor EMITE un token de dispositivo una sola
 * vez (POST /api/devices/register). El cliente lo guarda y lo manda como
 * X-Device-Token. El hash del token es la identidad real: rotarlo implica
 * perder el token (no se puede regenerar sin re-registrar, que cuenta como
 * una identidad nueva con trust_level 0). Sigue siendo pseudónimo: sin email,
 * sin nombre, sin IP en claro.
 *
 * Google/OTP (fase 2b) se enchufarán aquí: verificar el id_token de Google
 * o el código SMS y emitir el mismo token de dispositivo.
 */

export function getDeviceHash(req: FastifyRequest): string {
  const headerVal = req.headers['x-device-token'];
  const rawId =
    typeof headerVal === 'string' && headerVal.trim().length > 0
      ? `tok:${headerVal.trim()}`
      : (req.headers['x-device-id'] as string | undefined)?.trim() || req.ip;

  return createHash('sha256')
    .update(`${rawId}:${config.deviceSalt}`)
    .digest('hex');
}

export interface IssuedDevice {
  deviceId: string;
  token: string;
}

export async function registerDevice(): Promise<IssuedDevice> {
  const deviceId = randomBytes(16).toString('hex');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256')
    .update(`${token}:${config.deviceSalt}`)
    .digest('hex');

  await pool.query(
    `INSERT INTO devices (id, token_hash, created_at) VALUES ($1, $2, NOW())`,
    [deviceId, tokenHash],
  );

  return { deviceId, token };
}

export async function verifyDeviceToken(token: string): Promise<string | null> {
  const tokenHash = createHash('sha256')
    .update(`${token}:${config.deviceSalt}`)
    .digest('hex');
  const { rows } = await pool.query(
    `SELECT id FROM devices WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows.length > 0 ? (rows[0].id as string) : null;
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
