import { Incident } from './types';

const min = (m: number) => Date.now() - m * 60_000;

export const makeSeed = (): Incident[] => [
  { id: 'm_teat_1', category: 'vehiculo', zone: { gx: 4, gy: 5, lat: 36.7175, lng: -4.4820, address: 'Teatinos / Universidad' }, description: 'Robo de patinete eléctrico atado junto a la estación de metro Universidad', createdAt: min(240), confirmations: 3 },
  { id: 'm_teat_2', category: 'vehiculo', zone: { gx: 4, gy: 5, lat: 36.7160, lng: -4.4750, address: 'Bulevar Louis Pasteur, Teatinos' }, description: 'Cristal de coche roto en aparcamiento frente a biblioteca', createdAt: min(2880), confirmations: 2 },
  { id: 'm_cent_1', category: 'hurto', zone: { gx: 5, gy: 5, lat: 36.7215, lng: -4.4215, address: 'Calle Larios, Centro Histórico' }, description: 'Hurto de cartera aprovechando aglomeración de gente en la calle comercial', createdAt: min(180), confirmations: 5 },
  { id: 'm_cent_2', category: 'altercado', zone: { gx: 5, gy: 5, lat: 36.7235, lng: -4.4190, address: 'Calle Álamos, Centro Histórico' }, description: 'Pelea y altercado con botellas rotas a altas horas cerca de bares', createdAt: min(1440), confirmations: 6 },
  { id: 'm_cruz_1', category: 'vandalismo', zone: { gx: 4, gy: 5, lat: 36.7145, lng: -4.4480, address: 'Calle San Rafael, Cruz de Humilladero' }, description: 'Pintadas y contenedores volcados en la acera impidiendo el paso', createdAt: min(360), confirmations: 2 },
  { id: 'm_huel_1', category: 'altercado', zone: { gx: 3, gy: 4, lat: 36.7040, lng: -4.4380, address: 'Parque de Huelin, Málaga' }, description: 'Botellón ruidoso con peleas entre grupos en zona verde', createdAt: min(1080), confirmations: 4 },
  { id: 'm_soho_1', category: 'vehiculo', zone: { gx: 5, gy: 5, lat: 36.7150, lng: -4.4240, address: 'Calle Tomás Heredia, Soho' }, description: 'Robo en el interior de una furgoneta de reparto durante la descarga', createdAt: min(1440), confirmations: 3 },
  { id: 'm_mala_1', category: 'hurto', zone: { gx: 6, gy: 5, lat: 36.7190, lng: -4.4060, address: 'Playa de la Malagueta, Málaga' }, description: 'Sustracción de mochila y móvil descuidados en la arena de la playa', createdAt: min(2880), confirmations: 3 },
  { id: 'm_bail_1', category: 'agresion', zone: { gx: 4, gy: 6, lat: 36.7230, lng: -4.4320, address: 'Calle Mármoles, Bailén-Miraflores' }, description: 'Agresión verbal y amenazas en la salida de un supermercado', createdAt: min(1440), confirmations: 5 },
  { id: 'm_pedr_1', category: 'vandalismo', zone: { gx: 7, gy: 5, lat: 36.7210, lng: -4.3780, address: 'Paseo Marítimo de Pedregalejo' }, description: 'Mesas y sillas de terraza rotas y arrojadas durante la noche', createdAt: min(4320), confirmations: 2 },
];
