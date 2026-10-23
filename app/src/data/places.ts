/**
 * Catálogo offline de referencia nacional (ciudades grandes y provincias).
 * Sirve solo para ETIQUETAR zonas («~2.1 km de Valencia Centro»), nunca para
 * filtrar ni restringir: la rejilla hexagonal cubre todo el territorio sin
 * catálogo. Sin geocodificadores externos: las coordenadas del vecino no
 * salen del dispositivo (RGPD).
 */
export interface Place {
  name: string;
  center: [number, number]; // [lat, lng]
}

export const PLACES: Place[] = [
  { name: 'Madrid', center: [40.4168, -3.7038] },
  { name: 'Barcelona', center: [41.3874, 2.1686] },
  { name: 'Valencia', center: [39.4699, -0.3763] },
  { name: 'Sevilla', center: [37.3891, -5.9846] },
  { name: 'Zaragoza', center: [41.6488, -0.8891] },
  { name: 'Málaga', center: [36.7213, -4.4214] },
  { name: 'Murcia', center: [37.9923, -1.1307] },
  { name: 'Palma de Mallorca', center: [39.5696, 2.6502] },
  { name: 'Las Palmas de Gran Canaria', center: [28.1235, -15.4363] },
  { name: 'Bilbao', center: [43.2630, -2.9350] },
  { name: 'Alicante', center: [38.3452, -0.4810] },
  { name: 'Córdoba', center: [37.3925, -5.9944] },
  { name: 'Valladolid', center: [41.6522, -4.7245] },
  { name: 'Vigo', center: [42.2406, -8.7207] },
  { name: 'Gijón', center: [43.5453, -5.6619] },
  { name: 'La Coruña', center: [43.3623, -8.4115] },
  { name: 'Vitoria-Gasteiz', center: [42.8467, -2.6716] },
  { name: 'Granada', center: [37.1773, -3.5986] },
  { name: 'Elche', center: [38.2672, -0.6955] },
  { name: 'Oviedo', center: [43.3619, -5.8494] },
  { name: 'Santa Cruz de Tenerife', center: [28.4636, -16.2518] },
  { name: 'Badalona', center: [41.4503, 2.2475] },
  { name: 'Cartagena', center: [37.6043, -0.9838] },
  { name: 'Terrassa', center: [41.5654, 2.0149] },
  { name: 'Jerez de la Frontera', center: [36.6829, -6.2137] },
  { name: 'Sabadell', center: [41.5427, 2.1090] },
  { name: 'Getafe', center: [40.3081, -3.7325] },
  { name: 'Alcalá de Henares', center: [40.4840, -3.3635] },
  { name: 'Leganés', center: [40.3281, -3.7651] },
  { name: 'Santa Coloma de Gramenet', center: [41.4528, 2.2068] },
  { name: 'Hospitalet de Llobregat', center: [41.3598, 2.1075] },
  { name: 'Castellón de la Plana', center: [39.9790, -0.0332] },
  { name: 'Badajoz', center: [38.8794, -6.9706] },
  { name: 'Salamanca', center: [40.9701, -5.6635] },
  { name: 'Tarragona', center: [41.1189, 1.2445] },
  { name: 'León', center: [42.5987, -5.5671] },
  { name: 'Almería', center: [36.8340, -2.4637] },
  { name: 'Burgos', center: [42.3439, -3.6993] },
  { name: 'Santander', center: [43.4623, -3.8098] },
  { name: 'San Sebastián', center: [43.3183, -1.9812] },
  { name: 'Logroño', center: [42.4723, -2.4439] },
  { name: 'Cáceres', center: [39.4748, -6.3716] },
  { name: 'Pamplona', center: [42.8125, -1.6431] },
  { name: 'Huelva', center: [37.2614, -6.9447] },
  { name: 'Lleida', center: [41.6188, 0.6268] },
  { name: 'Girona', center: [41.9794, 2.8214] },
  { name: 'Albacete', center: [38.9954, -1.8555] },
  { name: 'Marbella', center: [36.5152, -4.8863] },
  { name: 'Jaén', center: [37.7796, -3.7915] },
  { name: 'Cádiz', center: [36.5271, -6.2891] },
  { name: 'Ciudad Real', center: [38.9844, -3.9264] },
  { name: 'Toledo', center: [39.8628, -4.0273] },
  { name: 'Guadalajara', center: [40.6333, -3.1693] },
  { name: 'Cuenca', center: [40.0702, -2.1370] },
  { name: 'Segovia', center: [40.9485, -4.1177] },
  { name: 'Ávila', center: [40.6566, -4.6773] },
  { name: 'Soria', center: [41.7637, -2.4663] },
  { name: 'Palencia', center: [42.0105, -4.5289] },
  { name: 'Zamora', center: [41.5037, -5.7441] },
  { name: 'Ourense', center: [42.3407, -7.8654] },
  { name: 'Lugo', center: [43.0107, -7.5537] },
  { name: 'Santiago de Compostela', center: [42.8782, -8.5448] },
  { name: 'Pontevedra', center: [42.4294, -8.6476] },
  { name: 'Huesca', center: [42.1361, -0.4079] },
  { name: 'Teruel', center: [40.3450, -1.1064] },
  { name: 'Ibiza', center: [38.9068, 1.4285] },
  { name: 'Ceuta', center: [35.8883, -5.3163] },
  { name: 'Melilla', center: [35.2925, -2.9443] },
];

/** Distancia ortodrómica aproximada entre dos puntos, en metros. */
export const haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
};

const NEAR_MS = 800;

/** Etiqueta humana de una coordenada: ciudad más próxima y distancia. */
export const placeLabel = (lat: number, lng: number): string => {
  let best: { name: string; meters: number } | null = null;
  for (const p of PLACES) {
    const meters = haversineMeters({ lat, lng }, { lat: p.center[0], lng: p.center[1] });
    if (!best || meters < best.meters) best = { name: p.name, meters };
  }
  if (!best) return 'España';
  if (best.meters < NEAR_MS) return best.name;
  const km = best.meters / 1000;
  const kmText = km >= 10 ? String(Math.round(km)) : km.toFixed(1).replace('.', ',');
  return `~${kmText} km de ${best.name}`;
};
