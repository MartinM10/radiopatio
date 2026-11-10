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
  /** Cuánto dura el aviso si nadie lo amplía ni lo cierra (espejo de server/src/routes/categories.ts). */
  ttlHours: number;
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
  hasPhoto?: boolean;
  /** Cuándo desaparece (ms). Se amplía con «sigue ahí» y se acorta al resolverse. */
  expiresAt?: number;
  /** El autor o los vecinos lo han dado por resuelto: desaparece en pocas horas. */
  resolved?: boolean;
  /** Mi respuesta a «¿sigue ahí?»: true = sigue, false = ya no está; ausente si no he respondido. */
  presenceVote?: boolean;
}

/** Mensaje del chat anónimo de un aviso: nadie ve quién escribe, solo si es propio. */
export interface IncidentMessage {
  id: number;
  body: string;
  createdAt: number;
  mine: boolean;
  /** Lo escribió quien publicó el aviso. */
  fromAuthor: boolean;
  /** «Vecino N» por orden de primera intervención en este aviso; null si es el autor. */
  participant: number | null;
}

/** Cómo se rotula quién escribe: nadie se identifica, solo su papel en este aviso. */
export const messageAuthorLabel = (m: Pick<IncidentMessage, 'mine' | 'fromAuthor' | 'participant'>): string =>
  m.mine ? 'Tú' : m.fromAuthor ? 'Autor del aviso' : `Vecino ${m.participant ?? ''}`.trim();
