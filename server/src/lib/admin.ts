import crypto from 'crypto';
import { FastifyRequest } from 'fastify';
import { config } from '../config';

/** ¿La petición trae el token de administración correcto? Comparación en tiempo constante. */
export const isAdmin = (req: FastifyRequest): boolean => {
  const token = req.headers['x-admin-token'];
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
