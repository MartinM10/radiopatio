import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { snapToHexGrid } from '../lib/geo';
import { levelForScore } from '../lib/quality';
import { CategoryId } from '../types';

/**
 * Estadística de zona con reglas de confianza (docs/TRUST.md §3):
 * - el score SOLO cuenta avisos confirmados por ≥ 2 vecinos,
 * - exige muestra mínima antes de afirmar nada de un barrio,
 * - opera a nivel de celda hexagonal (~450 m).
 */
const alertQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

interface HexRow {
  category: string;
  confirmations_count: string | number;
}

export async function zoneRoutes(app: FastifyInstance) {
  // GET /api/zones/alert?lat=..&lng=..
  app.get('/api/zones/alert', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = alertQuerySchema.safeParse(req.query);
    if (!parseRes.success || parseRes.data.lat === undefined || parseRes.data.lng === undefined) {
      return reply.status(400).send({
        error: 'INVALID_QUERY_PARAMS',
        message: 'Añade lat y lng (el servidor deriva la celda hexagonal).',
      });
    }

    const hex = snapToHexGrid(parseRes.data.lat, parseRes.data.lng);
    const { rows } = await pool.query(
      `SELECT category, confirmations_count
       FROM incidents
       WHERE status = 'active'
         AND hex_key = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 500`,
      [hex.key]
    );

    const incidents = rows as HexRow[];
    const confirmed = incidents.filter((r) => parseInt(String(r.confirmations_count), 10) >= 2);
    const severityBy: Record<string, number> = {
      hogar: 3,
      agresion: 3,
      vehiculo: 2,
      hurto: 2,
      vandalismo: 1,
      sospechoso: 1,
      altercado: 1,
      otro: 1,
    };
    // El score público solo cuenta lo verificado: un aviso sin confirmar
    // no debe mover la aguja del barrio por sí solo.
    const score = confirmed.reduce((s, r) => s + (severityBy[r.category as CategoryId] ?? 1), 0);

    return {
      hex: { key: hex.key, centerLat: hex.centerLat, centerLng: hex.centerLng },
      score,
      confirmedCount: confirmed.length,
      totalCount: incidents.length,
      sampleSufficient: confirmed.length >= 2,
      level: levelForScore(score),
    };
  });
}
