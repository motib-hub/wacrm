/**
 * Marcas — the agency workspace (fork-only, migration 059_motib_marcas).
 *
 * Row shapes mirror the tables one-to-one. Kept apart from
 * `src/types/index.ts` (upstream's) so the module never conflicts with an
 * upstream sync.
 */

export type MarcasRole = 'admin' | 'equipo';

export interface MarcasMember {
  user_id: string;
  role: MarcasRole;
  display_name: string;
}

export interface MarcasBrand {
  id: string;
  name: string;
  color: string;
  tagline: string | null;
  contact_name: string | null;
  team_visible: boolean;
  sheet_url: string | null;
  drive_url: string | null;
  notes: string | null;
  sort_order: number;
}

/** Board columns, in display order. */
export const TASK_STATUSES = ['hacer', 'curso', 'cliente', 'hecho'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface MarcasTask {
  id: string;
  brand_id: string;
  title: string;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export type NewMarcasTask = Pick<MarcasTask, 'brand_id' | 'title'> &
  Partial<Pick<MarcasTask, 'status' | 'assignee_id' | 'due_date'>>;

export type MarcasTaskPatch = Partial<
  Pick<MarcasTask, 'title' | 'status' | 'assignee_id' | 'due_date' | 'brand_id'>
>;
