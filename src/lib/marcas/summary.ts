import { isOverdue, localIsoDate } from './board';
import type { MarcasBrand, MarcasMember, MarcasTask } from './types';

/**
 * Numbers for the Marcas summary page (pure; summary.test.ts). Everything
 * is computed from the tasks the caller can already see, so RLS decides
 * what counts — an `equipo` member's summary covers their brands only.
 */

const DAY_MS = 86_400_000;

function addDays(now: Date, days: number): string {
  return localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

function doneWithin(task: MarcasTask, days: number, now: Date): boolean {
  if (task.status !== 'hecho') return false;
  const at = Date.parse(task.done_at ?? task.updated_at);
  return Number.isFinite(at) && now.getTime() - at <= days * DAY_MS;
}

export interface TaskTotals {
  open: number;
  overdue: number;
  waitingClient: number;
  doneLast7: number;
}

export function taskTotals(tasks: MarcasTask[], now: Date = new Date()): TaskTotals {
  let open = 0;
  let overdue = 0;
  let waitingClient = 0;
  let doneLast7 = 0;
  for (const task of tasks) {
    if (task.status === 'hecho') {
      if (doneWithin(task, 7, now)) doneLast7++;
      continue;
    }
    open++;
    if (task.status === 'cliente') waitingClient++;
    if (isOverdue(task, now)) overdue++;
  }
  return { open, overdue, waitingClient, doneLast7 };
}

/**
 * Open tasks that need attention this week: overdue ones first, then
 * those due in the next 7 days, by date.
 */
export function dueSoon(tasks: MarcasTask[], now: Date = new Date()): MarcasTask[] {
  const limit = addDays(now, 7);
  return tasks
    .filter((t) => t.status !== 'hecho' && t.due_date !== null && t.due_date <= limit)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
}

export interface BrandRow {
  brand: MarcasBrand;
  hacer: number;
  curso: number;
  cliente: number;
  overdue: number;
  doneLast7: number;
  nextDue: string | null;
}

export function brandRows(brands: MarcasBrand[], tasks: MarcasTask[], now: Date = new Date()): BrandRow[] {
  const rows = new Map<string, BrandRow>(
    brands.map((b) => [b.id, { brand: b, hacer: 0, curso: 0, cliente: 0, overdue: 0, doneLast7: 0, nextDue: null }]),
  );
  for (const task of tasks) {
    const row = rows.get(task.brand_id);
    if (!row) continue;
    if (task.status === 'hecho') {
      if (doneWithin(task, 7, now)) row.doneLast7++;
      continue;
    }
    row[task.status]++;
    if (isOverdue(task, now)) row.overdue++;
    if (task.due_date && (row.nextDue === null || task.due_date < row.nextDue)) row.nextDue = task.due_date;
  }
  return [...rows.values()];
}

export interface MemberRow {
  /** null = tasks nobody owns yet. */
  member: MarcasMember | null;
  open: number;
  curso: number;
  overdue: number;
  doneLast7: number;
}

/** Workload per teammate, plus an "unassigned" row when there is any. */
export function memberRows(members: MarcasMember[], tasks: MarcasTask[], now: Date = new Date()): MemberRow[] {
  const blank = (member: MarcasMember | null): MemberRow => ({ member, open: 0, curso: 0, overdue: 0, doneLast7: 0 });
  const rows = new Map<string | null, MemberRow>(members.map((m) => [m.user_id, blank(m)]));
  for (const task of tasks) {
    const key = task.assignee_id && rows.has(task.assignee_id) ? task.assignee_id : null;
    if (!rows.has(key)) rows.set(key, blank(null));
    const row = rows.get(key)!;
    if (task.status === 'hecho') {
      if (doneWithin(task, 7, now)) row.doneLast7++;
      continue;
    }
    row.open++;
    if (task.status === 'curso') row.curso++;
    if (isOverdue(task, now)) row.overdue++;
  }
  const unassigned = rows.get(null);
  return [
    ...members.map((m) => rows.get(m.user_id)!),
    ...(unassigned && (unassigned.open > 0 || unassigned.doneLast7 > 0) ? [unassigned] : []),
  ];
}
