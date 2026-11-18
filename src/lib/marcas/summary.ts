import { isOverdue, localIsoDate } from './board';
import type { MarcasTask } from './types';

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
