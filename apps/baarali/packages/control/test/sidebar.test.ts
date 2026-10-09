import { describe, expect, it } from 'vitest';
import { checkSidebarLayout, DEFAULT_SIDEBAR_LAYOUT, describeSidebarLayout } from '../src/sidebar.js';

// What the console may publish as the app's sidebar (09/10/2026).

const entries = () => structuredClone(DEFAULT_SIDEBAR_LAYOUT.entries);

describe('checkSidebarLayout', () => {
  it('takes the order, names and hidden pages, and drops a name equal to the page’s own', () => {
    const e = entries();
    e[2] = { id: 'code', label: 'Atelier' };
    e[1] = { id: 'coworkers', label: 'Coéquipiers' };
    e[10] = { id: 'prompts', hidden: true };
    const r = checkSidebarLayout({ entries: e });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.entries[1]).toEqual({ id: 'coworkers' });
    expect(r.layout.entries[2]).toEqual({ id: 'code', label: 'Atelier' });
    expect(r.layout.entries[10]).toEqual({ id: 'prompts', hidden: true });
    expect(describeSidebarLayout(r.layout)).toBe('barre publiée : Chat, Coéquipiers, Atelier, Espaces d’équipe, E-mail, Réunions, Tâches, Routines, Apps, Bibliothèque ; masquées : Prompts');
  });

  it('refuses a missing or doubled page, Chat moved or hidden, too many separators, junk', () => {
    expect(checkSidebarLayout({ entries: entries().filter((x) => x.id !== 'email') })).toMatchObject({ ok: false });
    expect(checkSidebarLayout({ entries: [...entries(), { id: 'email' }] })).toMatchObject({ ok: false });
    const moved = entries();
    [moved[0], moved[1]] = [moved[1], moved[0]];
    expect(checkSidebarLayout({ entries: moved })).toMatchObject({ ok: false, message: 'Chat reste en tête, visible' });
    expect(checkSidebarLayout({ entries: [{ id: 'chat', hidden: true }, ...entries().slice(1)] })).toMatchObject({ ok: false });
    expect(checkSidebarLayout({ entries: [...entries(), ...Array.from({ length: 6 }, () => ({ id: 'separator' as const }))] })).toMatchObject({ ok: false });
    expect(checkSidebarLayout({ entries: [{ id: 'chat', label: 'x'.repeat(33) }, ...entries().slice(1)] })).toMatchObject({ ok: false });
    expect(checkSidebarLayout('n’importe quoi')).toMatchObject({ ok: false });
  });
});
