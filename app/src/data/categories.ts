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

  // Emergencias y clima
  { id: 'inundacion', label: 'Inundación', emoji: '🌊', severity: 3, hint: 'Calle, garaje o bajo inundado; balsa de agua peligrosa', group: 'emergencias' },
  { id: 'incendio', label: 'Incendio / humo', emoji: '🔥', severity: 3, hint: 'Fuego o humo cerca de ti; si solo lo ves a lo lejos, no hace falta avisar', group: 'emergencias' },
  { id: 'derrumbe', label: 'Derrumbe', emoji: '🧱', severity: 3, hint: 'Muro, cornisa, fachada o ladera que se ha caído o amenaza caer', group: 'emergencias' },
  { id: 'arbol', label: 'Árbol caído', emoji: '🌳', severity: 2, hint: 'Árbol o rama grande caída en la calle o sobre algo', group: 'emergencias' },
  { id: 'calle_cortada', label: 'Calle cortada', emoji: '🚫', severity: 1, hint: 'Paso cortado por accidente, obra, temporal o evento', group: 'emergencias' },

  // General
  { id: 'otro', label: 'Otro aviso', emoji: '📍', severity: 1, hint: 'Cualquier otra incidencia de interés vecinal', group: 'general' },
];

export const categoryById = (id: CategoryId): Category =>
  categories.find((c) => c.id === id) ?? categories[categories.length - 1];


/**
 * Las emergencias y el clima (inundación, árbol caído...) no dicen nada de la
 * seguridad de un barrio: no cuentan para su nivel «Tranquilo / Alerta».
 */
export const countsForSafety = (id: CategoryId): boolean => categoryById(id).group !== 'emergencias';

/** Emergencias en las que, si hay alguien en peligro, primero se llama al 112. */
export const isLifeThreatening = (id: CategoryId): boolean => {
  const c = categoryById(id);
  return c.group === 'emergencias' && c.severity === 3;
};
