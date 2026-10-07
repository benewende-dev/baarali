import { describe, expect, it } from 'vitest';
import { bannerFor, parseDraft, publicBanner, type Announcement } from '../src/announcements.js';
import type { Plan } from '../src/store.js';

// The banner's rules (07/10/2026): what the console may publish, and which
// one each account sees.

const NOW = Date.UTC(2026, 9, 7, 10, 0, 0);
const DAY = 86_400_000;
const FREE: Plan = { id: 'decouverte', category: 'free', displayName: 'Découverte', weekCredits: 1, monthlyPrices: [], models: null };
const PRO: Plan = { id: 'pro-100', category: 'pro', displayName: 'Pro', weekCredits: 1, monthlyPrices: [], models: null };

const ann = (over: Partial<Announcement>): Announcement => ({
  id: 'ann_1', text: 'Nouveau', button: null, target: 'none', link: null, audience: 'all', tone: 'info',
  startsAt: NOW - DAY, endsAt: NOW + DAY, createdAt: NOW - DAY, createdBy: 'a@x', removedAt: null, ...over,
});

describe('parseDraft', () => {
  it('takes a plain banner, starting now', () => {
    const r = parseDraft({ text: '  Parle   à Baarali ', endsAt: NOW + 3 * DAY }, NOW);
    expect(r).toEqual({ ok: true, draft: { text: 'Parle à Baarali', button: null, target: 'none', link: null, audience: 'all', tone: 'info', startsAt: NOW, endsAt: NOW + 3 * DAY } });
  });

  it('wants words on a button that leads somewhere, and nowhere for a button-less banner', () => {
    expect(parseDraft({ text: 'x', target: 'plans', endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    const r = parseDraft({ text: 'x', target: 'none', button: 'Voir', endsAt: NOW + DAY }, NOW);
    expect(r.ok && r.draft.button).toBeNull();
  });

  it('opens only https pages', () => {
    expect(parseDraft({ text: 'x', target: 'link', button: 'Lire', link: 'javascript:alert(1)', endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', target: 'link', button: 'Lire', link: 'http://baarali.com', endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    const r = parseDraft({ text: 'x', target: 'link', button: 'Lire', link: 'https://baarali.com/tarifs', endsAt: NOW + DAY }, NOW);
    expect(r.ok && r.draft.link).toBe('https://baarali.com/tarifs');
  });

  it('refuses a banner too long, unknown values, and dates that make no sense', () => {
    expect(parseDraft({ text: 'x'.repeat(161), endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', audience: 'vip', endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', tone: 'rouge', endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x' }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', endsAt: NOW - 1 }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', startsAt: NOW + 2 * DAY, endsAt: NOW + DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', endsAt: NOW + 61 * DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseDraft({ text: 'x', endsAt: 'demain' }, NOW)).toMatchObject({ ok: false });
  });
});

describe('bannerFor', () => {
  const never = () => false;

  it('shows the newest live one', () => {
    const list = [ann({ id: 'old', createdAt: NOW - 2 * DAY }), ann({ id: 'new', createdAt: NOW - DAY })];
    expect(bannerFor(list, FREE, never, NOW)?.id).toBe('new');
  });

  it('hides one withdrawn, not started or over', () => {
    expect(bannerFor([ann({ removedAt: NOW - 1 })], FREE, never, NOW)).toBeNull();
    expect(bannerFor([ann({ startsAt: NOW + 1 })], FREE, never, NOW)).toBeNull();
    expect(bannerFor([ann({ endsAt: NOW })], FREE, never, NOW)).toBeNull();
  });

  it('reaches the plans it is meant for', () => {
    const free = ann({ audience: 'free' });
    const paid = ann({ audience: 'paid' });
    expect(bannerFor([free], FREE, never, NOW)).not.toBeNull();
    expect(bannerFor([free], PRO, never, NOW)).toBeNull();
    expect(bannerFor([paid], PRO, never, NOW)).not.toBeNull();
    expect(bannerFor([paid], FREE, never, NOW)).toBeNull();
    // An account without a known plan is treated as free.
    expect(bannerFor([paid], null, never, NOW)).toBeNull();
  });

  it('stays closed once the person closed it', () => {
    expect(bannerFor([ann({})], FREE, (id) => id === 'ann_1', NOW)).toBeNull();
  });
});

it('tells an app nothing of the console', () => {
  expect(Object.keys(publicBanner(ann({})))).toEqual(['id', 'text', 'button', 'target', 'link', 'tone', 'endsAt']);
});
