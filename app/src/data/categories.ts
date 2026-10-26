import { Category, CategoryId } from './types';

export const categories: Category[] = [
  // Seguridad y Convivencia
  { id: 'hogar', label: 'Robo en vivienda', emoji: '🏠', severity: 3, hint: 'Intento o robo en casa, portal o local', group: 'seguridad' },
  { id: 'vehiculo', label: 'Robo de vehículo', emoji: '🚗', severity: 2, hint: 'Coche, moto o bici; o robo en su interior', group: 'seguridad' },
  { id: 'hurto', label: 'Hurto / tirón', emoji: '👜', severity: 2, hint: 'Carteristas, tirones de bolso o móvil', group: 'seguridad' },
  { id: 'agresion', label: 'Agresión', emoji: '⚠️', severity: 3, hint: 'Violencia física o amenazas en la calle', group: 'seguridad' },
  { id: 'vandalismo', label: 'Vandalismo', emoji: '🧯', severity: 1, hint: 'Destrozos, pintadas, mobiliario dañado', group: 'seguridad' },
  { id: 'sospechoso', label: 'Actividad sospechosa', emoji: '👀', severity: 1, hint: 'Algo raro, sin delito claro todavía', group: 'seguridad' },
  { id: 'altercado', label: 'Altercado / ruido', emoji: '📢', severity: 1, hint: 'Peleas, botellón, ruidos molestos', group: 'seguridad' },

  // Servicios y Vía Pública
  { id: 'corte_agua', label: 'Corte de agua / fuga', emoji: '💧', severity: 1, hint: 'Sin agua, bajada de presión o tubería rota', group: 'servicios' },
  { id: 'corte_luz', label: 'Corte de luz', emoji: '⚡', severity: 1, hint: 'Avería eléctrica en la manzana, bloque o alumbrado', group: 'servicios' },
  { id: 'alumbrado', label: 'Farola / alumbrado', emoji: '💡', severity: 1, hint: 'Farolas apagadas o rotas, tramo a oscuras', group: 'servicios' },
  { id: 'calzada', label: 'Asfalto / calzada', emoji: '🚧', severity: 1, hint: 'Baches, socavones, obras o alcantarillas', group: 'servicios' },
  { id: 'limpieza', label: 'Limpieza / residuos', emoji: '🗑️', severity: 1, hint: 'Contenedores desbordados o suciedad grave', group: 'servicios' },
  { id: 'perdido', label: 'Objeto / mascota', emoji: '🐾', severity: 1, hint: 'Mascota perdida o pertenencia extraviada', group: 'servicios' },

  // General
  { id: 'otro', label: 'Otro aviso', emoji: '📍', severity: 1, hint: 'Cualquier otra incidencia de interés vecinal', group: 'general' },
];

export const categoryById = (id: CategoryId): Category =>
  categories.find((c) => c.id === id) ?? categories[categories.length - 1];

