import { describe, expect, it } from 'vitest';
import { AutoMessages, limitText, mediaLowText, waitWords } from '../src/auto-messages.js';
import { MemoryMailer, NoticeLinks } from '../src/notifications.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';

// The automatic messages: each leaves once per period, only when switched on,
// in the person's inbox (and by email when it says so).

const T0 = Date.UTC(2026, 9, 7, 18, 0, 0);
const HOUR = 3_600_000;
const PLAN: Plan = { id: 'decouverte', category: 'free', displayName: 'Découverte', weekCredits: 1000, monthlyPrices: [], models: null };
const ME: Account = { id: 'acc_me', email: 'me@example.test', planId: 'decouverte', createdAt: T0 - 30 * 24 * HOUR };

function setup(account: Account = ME) {
  const store = new MemoryStore(new Map([[hashToken('tok'), account]]), [PLAN]);
  const mailer = new MemoryMailer();
  let clock = T0;
  const auto = new AutoMessages({ store, now: () => clock, mailer, links: new NoticeLinks('secret', 'https://app.baarali.test') });
  const inbox = async () => (await store.inbox(account.id, 10)).map((x) => x.notice);
  return { store, mailer, auto, inbox, tick: (ms: number) => void (clock += ms) };
}

describe('the words', () => {
  it('says how long the wait is', () => {
    expect(waitWords(40 * 60_000)).toBe('40 min');
    expect(waitWords(30_000)).toBe('1 min');
    expect(waitWords(2 * HOUR + 15 * 60_000)).toBe('2 h 15');
    expect(waitWords(3 * HOUR)).toBe('3 h');
    expect(waitWords(26 * HOUR)).toBe('1 jour');
    expect(waitWords(3 * 24 * HOUR)).toBe('3 jours');
  });

  it('tells a session from a week, and a low balance from an empty one', () => {
    expect(limitText('session', 2 * HOUR).body).toContain('La suivante s’ouvre dans 2 h.');
    expect(limitText('week', 3 * 24 * HOUR).title).toBe('Limite de la semaine atteinte');
    expect(mediaLowText(1).body).toContain('Il vous reste 1 crédit médias');
    expect(mediaLowText(0).title).toBe('Crédits médias épuisés');
  });
});

describe('AutoMessages', () => {
  it('tells a reached limit once per session, in the app only', async () => {
    const { auto, inbox, mailer } = setup();
    expect(await auto.limitReached(ME, 'session', T0 + 2 * HOUR + 15 * 60_000)).toBe(true);
    expect(await auto.limitReached(ME, 'session', T0 + 2 * HOUR + 15 * 60_000)).toBe(false);
    const [n] = await inbox();
    expect(n).toMatchObject({ title: 'Limite de session atteinte', target: 'plans', audience: 'account', accountId: ME.id, createdBy: 'auto:limit', sentAt: T0 });
    expect(n.body).toContain('dans 2 h 15');
    expect(mailer.outbox).toHaveLength(0);
    // The next session is another period.
    expect(await auto.limitReached(ME, 'session', T0 + 7 * HOUR)).toBe(true);
  });

  it('tells low media credits below 20, once a week at most', async () => {
    const { auto, inbox, tick } = setup();
    expect(await auto.mediaSpent(ME, 20)).toBe(false);
    expect(await auto.mediaSpent(ME, 12)).toBe(true);
    expect(await auto.mediaSpent(ME, 4)).toBe(false);
    tick(7 * 24 * HOUR);
    expect(await auto.mediaSpent(ME, 4)).toBe(true);
    expect((await inbox()).map((n) => n.body.slice(0, 22))).toEqual(['Il vous reste 4 crédit', 'Il vous reste 12 crédi']);
  });

  it('sends nothing when switched off, to a suspended account, or by email to one who opted out', async () => {
    const { auto, store, inbox } = setup();
    await auto.set('limit', false);
    expect(await auto.limitReached(ME, 'session', T0 + HOUR)).toBe(false);
    expect(await auto.limitReached({ ...ME, suspendedAt: T0 }, 'week', T0 + HOUR)).toBe(false);
    // The inactive email reaches no one who opted out: nothing is used up either.
    await auto.set('inactive', true);
    await store.setEmailOptOut(ME.id, T0);
    await auto.sweep(true);
    expect(await inbox()).toEqual([]);
    expect(await store.autoMessageCounts()).toEqual({});
  });

  it('welcomes an account made in the last day, and not an older one', async () => {
    const fresh = { ...ME, createdAt: T0 - HOUR };
    const { auto, inbox, mailer } = setup(fresh);
    await auto.sweep(true);
    await auto.sweep(true);
    expect((await inbox()).map((n) => n.title)).toEqual(['Bienvenue sur Baarali']);
    expect(mailer.outbox.map((m) => m.to)).toEqual(['me@example.test']);

    const old = setup();
    await old.auto.sweep(true);
    expect(await old.inbox()).toEqual([]);
  });
});
