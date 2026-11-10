export type Severity = 1 | 2 | 3;

export type CategoryId =
  | 'hogar'
  | 'vehiculo'
  | 'hurto'
  | 'agresion'
  | 'vandalismo'
  | 'sospechoso'
  | 'altercado'
  | 'corte_agua'
  | 'corte_luz'
  | 'alumbrado'
  | 'calzada'
  | 'limpieza'
  | 'perdido'
  | 'inundacion'
  | 'incendio'
  | 'derrumbe'
  | 'arbol'
  | 'calle_cortada'
  | 'otro';

export type CategoryGroup = 'seguridad' | 'servicios' | 'emergencias' | 'general';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  severity: Severity;
  hint: string;
  group?: CategoryGroup;
  /** Admite foto: solo donde no hay una persona señalada (objeto perdido, servicios, emergencias). */
  allowsPhoto?: boolean;
  /** Cuánto dura el aviso si nadie lo amplía ni lo cierra. */
  ttlHours: number;
}

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
  confirmedByMe?: boolean;
  flaggedByMe?: boolean;
  mine?: boolean;
  status?: 'active' | 'hidden' | 'pending' | 'deleted';
  hasPhoto?: boolean;
  /** Cuándo desaparece (ms). Puede ampliarse con «sigue ahí» o acortarse al resolverse. */
  expiresAt?: number;
  /** El autor o los vecinos lo han dado por resuelto: desaparece en pocas horas. */
  resolved?: boolean;
  /** Mi respuesta a «¿sigue ahí?»: true = sigue, false = ya no está; ausente si no he respondido. */
  presenceVote?: boolean;
}

export interface IncidentRow {
  id: string;
  category: string;
  grid_x: number;
  grid_y: number;
  description: string;
  created_at: Date;
  confirmations_count: number;
  flags_count: number;
  status: string;
  device_hash: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}
