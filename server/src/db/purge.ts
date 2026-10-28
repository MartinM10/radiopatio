/**
 * Purga de retención: los avisos caducados (incidentTtlHours, 72 h) se
 * eliminan físicamente de la base de datos (minimización RGPD). Las
 * confirmaciones y denuncias cascadin por FK.
 */
import { pool } from './index';
import { config } from '../config';

export async function purgeExpiredIncidents(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM incidents WHERE created_at < NOW() - INTERVAL '${config.incidentTtlHours} hours'`,
  );
  // La última posición del dispositivo (control de presencia) vive lo mismo que un aviso.
  await pool.query(
    `UPDATE devices SET last_lat = NULL, last_lng = NULL, last_at = NULL
     WHERE last_at IS NOT NULL AND last_at < NOW() - INTERVAL '${config.incidentTtlHours} hours'`,
  );
  return res.rowCount ?? 0;
}
