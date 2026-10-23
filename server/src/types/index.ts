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
