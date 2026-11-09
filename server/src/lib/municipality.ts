import { pool } from '../db';
import { reverseGeocode } from './geocode';

/**
 * Municipio de un aviso, para el recuento diario (incident_daily_counts).
 *
 * Usa la misma geocodificación inversa que sugiere la calle (caché incluida:
 * normalmente la app ya la pidió para ese punto y no sale ninguna petición
 * nueva). Nunca lanza ni retrasa la publicación.
 */
export async function fillMunicipality(incidentId: string, lat: number, lng: number): Promise<void> {
  try {
    const { locality } = await reverseGeocode(lat, lng);
    if (!locality) return;
    await pool.query(
      `UPDATE incidents SET municipality = $2 WHERE id = $1 AND municipality IS NULL`,
      [incidentId, locality.slice(0, 80)],
    );
  } catch (err) {
    console.error('[municipio] no se pudo asignar:', err);
  }
}

/**
 * Reintenta los avisos que se quedaron sin municipio (servicio caído o cola
 * llena en un pico de avisos, justo cuando más importa contarlos). Pocos por
 * pasada para respetar el límite de Nominatim.
 */
export async function backfillMunicipalities(limit = 20): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id, lat, lng FROM incidents
     WHERE municipality IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
       AND created_at < NOW() - INTERVAL '2 minutes'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );
  for (const r of rows) await fillMunicipality(r.id, Number(r.lat), Number(r.lng));
  return rows.length;
}
