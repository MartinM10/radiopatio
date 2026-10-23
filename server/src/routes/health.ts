import { FastifyInstance } from 'fastify';
import { pool } from '../db';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.status(503);
      return {
        status: 'degraded',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Database error',
        timestamp: new Date().toISOString(),
      };
    }
  });
}
