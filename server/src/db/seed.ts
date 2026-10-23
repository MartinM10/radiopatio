import { pool } from './index';
import { snapToHexGrid } from '../lib/geo';

interface SeedItem {
  id: string;
  category: string;
  gx: number;
  gy: number;
  description: string;
  minutesAgo: number;
  confirmations: number;
  lat: number;
  lng: number;
  address: string;
}

const seedIncidents: SeedItem[] = [
  { id: 'm_teat_1', category: 'vehiculo', gx: 4, gy: 5, description: 'Robo de patinete eléctrico atado junto a la estación de metro Universidad', minutesAgo: 240, confirmations: 3, lat: 36.7175, lng: -4.4820, address: 'Teatinos / Universidad, Málaga' },
  { id: 'm_teat_2', category: 'vehiculo', gx: 4, gy: 5, description: 'Cristal de coche roto en aparcamiento frente a biblioteca', minutesAgo: 2880, confirmations: 2, lat: 36.7160, lng: -4.4750, address: 'Bulevar Louis Pasteur, Teatinos' },
  { id: 'm_cent_1', category: 'hurto', gx: 5, gy: 5, description: 'Hurto de cartera aprovechando aglomeración de gente en la calle comercial', minutesAgo: 180, confirmations: 5, lat: 36.7215, lng: -4.4215, address: 'Calle Larios, Centro Histórico' },
  { id: 'm_cent_2', category: 'altercado', gx: 5, gy: 5, description: 'Pelea y altercado con botellas rotas a altas horas cerca de bares', minutesAgo: 1440, confirmations: 6, lat: 36.7235, lng: -4.4190, address: 'Calle Álamos, Centro Histórico' },
  { id: 'm_cruz_1', category: 'vandalismo', gx: 4, gy: 5, description: 'Pintadas y contenedores volcados en la acera impidiendo el paso', minutesAgo: 360, confirmations: 2, lat: 36.7145, lng: -4.4480, address: 'Calle San Rafael, Cruz de Humilladero' },
  { id: 'm_huel_1', category: 'altercado', gx: 3, gy: 4, description: 'Botellón ruidoso con peleas entre grupos en zona verde', minutesAgo: 1080, confirmations: 4, lat: 36.7040, lng: -4.4380, address: 'Parque de Huelin, Málaga' },
  { id: 'm_soho_1', category: 'vehiculo', gx: 5, gy: 5, description: 'Robo en el interior de una furgoneta de reparto durante la descarga', minutesAgo: 1440, confirmations: 3, lat: 36.7150, lng: -4.4240, address: 'Calle Tomás Heredia, Soho' },
  { id: 'm_mala_1', category: 'hurto', gx: 6, gy: 5, description: 'Sustracción de mochila y móvil descuidados en la arena de la playa', minutesAgo: 2880, confirmations: 3, lat: 36.7190, lng: -4.4060, address: 'Playa de la Malagueta, Málaga' },
  { id: 'm_bail_1', category: 'agresion', gx: 4, gy: 6, description: 'Agresión verbal y amenazas en la salida de un supermercado', minutesAgo: 1440, confirmations: 5, lat: 36.7230, lng: -4.4320, address: 'Calle Mármoles, Bailén-Miraflores' },
  { id: 'm_pedr_1', category: 'vandalismo', gx: 7, gy: 5, description: 'Mesas y sillas de terraza rotas y arrojadas durante la noche', minutesAgo: 4320, confirmations: 2, lat: 36.7210, lng: -4.3780, address: 'Paseo Marítimo de Pedregalejo' },
  { id: 'e_mad_1', category: 'hurto', gx: 5, gy: 5, description: 'Carteristas codo a codo en la estación más céntrica de Madrid a primera hora de la tarde', minutesAgo: 150, confirmations: 4, lat: 40.4205, lng: -3.6926, address: 'Puerta del Sol, Madrid' },
  { id: 'e_mad_2', category: 'vandalismo', gx: 5, gy: 5, description: 'Panel publicitario del ramal de la M-30 destrozado y saltado esta noche', minutesAgo: 300, confirmations: 2, lat: 40.4318, lng: -3.6982, address: 'Chamberí, Madrid' },
  { id: 'e_bar_1', category: 'agresion', gx: 5, gy: 5, description: 'Discusión escalada a empujones frente a la terraza de la entrada del paseo', minutesAgo: 210, confirmations: 5, lat: 41.3860, lng: 2.1801, address: 'Ciutat Vella, Barcelona' },
  { id: 'e_bil_1', category: 'vandalismo', gx: 5, gy: 5, description: 'Pintadas nuevas esta noche en la fachada del edificio del casco viejo', minutesAgo: 480, confirmations: 3, lat: 43.2598, lng: -2.9243, address: 'Casco Viejo, Bilbao' },
  { id: 'e_sev_1', category: 'hurto', gx: 5, gy: 5, description: 'Tirón de bolso a una persona mayor en el tramo estrecho del puente nuevo', minutesAgo: 120, confirmations: 3, lat: 37.3850, lng: -5.9996, address: 'Triana, Sevilla' },
  { id: 'e_val_1', category: 'sospechoso', gx: 5, gy: 5, description: 'Personas probando manetas de los coches aparcados en la calle del barrio', minutesAgo: 90, confirmations: 2, lat: 39.4608, lng: -0.3802, address: 'Russafa, València' },
];

export async function seedIfEmpty(): Promise<void> {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM incidents');
  const count = parseInt(rows[0]?.count ?? '0', 10);
  if (count > 0) return;

  console.log('Database has no incidents. Seeding initial incidents across Spain (Málaga, Madrid, Barcelona, Bilbao, Sevilla, València)...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of seedIncidents) {
      const createdAt = new Date(Date.now() - item.minutesAgo * 60_000);
      // La celda hexagonal nace en el servidor: las semillas mueren con ella.
      const hex = snapToHexGrid(item.lat, item.lng);
      await client.query(
        `INSERT INTO incidents (id, category, grid_x, grid_y, description, created_at, confirmations_count, flags_count, status, device_hash, lat, lng, address, hex_key, hex_lat, hex_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active', 'system_seed', $8, $9, $10, $11, $12, $13)`,
        [item.id, item.category, item.gx, item.gy, item.description, createdAt, item.confirmations, item.lat, item.lng, item.address, hex.key, hex.centerLat, hex.centerLng]
      );
    }
    await client.query('COMMIT');
    console.log(`Seeded ${seedIncidents.length} initial Málaga incidents.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding incidents:', err);
  } finally {
    client.release();
  }
}
