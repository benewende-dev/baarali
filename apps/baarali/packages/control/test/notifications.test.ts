import { describe, expect, it } from 'vitest';
import { audienceOf, emailTarget, NoticeLinks, noticeEmail, parseNoticeDraft, ResendMailer, type Notice } from '../src/notifications.js';
import type { AccountSummary, Plan } from '../src/store.js';

// Notifications (07/10/2026): the console's form, who a message reaches,
// and the email each person gets.

const NOW = Date.UTC(2026, 9, 7, 18, 0, 0);
const DAY = 86_400_000;
const FREE: Plan = { id: 'decouverte', category: 'free', displayName: 'Découverte', weekCredits: 1000, monthlyPrices: [], models: null };
const PRO: Plan = { id: 'pro', category: 'pro', displayName: 'Pro', weekCredits: 4000, monthlyPrices: [], models: null };

const person = (id: string, planId: string, over: Partial<AccountSummary> = {}, account: Partial<AccountSummary['account']> = {}): AccountSummary => ({
  account: { id, email: `${id}@x.test`, planId, createdAt: NOW - 30 * DAY, ...account },
  quota: null,
  mediaBalance: 0,
  lastActiveAt: NOW - DAY,
  recentCredits: 0,
  ...over,
});

describe('parseNoticeDraft', () => {
  const base = { title: 'Bonjour', body: 'Un mot.' };

  it('fills what is left out: the app, now, everyone', () => {
    const r = parseNoticeDraft(base, NOW);
    expect(r).toEqual({ ok: true, draft: { title: 'Bonjour', body: 'Un mot.', button: null, target: 'none', link: null, audience: 'all', app: true, email: false, sendAt: NOW, accountEmail: null } });
  });

  it('keeps short paragraphs, and refuses what is too long or empty', () => {
    const r = parseNoticeDraft({ ...base, body: 'Un.\n\n\n\nDeux   mots.' }, NOW);
    expect(r.ok && r.draft.body).toBe('Un.\n\nDeux mots.');
    expect(parseNoticeDraft({ ...base, title: ' ' }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, title: 'x'.repeat(61) }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, body: 'x'.repeat(501) }, NOW)).toMatchObject({ ok: false });
  });

  it('opens https links only, and drops the button without a destination', () => {
    expect(parseNoticeDraft({ ...base, target: 'link', link: 'http://x.test' }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, target: 'link', link: 'https://x.test/a', button: 'Voir' }, NOW)).toMatchObject({ ok: true, draft: { link: 'https://x.test/a', button: 'Voir' } });
    expect(parseNoticeDraft({ ...base, target: 'none', button: 'Voir' }, NOW)).toMatchObject({ ok: true, draft: { button: null } });
    expect(parseNoticeDraft({ ...base, target: 'elsewhere' }, NOW)).toMatchObject({ ok: false });
  });

  it('needs a way to send, an email for one person, and a time ahead within 60 days', () => {
    expect(parseNoticeDraft({ ...base, app: false }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, audience: 'account' }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, audience: 'account', accountEmail: ' Awa@X.test ' }, NOW)).toMatchObject({ ok: true, draft: { accountEmail: 'awa@x.test' } });
    expect(parseNoticeDraft({ ...base, sendAt: NOW - 10 * 60_000 }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, sendAt: NOW + 61 * DAY }, NOW)).toMatchObject({ ok: false });
    expect(parseNoticeDraft({ ...base, sendAt: new Date(NOW + DAY).toISOString() }, NOW)).toMatchObject({ ok: true, draft: { sendAt: NOW + DAY } });
  });
});

describe('audienceOf', () => {
  const list = [
    person('free', 'decouverte'),
    person('paid', 'pro'),
    person('asleep', 'decouverte', { lastActiveAt: NOW - 15 * DAY }),
    person('never', 'pro', { lastActiveAt: null }, { createdAt: NOW - 20 * DAY }),
    person('new', 'pro', { lastActiveAt: null }, { createdAt: NOW - DAY }),
    person('out', 'decouverte', { quota: { sessionStart: NOW - 3_600_000, sessionUsed: 250, weekStart: NOW - DAY, weekUsed: 300 } }),
    person('week', 'pro', { quota: { sessionStart: null, sessionUsed: 0, weekStart: NOW - DAY, weekUsed: 4000 } }),
    person('gone', 'pro', {}, { suspendedAt: NOW - DAY }),
  ];
  const ids = (audience: Notice['audience'], accountId: string | null = null) => audienceOf({ audience, accountId }, list, [FREE, PRO], NOW).map((s) => s.account.id);

  it('never reaches a suspended account', () => {
    expect(ids('all')).not.toContain('gone');
    expect(ids('account', 'gone')).toEqual([]);
  });

  it('splits free and paid, finds the inactive and those out of credits', () => {
    expect(ids('free')).toEqual(['free', 'asleep', 'out']);
    expect(ids('paid')).toEqual(['paid', 'never', 'new', 'week']);
    expect(ids('inactive')).toEqual(['asleep', 'never']);
    expect(ids('limit')).toEqual(['out', 'week']);
    expect(ids('account', 'paid')).toEqual(['paid']);
  });
});

describe('the email', () => {
  const links = new NoticeLinks('secret', 'https://app.test');
  const notice: Notice = {
    id: 'ntf_1', title: 'Promo <b>', body: 'Ligne 1\nLigne 2\n\n"Deux" & <script>', button: 'Voir', target: 'plans', link: null,
    audience: 'all', accountId: null, app: true, email: true, sendAt: NOW, createdAt: NOW, createdBy: 'a', sentAt: null, cancelledAt: null, test: false,
  };

  it('signs its links for one person, and a changed token names no one', () => {
    const token = links.token('ntf_1', 'acc_1');
    expect(links.read(token)).toEqual({ noticeId: 'ntf_1', accountId: 'acc_1' });
    const [payload, mac] = token.split('.');
    const other = links.token('ntf_1', 'acc_2').split('.')[0];
    expect(links.read(`${other}.${mac}`)).toBeNull();
    expect(links.read(`${payload}.`)).toBeNull();
    expect(new NoticeLinks('other', 'https://app.test').read(token)).toBeNull();
  });

  it('escapes the words, and carries the way out', () => {
    const mail = noticeEmail(notice, 'a@x.test', links, 'acc_1');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Ligne 1<br>Ligne 2');
    expect(mail.html).toContain('Ne plus recevoir ces emails');
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/app\.test\/n\/u\//);
    expect(mail.text).toContain('Voir : https://app.test/n/c/');
  });

  it('leads the button to the web page of what it names', () => {
    expect(emailTarget(notice, 'https://app.test', '/tarifs')).toBe('https://app.test/tarifs');
    expect(emailTarget({ target: 'link', link: 'https://x.test/' }, 'https://app.test', '/tarifs')).toBe('https://x.test/');
    expect(emailTarget({ target: 'chat', link: null }, 'https://app.test', '/tarifs')).toBe('https://app.test');
  });

  it('goes out by Resend, 100 per call, and counts only what was accepted', async () => {
    const calls: number[] = [];
    let n = 0;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls.push((JSON.parse(String(init.body)) as unknown[]).length);
      return new Response('{}', { status: n++ === 1 ? 500 : 200 });
    }) as unknown as typeof fetch;
    const mail = noticeEmail(notice, 'a@x.test', links, 'acc_1');
    const { accepted } = await new ResendMailer('k', 'Baarali <b@x.test>', fetchFn).send(Array.from({ length: 230 }, () => mail));
    expect(calls).toEqual([100, 100, 30]);
    // The second batch was refused: its people are not counted as emailed.
    expect(accepted).toHaveLength(130);
    expect(accepted.slice(99, 101)).toEqual([99, 200]);
  });
});
