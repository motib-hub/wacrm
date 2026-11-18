/**
 * The pages of the Marcas module, in menu order. One list feeds both the
 * hub sidebar and the tabs on top of every Marcas page, so the two can
 * never disagree. Labels live under `Hub.marcas.<key>`.
 */
export const MARCAS_SECTIONS = [
  { key: 'summary', href: '/marcas/resumen' },
  { key: 'clients', href: '/marcas' },
  { key: 'tasks', href: '/marcas/tareas' },
  { key: 'content', href: '/marcas/contenido' },
] as const;

export type MarcasSectionKey = (typeof MARCAS_SECTIONS)[number]['key'];

export const MARCAS_SECTION_HREFS: readonly string[] = MARCAS_SECTIONS.map((s) => s.href);
