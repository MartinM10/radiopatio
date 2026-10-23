export interface Neighborhood {
  id: string;
  name: string;
  center: [number, number];
  polygon: [number, number][];
}

export const NEIGHBORHOODS: Neighborhood[] = [
  {
    id: 'teatinos',
    name: 'Teatinos / Universidad',
    center: [36.7180, -4.4850],
    polygon: [
      [36.7100, -4.5150],
      [36.7320, -4.5150],
      [36.7320, -4.4650],
      [36.7100, -4.4650],
    ],
  },
  {
    id: 'centro',
    name: 'Centro Histórico',
    center: [36.7220, -4.4215],
    polygon: [
      [36.7160, -4.4300],
      [36.7300, -4.4300],
      [36.7300, -4.4150],
      [36.7160, -4.4150],
    ],
  },
  {
    id: 'soho',
    name: 'Soho / Puerto',
    center: [36.7150, -4.4230],
    polygon: [
      [36.7100, -4.4300],
      [36.7165, -4.4300],
      [36.7165, -4.4160],
      [36.7100, -4.4160],
    ],
  },
  {
    id: 'cruz_humilladero',
    name: 'Cruz de Humilladero',
    center: [36.7150, -4.4500],
    polygon: [
      [36.7080, -4.4650],
      [36.7220, -4.4650],
      [36.7220, -4.4350],
      [36.7080, -4.4350],
    ],
  },
  {
    id: 'carretera_cadiz',
    name: 'Carretera de Cádiz / Huelin',
    center: [36.7020, -4.4420],
    polygon: [
      [36.6880, -4.4600],
      [36.7100, -4.4600],
      [36.7100, -4.4300],
      [36.6880, -4.4300],
    ],
  },
  {
    id: 'bailen_miraflores',
    name: 'Bailén - Miraflores / Trinidad',
    center: [36.7280, -4.4420],
    polygon: [
      [36.7220, -4.4600],
      [36.7400, -4.4600],
      [36.7400, -4.4300],
      [36.7220, -4.4300],
    ],
  },
  {
    id: 'malagueta',
    name: 'La Malagueta / Monte Sancha',
    center: [36.7210, -4.4070],
    polygon: [
      [36.7140, -4.4160],
      [36.7280, -4.4160],
      [36.7280, -4.3980],
      [36.7140, -4.3980],
    ],
  },
  {
    id: 'pedregalejo',
    name: 'Pedregalejo / El Palo',
    center: [36.7200, -4.3750],
    polygon: [
      [36.7130, -4.3980],
      [36.7320, -4.3980],
      [36.7320, -4.3480],
      [36.7130, -4.3480],
    ],
  },
];

// Algoritmo Ray-Casting para detectar si un punto está dentro de un polígono
export function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getNeighborhoodForPoint(lat: number, lng: number): Neighborhood {
  for (const n of NEIGHBORHOODS) {
    if (isPointInPolygon([lat, lng], n.polygon)) return n;
  }
  // En caso de estar ligeramente fuera, asigna al más cercano
  let closest = NEIGHBORHOODS[0];
  let minDistance = Infinity;
  for (const n of NEIGHBORHOODS) {
    const dist = Math.hypot(lat - n.center[0], lng - n.center[1]);
    if (dist < minDistance) {
      minDistance = dist;
      closest = n;
    }
  }
  return closest;
}

export interface NeighborhoodCrimeStats {
  neighborhood: Neighborhood;
  incidentCount: number;
  severityScore: number;
  level: 'tranquilo' | 'bajo' | 'moderado' | 'atencion' | 'alerta';
  levelLabel: string;
  color: string;
}

export function calculateNeighborhoodStats(
  incidents: { zone: { lat?: number; lng?: number; gx: number; gy: number }; category: any }[],
  severityLookup: (cat: any) => number,
): NeighborhoodCrimeStats[] {
  return NEIGHBORHOODS.map((n) => {
    const inNeighborhood = incidents.filter((i) => {
      const lat = i.zone.lat ?? 36.7180;
      const lng = i.zone.lng ?? -4.4850;
      return getNeighborhoodForPoint(lat, lng).id === n.id;
    });

    const incidentCount = inNeighborhood.length;
    const severityScore = inNeighborhood.reduce((acc, curr) => acc + severityLookup(curr.category), 0);

    let level: NeighborhoodCrimeStats['level'] = 'tranquilo';
    let levelLabel = 'Tranquilo';
    let color = '#22C55E'; // Verde

    if (severityScore === 0) {
      level = 'tranquilo';
      levelLabel = 'Tranquilo';
      color = '#22C55E';
    } else if (severityScore <= 3) {
      level = 'bajo';
      levelLabel = 'Bajo';
      color = '#84CC16'; // Verde lima
    } else if (severityScore <= 7) {
      level = 'moderado';
      levelLabel = 'Moderado';
      color = '#EAB308'; // Amarillo
    } else if (severityScore <= 12) {
      level = 'atencion';
      levelLabel = 'Atención';
      color = '#F97316'; // Naranja
    } else {
      level = 'alerta';
      levelLabel = 'Alerta Vecinal';
      color = '#EF4444'; // Rojo
    }

    return {
      neighborhood: n,
      incidentCount,
      severityScore,
      level,
      levelLabel,
      color,
    };
  });
}
