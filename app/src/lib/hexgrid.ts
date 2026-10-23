import { Incident } from '../data/types';
import { categoryById } from '../data/categories';
import { CONFIRMED_AT } from './dataQuality';

export interface HexCell {
  id: string;
  name: string;
  center: [number, number];
  polygon: [number, number][];
  incidentCount: number;
  severityScore: number;
  level: 'tranquilo' | 'moderado' | 'atencion' | 'alerta';
  levelLabel: string;
  color: string;
  incidents: Incident[];
}

// Radio aproximado de cada hexágono en metros (~400 metros de radio para granularidad de barrio/zona)
const HEX_RADIUS_METERS = 450;

/**
 * Calcula los 6 vértices de un hexágono regular a partir de su centro
 */
export function getHexagonPolygon(
  centerLat: number,
  centerLng: number,
  radiusMeters = HEX_RADIUS_METERS,
): [number, number][] {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
  const vertices: [number, number][] = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const dLat = latDelta * Math.sin(angle);
    const dLng = lngDelta * Math.cos(angle);
    vertices.push([
      Number((centerLat + dLat).toFixed(5)),
      Number((centerLng + dLng).toFixed(5)),
    ]);
  }
  return vertices;
}

/**
 * Convierte cualquier coordenada (lat, lng) en la clave y centro de su hexágono en la rejilla
 */
export function snapToHexGrid(lat: number, lng: number, radiusMeters = HEX_RADIUS_METERS): { key: string; centerLat: number; centerLng: number } {
  const latStep = (radiusMeters * 1.5) / 111320;
  const lngStep = (radiusMeters * Math.sqrt(3)) / (111320 * Math.cos((lat * Math.PI) / 180));

  const row = Math.round(lat / latStep);
  const colOffset = (Math.abs(row) % 2) * 0.5;
  const col = Math.round((lng / lngStep) - colOffset);

  const centerLat = Number((row * latStep).toFixed(5));
  const centerLng = Number(((col + colOffset) * lngStep).toFixed(5));

  return {
    key: `h_${row}_${col}`,
    centerLat,
    centerLng,
  };
}

/**
 * Agrupa cualquier lista de avisos del mundo en celdas hexagonales automáticas con su nivel de delincuencia
 */
export function buildHexGridForIncidents(
  incidents: Incident[],
  includeNeighbors = true,
): HexCell[] {
  const cellMap = new Map<
    string,
    {
      center: [number, number];
      incidents: Incident[];
    }
  >();

  // 1. Asignar cada aviso a su celda hexagonal
  for (const inc of incidents) {
    const lat = inc.zone?.lat ?? 36.7196;
    const lng = inc.zone?.lng ?? -4.4450;

    const { key, centerLat, centerLng } = snapToHexGrid(lat, lng);

    if (!cellMap.has(key)) {
      cellMap.set(key, {
        center: [centerLat, centerLng],
        incidents: [],
      });
    }

    cellMap.get(key)!.incidents.push(inc);
  }

  // 2. Si se solicitan vecinos, generar hexágonos adyacentes en estado 'Tranquilo' para dar sensación de mapa continuo
  if (includeNeighbors && cellMap.size > 0) {
    const existingKeys = Array.from(cellMap.keys());
    for (const key of existingKeys) {
      const { center } = cellMap.get(key)!;
      const [cLat, cLng] = center;

      const latDelta = (HEX_RADIUS_METERS * 1.5) / 111320;
      const lngDelta = (HEX_RADIUS_METERS * Math.sqrt(3)) / (111320 * Math.cos((cLat * Math.PI) / 180));

      const neighborOffsets = [
        [latDelta, lngDelta * 0.5],
        [latDelta, -lngDelta * 0.5],
        [-latDelta, lngDelta * 0.5],
        [-latDelta, -lngDelta * 0.5],
        [0, lngDelta],
        [0, -lngDelta],
      ];

      for (const [dLat, dLng] of neighborOffsets) {
        const nLat = cLat + dLat;
        const nLng = cLng + dLng;
        const nSnap = snapToHexGrid(nLat, nLng);
        if (!cellMap.has(nSnap.key)) {
          cellMap.set(nSnap.key, {
            center: [nSnap.centerLat, nSnap.centerLng],
            incidents: [],
          });
        }
      }
    }
  }

  // 3. Transformar celdas en HexCell con puntuación, color y nombre del barrio/calle
  const result: HexCell[] = [];

  for (const [key, data] of cellMap.entries()) {
    const incCount = data.incidents.length;
    // Veracidad (docs/TRUST.md §3): los avisos sin confirmar por vecinos
    // pesan la mitad; un aviso aislado sin verificar no dispara la alerta
    // por sí solo.
    const severityScore = data.incidents.reduce(
      (acc, inc) =>
        acc + categoryById(inc.category).severity * (inc.confirmations >= CONFIRMED_AT ? 1 : 0.5),
      0,
    );

    let level: HexCell['level'] = 'tranquilo';
    let levelLabel = 'Tranquilo';
    let color = '#22C55E'; // Verde

    if (severityScore === 0) {
      level = 'tranquilo';
      levelLabel = 'Tranquilo';
      color = '#22C55E';
    } else if (severityScore <= 3) {
      level = 'moderado';
      levelLabel = 'Moderado';
      color = '#EAB308'; // Amarillo
    } else if (severityScore <= 8) {
      level = 'atencion';
      levelLabel = 'Atención';
      color = '#F97316'; // Naranja
    } else {
      level = 'alerta';
      levelLabel = 'Alerta Vecinal';
      color = '#EF4444'; // Rojo
    }

    // Extraer nombre legible del lugar (del aviso más reciente o coordenadas)
    let name = `Sector [${data.center[0].toFixed(3)}, ${data.center[1].toFixed(3)}]`;
    const incWithAddr = data.incidents.find((i) => i.zone?.address && i.zone.address.length > 3);
    if (incWithAddr?.zone?.address) {
      name = incWithAddr.zone.address.split(',')[0];
    }

    result.push({
      id: key,
      name,
      center: data.center,
      polygon: getHexagonPolygon(data.center[0], data.center[1]),
      incidentCount: incCount,
      severityScore,
      level,
      levelLabel,
      color,
      incidents: data.incidents,
    });
  }

  return result;
}
