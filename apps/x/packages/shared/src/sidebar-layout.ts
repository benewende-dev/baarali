import { z } from 'zod';

// Baarali (09/10/2026): the pages of the app's sidebar as data, in the order
// the founder validated. The admin console publishes a layout (order, names,
// hidden pages) that every app follows; without one, or offline, the app
// keeps DEFAULT_SIDEBAR_LAYOUT. Chat always leads; the chats list stays at
// the bottom, outside the layout.

export const SIDEBAR_PAGES = [
  'chat', 'coworkers', 'code', 'spaces', 'email', 'meetings', 'todo', 'routines', 'apps', 'prompts', 'library',
] as const;
export type SidebarPage = (typeof SIDEBAR_PAGES)[number];

/** A separator moves like a page; several may be placed. */
export const SIDEBAR_SEPARATOR = 'separator' as const;

export const SidebarEntrySchema = z.object({
  id: z.union([z.enum(SIDEBAR_PAGES), z.literal(SIDEBAR_SEPARATOR)]),
  /** Shown instead of the page's own name; null keeps it. */
  label: z.string().trim().min(1).max(32).nullable().optional(),
  hidden: z.boolean().optional(),
});
export type SidebarEntry = z.infer<typeof SidebarEntrySchema>;

export const SidebarLayoutSchema = z.object({ entries: z.array(SidebarEntrySchema).max(40) });
export type SidebarLayout = z.infer<typeof SidebarLayoutSchema>;

/** Code above the team spaces, which fold; then the rest (validated 09/10/2026). */
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  entries: [
    { id: 'chat' },
    { id: 'coworkers' },
    { id: 'code' },
    { id: 'spaces' },
    { id: 'separator' },
    { id: 'email' },
    { id: 'meetings' },
    { id: 'todo' },
    { id: 'routines' },
    { id: 'apps' },
    { id: 'prompts' },
    { id: 'library' },
  ],
};

/** One row the sidebar draws: a page with its custom name, if any, or a separator. */
export type SidebarRow = { id: SidebarPage; label: string | null } | { id: typeof SIDEBAR_SEPARATOR };

/**
 * The rows to draw from a published layout. Unknown or repeated pages are
 * dropped; a page the layout does not name yet (one added after it was
 * published) takes its place from the default order; Chat leads whatever
 * the layout says; hidden pages and doubled, leading or trailing separators
 * go.
 */
export function sidebarRows(published: SidebarLayout | null | undefined): SidebarRow[] {
  const parsed = published ? SidebarLayoutSchema.safeParse(published) : null;
  const entries = parsed?.success ? parsed.data.entries : DEFAULT_SIDEBAR_LAYOUT.entries;
  const seen = new Set<string>();
  const out: SidebarEntry[] = [];
  for (const e of entries) {
    if (e.id !== SIDEBAR_SEPARATOR && seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  // Pages the layout misses go after the page that precedes them by default.
  const defaults = DEFAULT_SIDEBAR_LAYOUT.entries.map((e) => e.id).filter((id): id is SidebarPage => id !== SIDEBAR_SEPARATOR);
  defaults.forEach((id, i) => {
    if (seen.has(id)) return;
    const before = defaults.slice(0, i).reverse().find((d) => seen.has(d));
    const at = before ? out.findIndex((e) => e.id === before) + 1 : 0;
    out.splice(at, 0, { id });
    seen.add(id);
  });
  const chat = out.findIndex((e) => e.id === 'chat');
  const [lead] = out.splice(chat, 1);
  out.unshift({ ...lead, hidden: false });

  const rows: SidebarRow[] = [];
  for (const e of out) {
    if (e.id === SIDEBAR_SEPARATOR) {
      if (rows.length && rows[rows.length - 1].id !== SIDEBAR_SEPARATOR) rows.push({ id: SIDEBAR_SEPARATOR });
      continue;
    }
    if (e.hidden) continue;
    rows.push({ id: e.id, label: e.label ?? null });
  }
  while (rows.length && rows[rows.length - 1].id === SIDEBAR_SEPARATOR) rows.pop();
  return rows;
}
