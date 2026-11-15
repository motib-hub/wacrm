import { describe, expect, it } from 'vitest';
import { hubGroups, isHubLinkActive, parseCollapsed } from './nav';

describe('hubGroups', () => {
  it('gives admins Marcas then the CRM, the team only Marcas, and clients no hub', () => {
    expect(hubGroups('admin', ['m'], ['c'])).toEqual([
      { key: 'marcas', items: ['m'] },
      { key: 'crm', items: ['c'] },
    ]);
    expect(hubGroups('equipo', ['m'], ['c'])).toEqual([{ key: 'marcas', items: ['m'] }]);
    expect(hubGroups(null, ['m'], ['c'])).toEqual([]);
  });
});

describe('isHubLinkActive', () => {
  const marcas = ['/marcas', '/marcas/tareas'];

  it('prefers the closest sibling', () => {
    expect(isHubLinkActive('/marcas/tareas', '/marcas/tareas', marcas)).toBe(true);
    expect(isHubLinkActive('/marcas', '/marcas/tareas', marcas)).toBe(false);
  });

  it('keeps brand pages under Clientes', () => {
    expect(isHubLinkActive('/marcas', '/marcas', marcas)).toBe(true);
    expect(isHubLinkActive('/marcas', '/marcas/rodimar', marcas)).toBe(true);
    expect(isHubLinkActive('/marcas/tareas', '/marcas/rodimar', marcas)).toBe(false);
  });

  it('matches /dashboard exactly and other sections by prefix', () => {
    const crm = ['/dashboard', '/inbox'];
    expect(isHubLinkActive('/dashboard', '/dashboard', crm)).toBe(true);
    expect(isHubLinkActive('/dashboard', '/dashboard/x', crm)).toBe(false);
    expect(isHubLinkActive('/inbox', '/inbox/123', crm)).toBe(true);
    expect(isHubLinkActive('/inbox', '/inboxes', crm)).toBe(false);
  });
});

describe('parseCollapsed', () => {
  it('reads known keys and ignores junk', () => {
    expect([...parseCollapsed('["crm","nope"]')]).toEqual(['crm']);
    expect(parseCollapsed('{').size).toBe(0);
    expect(parseCollapsed(null).size).toBe(0);
    expect(parseCollapsed('"crm"').size).toBe(0);
  });
});
