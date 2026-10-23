/**
 * Rejilla hexagonal del servidor: PORT 1:1 del cálculo de
 * app/src/lib/hexgrid.ts (snapToHexGrid) para que servidor y cliente
 * asignen siempre la MISMA celda a unas coordenadas dadas.
 *
 * Política de privacidad: el servidor guarda las coordenadas originales
 * pero SOLO devuelve el centro de la celda (~450 m). Las coordenadas
 * exactas de un vecino jamás salen de la base de datos.
 */
export const HEX_RADIUS_METERS = 450;

export interface HexCellRef {
  key: string;
  centerLat: number;
  centerLng: number;
}

export function snapToHexGrid(
  lat: number,
  lng: number,
  radiusMeters: number = HEX_RADIUS_METERS,
): HexCellRef {
  const latStep = (radiusMeters * 1.5) / 111320;
  const lngStep = (radiusMeters * Math.sqrt(3)) / (111320 * Math.cos((lat * Math.PI) / 180));

  const row = Math.round(lat / latStep);
  const colOffset = (Math.abs(row) % 2) * 0.5;
  const col = Math.round((lng / lngStep) - colOffset);

  const centerLat = Number((row * latStep).toFixed(5));
  const centerLng = Number(((col + colOffset) * lngStep).toFixed(5));

  return { key: `h_${row}_${col}`, centerLat, centerLng };
}
