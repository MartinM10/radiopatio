export type Severity = 1 | 2 | 3;

export type CategoryId =
  | 'hogar'
  | 'vehiculo'
  | 'hurto'
  | 'agresion'
  | 'vandalismo'
  | 'sospechoso'
  | 'altercado'
  | 'otro';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  severity: Severity;
  hint: string;
}

/** Zona / Ubicación en el mapa */
export interface Zone {
  gx: number;
  gy: number;
  lat?: number;
  lng?: number;
  address?: string;
}

export interface Incident {
  id: string;
  category: CategoryId;
  zone: Zone;
  description: string;
  createdAt: number;
  confirmations: number;
  /** El usuario de este dispositivo ya confirmó este aviso. */
  confirmedByMe?: boolean;
  /** El usuario de este dispositivo lo marcó como inadecuado. */
  flaggedByMe?: boolean;
  /** Creado en este dispositivo. */
  mine?: boolean;
  status?: 'active' | 'hidden' | 'pending' | 'deleted';
}
