import { pool } from './index';
import { SCHEMA_SQL } from './schema';
import { config } from '../config';

/**
 * Celda hex de cada aviso: mismo cálculo exacto que lib/geo.ts (port en SQL).
 * Rellena las filas antiguas sin celda y CORRIGE las que se calcularon con la
 * fórmula anterior, cuyo centro variaba según la posición del punto dentro de
 * la celda (delataba su latitud). Solo toca filas cuyo resultado difiere, así
 * que tras el primer arranque no hace nada.
 */
const BACKFILL_SQL = `
UPDATE incidents i SET
  hex_key = calc.key,
  hex_lat = calc.c_lat,
  hex_lng = calc.c_lng
FROM (
  SELECT id,
         'h_' || row_int || '_' || col_int AS key,
         ROUND(row_lat::numeric, 5)::double precision AS c_lat,
         ROUND(
           ((col_int + (ABS(row_int) % 2) * 0.5) *
           ((450.0 * sqrt(3.0)) / (111320.0 * cos(radians(row_lat)))))::numeric, 5)::double precision AS c_lng
  FROM (
    SELECT id, row_int, row_lat,
           ROUND(
             lng / ((450.0 * sqrt(3.0)) / (111320.0 * cos(radians(row_lat))))
             - (ABS(row_int) % 2) * 0.5
           )::int AS col_int
    FROM (
      SELECT id, lng,
             ROUND(lat / ((450.0 * 1.5) / 111320.0))::int AS row_int,
             ROUND(lat / ((450.0 * 1.5) / 111320.0)) * ((450.0 * 1.5) / 111320.0) AS row_lat
      FROM incidents
      WHERE lat IS NOT NULL
    ) r
  ) c
) AS calc
WHERE i.id = calc.id
  AND (i.hex_key IS DISTINCT FROM calc.key
    OR i.hex_lat IS DISTINCT FROM calc.c_lat
    OR i.hex_lng IS DISTINCT FROM calc.c_lng);
`;

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA_SQL);
    await client.query(BACKFILL_SQL);
    await client.query('COMMIT');
    console.log('Database migrations completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to run database migrations:', error);
    throw error;
  } finally {
    client.release();
  }
}
