import { describe, expect, it } from 'vitest';
import { brandRows, contentBucket, dueSoon, memberRows, taskTotals } from './summary';
import type { MarcasBrand, MarcasMember, MarcasTask } from './types';

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

const brand = (id: string): MarcasBrand => ({
  id,
  name: id,
  color: '#000',
  tagline: null,
  contact_name: null,
  team_visible: true,
  sheet_url: null,
  drive_url: null,
  notes: null,
  sort_order: 0,
});

const tomas: MarcasMember = { user_id: 't', role: 'admin', display_name: 'Tomás' };
const ailen: MarcasMember = { user_id: 'a', role: 'equipo', display_name: 'Ailén' };

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

describe('brandRows', () => {
  it('aggregates per brand with the nearest due date', () => {
    const [krema, rodimar] = brandRows([brand('krema'), brand('rodimar')], TASKS, NOW);
    expect(krema).toMatchObject({ hacer: 2, curso: 1, cliente: 0, overdue: 1, nextDue: '2026-11-10' });
    expect(rodimar).toMatchObject({ cliente: 1, doneLast7: 1, nextDue: null });
  });
});

describe('memberRows', () => {
  it('shows every teammate and an unassigned row only when needed', () => {
    const rows = memberRows([tomas, ailen], TASKS, NOW);
    expect(rows.map((r) => r.member?.display_name ?? null)).toEqual(['Tomás', 'Ailén', null]);
    expect(rows[0]).toMatchObject({ open: 0, doneLast7: 1 });
    expect(rows[1]).toMatchObject({ open: 2, curso: 1, overdue: 1 });
    expect(rows[2]).toMatchObject({ open: 2 });
    expect(memberRows([tomas], [task({ assignee_id: 't' })], NOW)).toHaveLength(1);
  });
});

describe('contentBucket', () => {
  it('maps piece states to done / ready / missing', () => {
    expect(contentBucket('publicada')).toBe('done');
    expect(contentBucket('programada')).toBe('done');
    expect(contentBucket('lista')).toBe('ready');
    expect(contentBucket('sin-pieza')).toBe('missing');
    expect(contentBucket('sin-material')).toBe('missing');
    expect(contentBucket('sin-acceso')).toBeNull();
  });
});
