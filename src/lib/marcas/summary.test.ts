import { describe, expect, it } from 'vitest';
import { dueSoon, taskTotals } from './summary';
import type { MarcasTask } from './types';

const NOW = new Date(2026, 10, 15, 12, 0); // Sun 15 Nov 2026, local

function task(partial: Partial<MarcasTask>): MarcasTask {
  return {
    id: Math.random().toString(36).slice(2),
    brand_id: 'krema',
    title: 'x',
    status: 'hacer',
    assignee_id: null,
    due_date: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    done_at: null,
    ...partial,
  };
}

const TASKS = [
  task({ status: 'hacer', due_date: '2026-11-10', assignee_id: 'a' }), // overdue
  task({ status: 'curso', due_date: '2026-11-18', assignee_id: 'a' }), // due this week
  task({ status: 'cliente', brand_id: 'rodimar' }),
  task({ status: 'hecho', done_at: '2026-11-14T10:00:00Z', assignee_id: 't', brand_id: 'rodimar' }),
  task({ status: 'hecho', done_at: '2026-10-01T10:00:00Z' }), // too old to count
  task({ status: 'hacer', due_date: '2026-12-30' }), // far away
];

describe('taskTotals', () => {
  it('counts open, overdue, waiting and recently done', () => {
    expect(taskTotals(TASKS, NOW)).toEqual({ open: 4, overdue: 1, waitingClient: 1, doneLast7: 1 });
  });
});

describe('dueSoon', () => {
  it('lists overdue and next-7-days open tasks by date', () => {
    expect(dueSoon(TASKS, NOW).map((t) => t.due_date)).toEqual(['2026-11-10', '2026-11-18']);
  });
});
