import { describe, expect, it } from 'vitest';
import {
  DONE_VISIBLE_DAYS,
  groupTasksByStatus,
  isOverdue,
  isPathAllowedForRole,
  isTaskStatus,
  openTaskCounts,
} from './board';
import type { MarcasTask } from './types';

const NOW = new Date('2026-11-15T12:00:00');

function task(overrides: Partial<MarcasTask>): MarcasTask {
  return {
    id: overrides.id ?? 't',
    brand_id: 'rodimar',
    title: 'x',
    status: 'hacer',
    assignee_id: null,
    due_date: null,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    done_at: null,
    ...overrides,
  };
}

describe('groupTasksByStatus', () => {
  it('puts every task in its column', () => {
    const g = groupTasksByStatus(
      [task({ id: 'a' }), task({ id: 'b', status: 'cliente' }), task({ id: 'c', status: 'curso' })],
      NOW,
    );
    expect(g.hacer.map((t) => t.id)).toEqual(['a']);
    expect(g.cliente.map((t) => t.id)).toEqual(['b']);
    expect(g.curso.map((t) => t.id)).toEqual(['c']);
    expect(g.hecho).toEqual([]);
  });

  it('orders open tasks by due date first, then newest undated', () => {
    const g = groupTasksByStatus(
      [
        task({ id: 'old', created_at: '2026-11-01T00:00:00Z' }),
        task({ id: 'late', due_date: '2026-11-30' }),
        task({ id: 'soon', due_date: '2026-11-16' }),
        task({ id: 'new', created_at: '2026-11-14T00:00:00Z' }),
      ],
      NOW,
    );
    expect(g.hacer.map((t) => t.id)).toEqual(['soon', 'late', 'new', 'old']);
  });

  it(`keeps only the last ${DONE_VISIBLE_DAYS} days of done tasks, newest first`, () => {
    const g = groupTasksByStatus(
      [
        task({ id: 'recent', status: 'hecho', done_at: '2026-11-14T09:00:00Z' }),
        task({ id: 'older', status: 'hecho', done_at: '2026-11-05T09:00:00Z' }),
        task({ id: 'stale', status: 'hecho', done_at: '2026-10-01T09:00:00Z' }),
      ],
      NOW,
    );
    expect(g.hecho.map((t) => t.id)).toEqual(['recent', 'older']);
  });
});

describe('openTaskCounts', () => {
  it('counts open tasks per brand and status, ignoring done', () => {
    const counts = openTaskCounts([
      task({ brand_id: 'krema' }),
      task({ brand_id: 'krema', status: 'cliente' }),
      task({ brand_id: 'krema', status: 'hecho' }),
      task({ brand_id: 'fdv', status: 'curso' }),
    ]);
    expect(counts.get('krema')).toEqual({ hacer: 1, curso: 0, cliente: 1 });
    expect(counts.get('fdv')).toEqual({ hacer: 0, curso: 1, cliente: 0 });
  });
});

describe('isOverdue', () => {
  it('flags open tasks due before today only', () => {
    expect(isOverdue({ status: 'hacer', due_date: '2026-11-14' }, NOW)).toBe(true);
    expect(isOverdue({ status: 'hacer', due_date: '2026-11-15' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'hecho', due_date: '2026-11-01' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'hacer', due_date: null }, NOW)).toBe(false);
  });
});

describe('isPathAllowedForRole', () => {
  it('confines equipo members to Marcas and their own settings', () => {
    expect(isPathAllowedForRole('/marcas', 'equipo')).toBe(true);
    expect(isPathAllowedForRole('/marcas/krema', 'equipo')).toBe(true);
    expect(isPathAllowedForRole('/settings', 'equipo')).toBe(true);
    expect(isPathAllowedForRole('/inbox', 'equipo')).toBe(false);
    expect(isPathAllowedForRole('/marcasx', 'equipo')).toBe(false);
  });

  it('leaves admins and non-members alone', () => {
    expect(isPathAllowedForRole('/inbox', 'admin')).toBe(true);
    expect(isPathAllowedForRole('/inbox', null)).toBe(true);
  });
});

describe('isTaskStatus', () => {
  it('accepts only board columns', () => {
    expect(isTaskStatus('cliente')).toBe(true);
    expect(isTaskStatus('done')).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });
});
