import { describe, expect, it } from 'vitest';
import { DEFAULT_SIDEBAR_LAYOUT, sidebarRows, type SidebarLayout } from './sidebar-layout.js';

const ids = (layout: SidebarLayout | null) => sidebarRows(layout).map((r) => r.id);

describe('sidebarRows', () => {
  it('draws the validated order without a published layout', () => {
    expect(ids(null)).toEqual(['chat', 'coworkers', 'code', 'spaces', 'separator', 'email', 'meetings', 'todo', 'routines', 'apps', 'prompts', 'library']);
    expect(sidebarRows(DEFAULT_SIDEBAR_LAYOUT)[1]).toEqual({ id: 'coworkers', label: null });
  });

  it('follows the order, names and hidden pages the admin published', () => {
    const rows = sidebarRows({ entries: [
      { id: 'code', label: 'Atelier' }, { id: 'chat' }, { id: 'library' }, { id: 'separator' },
      { id: 'prompts', hidden: true }, { id: 'separator' }, { id: 'email' },
    ] });
    expect(rows[0]).toEqual({ id: 'chat', label: null });
    expect(rows[1]).toEqual({ id: 'code', label: 'Atelier' });
    // Spaces and Coworkers, not named, follow their default neighbours; Prompts
    // hidden, its two separators fold into one.
    expect(rows.map((r) => r.id)).toEqual(['chat', 'code', 'spaces', 'coworkers', 'library', 'separator', 'email', 'meetings', 'todo', 'routines', 'apps']);
    expect(rows.some((r) => r.id === 'prompts')).toBe(false);
  });

  it('places a page the layout does not know yet after its default neighbour', () => {
    const rows = ids({ entries: [{ id: 'chat' }, { id: 'email' }, { id: 'apps' }] });
    // coworkers, code, spaces follow chat; meetings, todo, routines follow email; prompts, library follow apps.
    expect(rows).toEqual(['chat', 'coworkers', 'code', 'spaces', 'email', 'meetings', 'todo', 'routines', 'apps', 'prompts', 'library']);
  });

  it('ignores what it cannot trust: repeats, unknown pages, a hidden Chat', () => {
    expect(ids({ entries: [{ id: 'chat', hidden: true }, { id: 'email' }, { id: 'email' }] }).filter((id) => id === 'email')).toHaveLength(1);
    expect(ids({ entries: [{ id: 'chat', hidden: true }] })[0]).toBe('chat');
    expect(ids({ entries: [{ id: 'nope' }] } as unknown as SidebarLayout)).toEqual(ids(null));
  });
});
