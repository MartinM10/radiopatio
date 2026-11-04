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
  // Notificaciones: la bandeja guarda dos semanas; la zona del vecino caduca si
  // no abre la app en una semana (no se le avisa de «cerca de ti» sin saber dónde está).
  await pool.query(`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '14 days'`);
  await pool.query(
    `UPDATE devices SET area_lat = NULL, area_lng = NULL, area_at = NULL
     WHERE area_at IS NOT NULL AND area_at < NOW() - INTERVAL '7 days'`,
  );
  return res.rowCount ?? 0;
}
