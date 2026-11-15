import {
  TASK_STATUSES,
  type MarcasRole,
  type MarcasTask,
  type TaskStatus,
} from './types';

/**
 * Pure board logic for Marcas. No I/O, so it is unit-tested directly
 * (board.test.ts) and shared by the overview and the brand page.
 */

/**
 * How long a finished task stays on the board. The "Hecho" column is
 * proof of progress for the week, not an archive: older items would
 * bury the recent ones within a month of real use.
 */
export const DONE_VISIBLE_DAYS = 14;

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Tasks grouped by column, each column ordered for scanning:
 * dated tasks first by due date, then undated by newest; "hecho" by most
 * recently finished, trimmed to the last DONE_VISIBLE_DAYS.
 */
export function groupTasksByStatus(
  tasks: MarcasTask[],
  now: Date = new Date(),
): Record<TaskStatus, MarcasTask[]> {
  const cutoff = now.getTime() - DONE_VISIBLE_DAYS * 86_400_000;
  const groups = Object.fromEntries(
    TASK_STATUSES.map((s) => [s, [] as MarcasTask[]]),
  ) as Record<TaskStatus, MarcasTask[]>;

  for (const task of tasks) {
    if (task.status === 'hecho') {
      const finished = Date.parse(task.done_at ?? task.updated_at);
      if (Number.isFinite(finished) && finished < cutoff) continue;
    }
    groups[task.status]?.push(task);
  }

  for (const status of TASK_STATUSES) {
    groups[status].sort(status === 'hecho' ? byMostRecentlyDone : byDueThenNewest);
  }
  return groups;
}

function byDueThenNewest(a: MarcasTask, b: MarcasTask): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

function byMostRecentlyDone(a: MarcasTask, b: MarcasTask): number {
  return (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at);
}

/** Open (not done) task count per brand, for the brand cards. */
export function openTaskCounts(tasks: MarcasTask[]): Map<string, Record<Exclude<TaskStatus, 'hecho'>, number>> {
  const counts = new Map<string, Record<Exclude<TaskStatus, 'hecho'>, number>>();
  for (const task of tasks) {
    if (task.status === 'hecho') continue;
    const row = counts.get(task.brand_id) ?? { hacer: 0, curso: 0, cliente: 0 };
    row[task.status] += 1;
    counts.set(task.brand_id, row);
  }
  return counts;
}

/** True when an open task's due date is before today (local date). */
export function isOverdue(task: Pick<MarcasTask, 'status' | 'due_date'>, now: Date = new Date()): boolean {
  if (!task.due_date || task.status === 'hecho') return false;
  return task.due_date < localIsoDate(now);
}

export function localIsoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Which part of the app a Marcas role may use. `equipo` members work
 * brands only: the CRM gives them a personal account of their own, but
 * none of its WhatsApp surfaces are theirs to use.
 */
export function isPathAllowedForRole(pathname: string, role: MarcasRole | null): boolean {
  if (role !== 'equipo') return true;
  return (
    pathname === '/marcas' ||
    pathname.startsWith('/marcas/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/')
  );
}
