import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MarcasBrand,
  MarcasMember,
  MarcasTask,
  MarcasTaskPatch,
  NewMarcasTask,
} from './types';

/**
 * Data access for Marcas. Every call goes through the signed-in user's
 * browser client, so row level security (059_motib_marcas) is the
 * access control — these functions never filter by role themselves.
 * Errors are thrown; pages turn them into a toast.
 */

const BRAND_COLUMNS =
  'id, name, color, tagline, contact_name, team_visible, sheet_url, drive_url, notes, sort_order';
const TASK_COLUMNS =
  'id, brand_id, title, status, assignee_id, due_date, created_at, updated_at, done_at';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** The caller's own membership, or null when they are not on the team. */
export async function fetchOwnMembership(
  db: SupabaseClient,
  userId: string,
): Promise<MarcasMember | null> {
  const result = await db
    .from('marcas_members')
    .select('user_id, role, display_name')
    .eq('user_id', userId)
    .limit(1);
  // A missing table (migration not applied yet) reads as "not a member":
  // the CRM must keep working for everyone before Marcas is switched on.
  if (result.error) return null;
  return (result.data?.[0] as MarcasMember | undefined) ?? null;
}

export async function fetchMembers(db: SupabaseClient): Promise<MarcasMember[]> {
  return unwrap(
    await db.from('marcas_members').select('user_id, role, display_name').order('display_name'),
  ) as MarcasMember[];
}

export async function fetchBrands(db: SupabaseClient): Promise<MarcasBrand[]> {
  return unwrap(
    await db.from('marcas_brands').select(BRAND_COLUMNS).order('sort_order').order('name'),
  ) as MarcasBrand[];
}

export async function fetchBrand(db: SupabaseClient, id: string): Promise<MarcasBrand | null> {
  const rows = unwrap(
    await db.from('marcas_brands').select(BRAND_COLUMNS).eq('id', id).limit(1),
  ) as MarcasBrand[];
  return rows[0] ?? null;
}

/** Tasks across every visible brand, or one brand's when `brandId` is set. */
export async function fetchTasks(db: SupabaseClient, brandId?: string): Promise<MarcasTask[]> {
  let query = db.from('marcas_tasks').select(TASK_COLUMNS);
  if (brandId) query = query.eq('brand_id', brandId);
  return unwrap(await query.order('created_at', { ascending: false })) as MarcasTask[];
}

export async function createTask(db: SupabaseClient, task: NewMarcasTask): Promise<MarcasTask> {
  const rows = unwrap(
    await db
      .from('marcas_tasks')
      .insert({ ...task, title: task.title.trim() })
      .select(TASK_COLUMNS),
  ) as MarcasTask[];
  return rows[0];
}

export async function updateTask(
  db: SupabaseClient,
  id: string,
  patch: MarcasTaskPatch,
): Promise<MarcasTask> {
  const clean = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
  const rows = unwrap(
    await db.from('marcas_tasks').update(clean).eq('id', id).select(TASK_COLUMNS),
  ) as MarcasTask[];
  if (!rows[0]) throw new Error('not found');
  return rows[0];
}

export async function deleteTask(db: SupabaseClient, id: string): Promise<void> {
  unwrap(await db.from('marcas_tasks').delete().eq('id', id));
}
