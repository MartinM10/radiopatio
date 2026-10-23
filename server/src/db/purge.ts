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
  return res.rowCount ?? 0;
}
