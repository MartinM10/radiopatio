/**
 * Purga de retención: los avisos caducados (incidentTtlHours, 72 h) se
 * eliminan físicamente de la base de datos (minimización RGPD). Las
 * confirmaciones y denuncias cascadin por FK.
 *
 * Antes de borrarlos, en la MISMA sentencia, se suman al recuento diario
 * anónimo (día en hora de Madrid, municipio y categoría). Solo cuentan los
 * avisos que llegaron a ser públicos ('active'): los ocultados por moderación
 * y los que siguieron en cuarentena no. Los que un vecino borra antes de
 * caducar (derecho de supresión) tampoco se cuentan.
 */
import { pool } from './index';
import { config } from '../config';

export async function purgeExpiredIncidents(): Promise<number> {
  const res = await pool.query(
    `WITH gone AS (
       DELETE FROM incidents
       WHERE created_at < NOW() - INTERVAL '${config.incidentTtlHours} hours'
       RETURNING category, created_at, status, confirmations_count, municipality
     ), counted AS (
       INSERT INTO incident_daily_counts AS c (day, municipality, category, total, confirmed, verified)
       SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date, COALESCE(municipality, ''), category,
              COUNT(*), COUNT(*) FILTER (WHERE confirmations_count >= 1), COUNT(*) FILTER (WHERE confirmations_count >= 2)
       FROM gone WHERE status = 'active'
       GROUP BY 1, 2, 3
       ON CONFLICT (day, municipality, category) DO UPDATE SET
         total = c.total + EXCLUDED.total,
         confirmed = c.confirmed + EXCLUDED.confirmed,
         verified = c.verified + EXCLUDED.verified
       RETURNING 1
     )
     SELECT (SELECT COUNT(*) FROM gone)::int AS n`,
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
  return res.rows[0]?.n ?? 0;
}
