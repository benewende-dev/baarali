import { describe, expect, it } from 'vitest';
import { AutoMessages } from '../src/auto-messages.js';
import { PartnerProgram } from '../src/partner-program.js';
import {
  addMonths,
  commissionFor,
  cookieDomain,
  DEFAULT_RULES,
  normalizeCode,
  parseRules,
  refCookie,
  refFromCookie,
  tierOf,
  toXof,
  type Partner,
  type Referral,
} from '../src/partners.js';
import { MemoryMailer, NoticeLinks } from '../src/notifications.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';

// The partner programme: who brought whom, the plan offered to them, and
// the share of each payment, paid once.

const T0 = Date.UTC(2026, 9, 7, 18, 0, 0);
const DAY = 86_400_000;
const FREE: Plan = { id: 'decouverte', category: 'free', displayName: 'Découverte', weekCredits: 1000, monthlyPrices: [], models: null };
const ESSENTIEL: Plan = { id: 'essentiel', category: 'starter', displayName: 'Essentiel', weekCredits: 4000, monthlyPrices: [], models: null };
const AWA: Partner = {
  id: 'ptn_awa', name: 'Awa Tech', code: 'AWATECH', network: 'TikTok', city: 'Ouagadougou', accountId: 'acc_awa', status: 'active',
  createdAt: T0 - 30 * DAY, createdBy: 'boss@example.test', payoutMethod: 'orange', payoutNumber: '+226 70 00 00 12',
};
const account = (id: string, over: Partial<Account> = {}): Account => ({ id, email: `${id}@example.test`, planId: 'decouverte', createdAt: T0, ...over });

describe('the rules', () => {
  it('reads a code however it is typed', () => {
    expect(normalizeCode(' awa-tech ')).toBe('AWATECH');
    expect(normalizeCode('Fatoú')).toBe('FATOU');
    expect(normalizeCode('ab')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it('counts payments in CFA francs, euros at the fixed parity', () => {
    expect(toXof(2000, 'EUR')).toBe(13_119);
    expect(toXof(13_119, 'XOF')).toBe(13_119);
    expect(toXof(100, 'USD')).toBeNull();
  });

  it('raises the share with paying clients', () => {
    expect([0, 9, 10, 49, 50].map((n) => tierOf(DEFAULT_RULES, n))).toEqual(['base', 'base', 'silver', 'silver', 'gold']);
  });

  it('pays a share only for an active partner, never on their own payment, for 12 months', () => {
    const referral: Referral = { accountId: 'acc_fan', partnerId: AWA.id, at: T0, via: 'link' };
    const pay = (at: number, accountId = 'acc_fan') => ({ reference: `p_${at}`, accountId, amount: 13_119, currency: 'XOF', at });
    const first = commissionFor(DEFAULT_RULES, AWA, referral, pay(T0 + DAY), { count: 0, includes: false });
    expect(first).toMatchObject({ id: `p_${T0 + DAY}`, rate: 0.2, commissionXof: 2624, payableAt: T0 + 31 * DAY, payoutId: null });
    // The 10th paying client moves every new payment to silver.
    expect(commissionFor(DEFAULT_RULES, AWA, referral, pay(T0 + DAY), { count: 9, includes: false })?.rate).toBe(0.25);
    expect(commissionFor(DEFAULT_RULES, AWA, referral, pay(T0 + DAY), { count: 9, includes: true })?.rate).toBe(0.2);
    expect(commissionFor(DEFAULT_RULES, { ...AWA, status: 'paused' }, referral, pay(T0 + DAY), { count: 0, includes: false })).toBeNull();
    expect(commissionFor(DEFAULT_RULES, AWA, { ...referral, accountId: 'acc_awa' }, pay(T0 + DAY, 'acc_awa'), { count: 0, includes: false })).toBeNull();
    expect(commissionFor(DEFAULT_RULES, AWA, referral, pay(addMonths(T0, 12) - 1), { count: 0, includes: false })).not.toBeNull();
    expect(commissionFor(DEFAULT_RULES, AWA, referral, pay(addMonths(T0, 12)), { count: 0, includes: false })).toBeNull();
  });

  it('refuses a share that would cost more than a client brings, and tiers that go down', () => {
    const form = { basePct: 20, silverPct: 25, silverFrom: 10, goldPct: 30, goldFrom: 50, months: 12, holdDays: 30, payoutMinXof: 10000, giftPlanId: 'essentiel', giftDays: 7, cookieDays: 60 };
    const plans = ['decouverte', 'essentiel'];
    expect(parseRules(form, plans)).toEqual({ ok: true, rules: DEFAULT_RULES });
    expect(parseRules({ ...form, goldPct: 45 }, plans)).toMatchObject({ ok: false, message: expect.stringMatching(/40 % au plus/) });
    expect(parseRules({ ...form, silverPct: 15 }, plans)).toMatchObject({ ok: false });
    expect(parseRules({ ...form, giftPlanId: 'inconnu' }, plans)).toMatchObject({ ok: false });
    expect(parseRules({ ...form, giftPlanId: null }, plans)).toMatchObject({ ok: true, rules: { giftPlanId: null } });
  });

  it('keeps the code on the whole domain: clicked on the site, signed up on the app', () => {
    expect(cookieDomain('https://app.baarali.com')).toBe('baarali.com');
    expect(cookieDomain('http://localhost:8787')).toBeNull();
    const cookie = refCookie('AWATECH', DEFAULT_RULES, 'https://app.baarali.com');
    expect(cookie).toBe('baarali_ref=AWATECH; Max-Age=5184000; Path=/; SameSite=Lax; HttpOnly; Secure; Domain=baarali.com');
    expect(refFromCookie('a=1; baarali_ref=AWATECH; b=2')).toBe('AWATECH');
    expect(refFromCookie('xbaarali_ref=AWATECH')).toBeNull();
    expect(refFromCookie(undefined)).toBeNull();
  });
});

function setup(people: Account[] = [account('acc_fan'), account('acc_awa', { createdAt: T0 - 60 * DAY })]) {
  const store = new MemoryStore(new Map(people.map((a) => [hashToken(`tok-${a.id}`), a])), [FREE, ESSENTIEL]);
  void store.savePartner(AWA);
  let clock = T0;
  const now = () => clock;
  const mailer = new MemoryMailer();
  const auto = new AutoMessages({ store, now, mailer, links: new NoticeLinks('secret', 'https://app.baarali.test') });
  const program = new PartnerProgram({ store, now, auto });
  const plan = async (id: string) => (await store.account(id))?.planId;
  return { store, program, mailer, plan, tick: (ms: number) => void (clock += ms), at: () => clock };
}

describe('PartnerProgram', () => {
  it('gives the person who came the offered plan, once, and counts the click', async () => {
    const { program, store, plan } = setup();
    expect((await program.click('awatech'))?.id).toBe(AWA.id);
    expect(await program.click('NOBODY')).toBeNull();
    const fan = (await store.account('acc_fan'))!;
    const r = await program.attach(fan, 'AWATECH', 'link');
    expect(r).toMatchObject({ ok: true, gift: { planId: 'essentiel', previousPlanId: 'decouverte', endsAt: T0 + 7 * DAY, reason: 'Partenaire AWATECH' } });
    expect(await plan('acc_fan')).toBe('essentiel');
    expect(await program.attach(fan, 'AWATECH', 'code')).toEqual({ ok: false, reason: 'already' });
    expect(await store.partnerFigures()).toEqual({ [AWA.id]: { clicks: 1, signups: 1 } });
  });

  it('refuses the partner’s own code, a paused one, an unknown one, and a code typed too late', async () => {
    const { program, store } = setup();
    expect(await program.attach((await store.account('acc_awa'))!, 'AWATECH', 'code')).toEqual({ ok: false, reason: 'own' });
    expect(await program.attach(account('acc_x'), 'NOPE', 'code')).toEqual({ ok: false, reason: 'unknown' });
    expect(await program.attach(account('acc_x', { createdAt: T0 - 8 * DAY }), 'AWATECH', 'code')).toEqual({ ok: false, reason: 'late' });
    await store.savePartner({ ...AWA, status: 'paused' });
    expect(await program.attach(account('acc_x'), 'AWATECH', 'link')).toEqual({ ok: false, reason: 'paused' });
  });

  it('gives no plan to someone already paying, but still counts them', async () => {
    const { program, plan } = setup([account('acc_fan', { planId: 'essentiel' })]);
    expect(await program.attach(account('acc_fan', { planId: 'essentiel' }), 'AWATECH', 'link')).toMatchObject({ ok: true, gift: null });
    expect(await plan('acc_fan')).toBe('essentiel');
  });

  it('tells the person 3 days before, then gives their plan back', async () => {
    const { program, store, plan, tick, mailer } = setup();
    await program.attach((await store.account('acc_fan'))!, 'AWATECH', 'link');
    tick(3 * DAY);
    await program.sweep(true);
    expect(mailer.outbox).toHaveLength(0);
    tick(1 * DAY + 1);
    await program.sweep(true);
    await program.sweep(true);
    expect(mailer.outbox.map((m) => m.subject)).toEqual(['Votre forfait Essentiel offert se termine']);
    expect(mailer.outbox[0].text).toContain('prend fin le 14 octobre. Ensuite, vous revenez à Découverte');
    tick(3 * DAY);
    await program.sweep(true);
    expect(await plan('acc_fan')).toBe('decouverte');
    expect(await store.openGifts()).toEqual([]);
  });

  it('ends the offered plan when the person pays, so its end takes nothing back', async () => {
    const { program, store, plan, tick } = setup();
    await program.attach((await store.account('acc_fan'))!, 'AWATECH', 'link');
    await program.payment({ reference: 'pay_1', accountId: 'acc_fan', amount: 13_119, currency: 'XOF', at: T0 + DAY });
    expect(await store.openGifts()).toEqual([]);
    tick(8 * DAY);
    await program.sweep(true);
    expect(await plan('acc_fan')).toBe('essentiel');
  });

  it('leaves a plan changed meanwhile as it is', async () => {
    const { program, store, plan, tick } = setup();
    await program.attach((await store.account('acc_fan'))!, 'AWATECH', 'link');
    await store.setPlan('acc_fan', 'pro');
    tick(8 * DAY);
    await program.sweep(true);
    expect(await plan('acc_fan')).toBe('pro');
  });

  it('earns a share of each payment once, and pays what is past the hold to the partner’s number', async () => {
    const { program, store, tick } = setup();
    await program.attach((await store.account('acc_fan'))!, 'AWATECH', 'link');
    const payment = { reference: 'pay_1', accountId: 'acc_fan', amount: 13_119, currency: 'XOF', at: T0 + DAY };
    expect(await program.payment(payment)).toMatchObject({ commissionXof: 2624 });
    expect(await program.payment(payment)).toBeNull();
    expect(await program.payment({ ...payment, reference: 'pay_x', accountId: 'acc_nobody' })).toBeNull();
    expect(await program.payment({ ...payment, reference: 'pay_2', amount: 6000 })).not.toBeNull();

    let [s] = await program.summaries();
    expect(s).toMatchObject({ paying: 1, tier: 'base', rate: 0.2, payableXof: 0, pendingXof: 2624 + 1200, paidXof: 0 });
    expect(await program.payout(AWA.id, 'OM123', 'boss')).toEqual({ ok: false, message: 'Rien à payer pour l’instant.' });

    tick(31 * DAY);
    [s] = await program.summaries();
    expect(s.payableXof).toBe(3824);
    // Under the threshold: wait for more.
    expect(await program.payout(AWA.id, 'OM123', 'boss')).toMatchObject({ ok: false, message: 'Sous le seuil de 10000 F CFA.' });
    await store.saveProgramRules({ ...DEFAULT_RULES, payoutMinXof: 1000 }, T0);
    expect(await program.payout(AWA.id, ' ', 'boss')).toMatchObject({ ok: false });
    const paid = await program.payout(AWA.id, 'OM123', 'boss');
    expect(paid).toMatchObject({ ok: true, payout: { amountXof: 3824, method: 'orange', number: '+226 70 00 00 12', reference: 'OM123' } });
    expect(await program.payout(AWA.id, 'OM124', 'boss')).toMatchObject({ ok: false });
    [s] = await program.summaries();
    expect(s).toMatchObject({ payableXof: 0, paidXof: 3824 });
  });

  it('pays nobody without a mobile money number', async () => {
    const { program, store, tick } = setup();
    await store.savePartner({ ...AWA, payoutNumber: null });
    await program.attach((await store.account('acc_fan'))!, 'AWATECH', 'link');
    await program.payment({ reference: 'pay_1', accountId: 'acc_fan', amount: 100_000, currency: 'XOF', at: T0 });
    tick(31 * DAY);
    expect(await program.payout(AWA.id, 'OM1', 'boss')).toMatchObject({ ok: false, message: expect.stringMatching(/numéro/) });
  });
});
