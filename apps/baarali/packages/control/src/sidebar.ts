import { DEFAULT_SIDEBAR_LAYOUT, SIDEBAR_PAGES, SidebarLayoutSchema, type SidebarLayout, type SidebarPage } from '@x/shared/dist/sidebar-layout.js';

// The app's sidebar, as the admin console publishes it (09/10/2026, mockup
// validated by the founder): the order of the pages, their names, the hidden
// ones. Every app reads it on GET /v1/sidebar at start and every 10 minutes;
// without one it keeps @x/shared DEFAULT_SIDEBAR_LAYOUT.

export { DEFAULT_SIDEBAR_LAYOUT };

/** Each page's own name, as the app shows it in French. */
export const SIDEBAR_PAGE_NAMES: Record<SidebarPage, string> = {
  chat: 'Chat',
  coworkers: 'Employés',
  code: 'Code',
  spaces: 'Espaces d’équipe',
  email: 'E-mail',
  meetings: 'Réunions',
  todo: 'Tâches',
  routines: 'Routines',
  apps: 'Apps',
  prompts: 'Prompts',
  library: 'Bibliothèque',
};

const MAX_SEPARATORS = 6;

/**
 * A layout from the console, checked: every page once, Chat first and shown,
 * a few separators. A name equal to the page's own is dropped, so the page
 * keeps its translation in every language.
 */
export function checkSidebarLayout(input: unknown): { ok: true; layout: SidebarLayout } | { ok: false; message: string } {
  const parsed = SidebarLayoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Mise en page illisible' };
  const entries = parsed.data.entries;
  const pages = entries.filter((e) => e.id !== 'separator').map((e) => e.id);
  if (pages.length !== SIDEBAR_PAGES.length || new Set(pages).size !== pages.length) {
    return { ok: false, message: 'Chaque page doit apparaître une fois' };
  }
  if (entries[0]?.id !== 'chat' || entries[0].hidden) return { ok: false, message: 'Chat reste en tête, visible' };
  if (entries.length - pages.length > MAX_SEPARATORS) return { ok: false, message: `${MAX_SEPARATORS} séparateurs au plus` };
  return {
    ok: true,
    layout: {
      entries: entries.map((e) => {
        if (e.id === 'separator') return { id: e.id };
        const label = e.label && e.label !== SIDEBAR_PAGE_NAMES[e.id] ? e.label : null;
        return { id: e.id, ...(label ? { label } : {}), ...(e.hidden ? { hidden: true } : {}) };
      }),
    },
  };
}

/** For the journal: what changed, in words. */
export function describeSidebarLayout(layout: SidebarLayout | null): string {
  if (!layout) return 'barre remise à l’ordre d’origine';
  const shown = layout.entries.filter((e) => e.id !== 'separator' && !e.hidden).map((e) => (e.id === 'separator' ? '' : e.label ?? SIDEBAR_PAGE_NAMES[e.id]));
  const hidden = layout.entries.filter((e) => e.id !== 'separator' && e.hidden).map((e) => (e.id === 'separator' ? '' : SIDEBAR_PAGE_NAMES[e.id]));
  return `barre publiée : ${shown.join(', ')}${hidden.length ? ` ; masquées : ${hidden.join(', ')}` : ''}`;
}
