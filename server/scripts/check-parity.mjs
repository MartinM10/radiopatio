/**
 * Comprobación de paridad: la celda hex calculada por el JS del servidor
 * (lib/geo.ts) coincide 1:1 con el backfill SQL de la base de datos.
 * Uso (con db y server arrancados y el backend compilado):
 *   docker compose run --rm -T server npm run build && npm run check:parity
 */
import { snapToHexGrid } from '../dist/lib/geo.js';
import { pool } from '../dist/db/index.js';

(async () => {
  const { rows } = await pool.query(
    'SELECT id, lat, lng, hex_key, hex_lat, hex_lng FROM incidents WHERE lat IS NOT NULL',
  );
  let ok = 0;
  let bad = 0;
  for (const r of rows) {
    const h = snapToHexGrid(r.lat, r.lng);
    const same =
      h.key === r.hex_key &&
      Math.abs(h.centerLat - r.hex_lat) < 1e-9 &&
      Math.abs(h.centerLng - r.hex_lng) < 1e-9;
    if (same) ok++;
    else {
      bad++;
      console.log('DIVERGENTE', r.id, r.hex_key, h.key, r.hex_lat, h.centerLat, r.hex_lng, h.centerLng);
    }
  }
  console.log(`paridad SQL↔JS: ${ok} iguales, ${bad} divergentes, de ${rows.length} filas`);
  await pool.end();
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('check de paridad no ejecutable:', e.message);
  process.exit(1);
});
