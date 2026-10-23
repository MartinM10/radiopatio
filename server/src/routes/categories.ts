import { FastifyInstance } from 'fastify';
import { Category } from '../types';

export const categories: Category[] = [
  { id: 'hogar', label: 'Robo en vivienda', emoji: '🏠', severity: 3, hint: 'Intento o robo en casa, portal o local' },
  { id: 'vehiculo', label: 'Robo de vehículo', emoji: '🚗', severity: 2, hint: 'Coche, moto o bici; o robo en su interior' },
  { id: 'hurto', label: 'Hurto / tirón', emoji: '👜', severity: 2, hint: 'Carteristas, tirones de bolso o móvil' },
  { id: 'agresion', label: 'Agresión', emoji: '⚠️', severity: 3, hint: 'Violencia física o amenazas en la calle' },
  { id: 'vandalismo', label: 'Vandalismo', emoji: '🧯', severity: 1, hint: 'Destrozos, pintadas, mobiliario dañado' },
  { id: 'sospechoso', label: 'Actividad sospechosa', emoji: '👀', severity: 1, hint: 'Algo raro, sin delito claro todavía' },
  { id: 'altercado', label: 'Altercado / ruido', emoji: '📢', severity: 1, hint: 'Peleas, botellón, ruidos molestos' },
  { id: 'otro', label: 'Otro', emoji: '📍', severity: 1, hint: 'Cualquier otra incidencia de seguridad' },
];

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/api/categories', async () => {
    return { data: categories };
  });
}
