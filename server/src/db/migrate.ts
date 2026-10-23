import { pool } from './index';
import { SCHEMA_SQL } from './schema';
import { config } from '../config';

/**
 * Backfill para filas antiguas sin celda hex: mismo cálculo exacto que
 * lib/geo.ts (port en SQL), para que semillas y datos heredados obtengan
 * su celda. Idempotente (WHERE hex_key IS NULL).
 */
const BACKFILL_SQL = `
UPDATE incidents i SET
  hex_key = 'h_' || calc.row_int || '_' || calc.col_int,
  hex_lat = ROUND((calc.row_int * (450.0 * 1.5) / 111320.0)::numeric, 5)::double precision,
  hex_lng = ROUND(
    ((calc.col_int + (ABS(calc.row_int) % 2) * 0.5) *
    ((450.0 * sqrt(3.0)) / (111320.0 * cos(radians(i.lat)))))::numeric, 5)::double precision
FROM (
  SELECT id,
         ROUND(lat / ((450.0 * 1.5) / 111320.0))::int AS row_int,
         ROUND(
           lng / ((450.0 * sqrt(3.0)) / (111320.0 * cos(radians(lat))))
           - (ABS(ROUND(lat / ((450.0 * 1.5) / 111320.0)))::int % 2) * 0.5
         )::int AS col_int
  FROM incidents
  WHERE hex_key IS NULL AND lat IS NOT NULL
) AS calc
WHERE i.id = calc.id;
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
