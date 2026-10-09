import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../src/partners.js';
import { migrate, MIGRATIONS } from '../src/db.js';
import { PgStore } from '../src/pg-store.js';
import { MemoryStore, hashToken, type Account, type ControlStore, type Plan } from '../src/store.js';
import { pgliteDb } from './pglite.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const PLAN: Plan = { id: 'essentiel', category: 'starter', displayName: 'Essentiel', weekCredits: 100, monthlyPrices: [], models: null };
const ME: Account = { id: 'acc_me', email: 'me@example.test', planId: 'essentiel', createdAt: T0 };
const OTHER: Account = { id: 'acc_other', email: null, planId: 'essentiel', createdAt: T0 };

// One database for the file: PGlite takes seconds to start, a schema
// moments to rebuild. Every test starts from an empty `baarali` schema.
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
}, 60_000);

async function freshDb() {
  const db = pgliteDb(pg);
  await db.query('DROP SCHEMA IF EXISTS baarali CASCADE');
  return db;
}

async function pgStore(): Promise<ControlStore> {
  const db = await freshDb();
  await migrate(db);
  const store = new PgStore(db, [PLAN]);
  for (const a of [ME, OTHER]) await store.upsertAccount(a);
  await store.grantToken('tok-me', ME.id);
  return store;
}

async function memoryStore(): Promise<ControlStore> {
  return new MemoryStore(new Map([[hashToken('tok-me'), ME], [hashToken('tok-other'), OTHER]]), [PLAN]);
}

// The same rules for both stores: phase 0 runs the memory one, production the
// Postgres one, and the routes must not tell them apart.
describe.each([
  ['memory', memoryStore],
  ['postgres', pgStore],
])('%s store', (_name, make) => {
  it('reserves an export from the month minutes, then credits, and refunds it whole', async () => {
    const store = await make();
    await store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'topup', credits: 5, reference: 'pay-m' });
    const base = { accountId: ME.id, at: T0, format: 'mp4', fps: 30, status: 'rendering' as const, machine: null, refunded: false, error: null };
    const split = (seconds: number) => (used: { included: number; extra: number }) => {
      const included = Math.max(0, Math.min(seconds, 100 - used.included));
      return { included, credits: Math.ceil((seconds - included) / 20) };
    };
    const a = await store.reserveMotionRender({ ...base, id: 'mr_a', seconds: 80, chargeRef: 'motion:mr_a' }, T0 - 1000, split(80));
    expect(a).toEqual({ ok: true, render: { ...base, id: 'mr_a', seconds: 80, chargeRef: 'motion:mr_a', included: 80, credits: 0 } });
    const b = await store.reserveMotionRender({ ...base, id: 'mr_b', seconds: 60, chargeRef: 'motion:mr_b' }, T0 - 1000, split(60));
    expect(b).toMatchObject({ ok: true, render: { included: 20, credits: 2 } });
    expect(await store.mediaBalance(ME.id)).toBe(3);
    expect(await store.reserveMotionRender({ ...base, id: 'mr_c', seconds: 80, chargeRef: 'motion:mr_c' }, T0 - 1000, split(80))).toEqual({ ok: false, credits: 4 });
    expect(await store.motionRender('mr_c')).toBeNull();
    expect(await store.motionUsage(ME.id, T0 - 1000)).toEqual({ included: 100, extra: 40 });
    // Another month, another account: nothing used.
    expect(await store.motionUsage(ME.id, T0 + 1)).toEqual({ included: 0, extra: 0 });
    expect(await store.motionUsage(OTHER.id, T0 - 1000)).toEqual({ included: 0, extra: 0 });
    const failed = { ...(await store.motionRender('mr_b'))!, status: 'failed' as const, refunded: true, error: 'GSAP', machine: 'm1' };
    await store.saveMotionRender(failed);
    expect(await store.motionRender('mr_b')).toEqual(failed);
    expect(await store.motionUsage(ME.id, T0 - 1000)).toEqual({ included: 80, extra: 0 });
  });

  it('keeps one published sidebar, replaced, then removed', async () => {
    const store = await make();
    expect(await store.sidebarLayout()).toBeNull();
    const one = { layout: { entries: [{ id: 'chat' }, { id: 'code', label: 'Atelier' }] }, at: T0, by: 'boss@x' };
    await store.saveSidebarLayout(one);
    await store.saveSidebarLayout({ ...one, at: T0 + 1 });
    expect(await store.sidebarLayout()).toEqual({ ...one, at: T0 + 1 });
    await store.saveSidebarLayout(null);
    expect(await store.sidebarLayout()).toBeNull();
  });

  it('finds an account by its token, never by a wrong one', async () => {
    const store = await make();
    expect(await store.accountByToken('tok-me')).toEqual(ME);
    expect(await store.accountByToken('nope')).toBeNull();
    expect(await store.account(ME.id)).toEqual(ME);
    expect(await store.account('acc_nobody')).toBeNull();
  });

  it('keeps the quota state, with an open or a closed session', async () => {
    const store = await make();
    expect(await store.quotaState(ME.id)).toBeNull();
    await store.saveQuotaState(ME.id, { sessionStart: T0, sessionUsed: 1234567, weekStart: T0, weekUsed: 7654321 });
    expect(await store.quotaState(ME.id)).toEqual({ sessionStart: T0, sessionUsed: 1234567, weekStart: T0, weekUsed: 7654321 });
    await store.saveQuotaState(ME.id, { sessionStart: null, sessionUsed: 0, weekStart: T0, weekUsed: 9 });
    expect(await store.quotaState(ME.id)).toEqual({ sessionStart: null, sessionUsed: 0, weekStart: T0, weekUsed: 9 });
  });

  it('keeps a media job and its updates', async () => {
    const store = await make();
    const job = { id: 'px1', accountId: ME.id, model: 'lyria', credits: 5, chargeRef: 'c1', status: 'pending' as const, url: null, refunded: false };
    await store.saveMediaJob(job);
    await store.saveMediaJob({ ...job, status: 'completed', url: 'https://cdn.test/a.wav' });
    expect(await store.mediaJob('px1')).toEqual({ ...job, status: 'completed', url: 'https://cdn.test/a.wav' });
    expect(await store.mediaJob('px2')).toBeNull();
  });

  it('applies each ledger entry once and never lets the balance go below zero', async () => {
    const store = await make();
    const entry = (kind: 'topup' | 'charge' | 'refund', credits: number, reference: string) =>
      store.applyMediaEntry({ accountId: ME.id, at: T0, kind, credits, reference });
    expect(await entry('topup', 71, 'pay-1')).toBe('applied');
    expect(await entry('topup', 71, 'pay-1')).toBe('duplicate');
    expect(await entry('charge', -80, 'c1')).toBe('insufficient');
    expect(await entry('charge', -38, 'c2')).toBe('applied');
    expect(await entry('refund', 38, 'c2')).toBe('applied');
    expect(await entry('refund', 38, 'c2')).toBe('duplicate');
    expect(await store.mediaBalance(ME.id)).toBe(71);
    expect(await store.mediaBalance(OTHER.id)).toBe(0);
  });

  it('tells its owner what the credits went to, newest first', async () => {
    const store = await make();
    await store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'topup', credits: 71, reference: 'pay-1' });
    await store.saveMediaJob({ id: 'px1', accountId: ME.id, model: 'lyria', credits: 5, chargeRef: 'c1', status: 'completed', url: null, refunded: false });
    await store.applyMediaEntry({ accountId: ME.id, at: T0 + 1000, kind: 'charge', credits: -5, reference: 'c1' });
    await store.applyMediaEntry({ accountId: OTHER.id, at: T0 + 2000, kind: 'topup', credits: 9, reference: 'pay-2' });
    expect(await store.mediaHistory(ME.id, 10)).toEqual([
      { at: T0 + 1000, kind: 'charge', credits: -5, model: 'lyria' },
      { at: T0, kind: 'topup', credits: 71, model: null },
    ]);
    expect(await store.mediaHistory(ME.id, 1)).toHaveLength(1);
  });

  it('lets only one of two simultaneous charges spend the same credits', async () => {
    const store = await make();
    await store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'topup', credits: 50, reference: 'pay' });
    const results = await Promise.all(
      ['a', 'b'].map((r) => store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'charge', credits: -40, reference: r })),
    );
    expect(results.sort()).toEqual(['applied', 'insufficient']);
    expect(await store.mediaBalance(ME.id)).toBe(10);
  });

  it('grants a token to an account', async () => {
    const store = await make();
    await store.grantToken('tok-new', OTHER.id);
    expect(await store.accountByToken('tok-new')).toEqual(OTHER);
    await store.revokeToken('tok-new');
    expect(await store.accountByToken('tok-new')).toBeNull();
    await store.revokeToken('tok-never-granted');
  });

  it('keeps an instance record and its later steps', async () => {
    const store = await make();
    expect(await store.instance(ME.id)).toBeNull();
    const record = { accountId: ME.id, app: 'baarali-instances', machineId: null, volumeId: 'vol_1', image: null, managed: true, keys: 2 };
    await store.saveInstance(record);
    await store.saveInstance({ ...record, machineId: 'm1', image: 'img:1' });
    expect(await store.instance(ME.id)).toEqual({ ...record, machineId: 'm1', image: 'img:1' });
    expect(await store.countInstances()).toBe(1);
    await store.removeInstance(ME.id);
    expect(await store.instance(ME.id)).toBeNull();
    expect(await store.countInstances()).toBe(0);
  });

  it('finds a device by its key until it is revoked, and only its owner revokes it', async () => {
    const store = await make();
    const device = { id: 'dev_1', accountId: ME.id, name: 'Mac', createdAt: T0, lastSeenAt: null, revokedAt: null };
    await store.addDevice(device, hashToken('bdk_secret'));
    expect(await store.deviceByKey('bdk_secret')).toEqual(device);
    expect(await store.deviceByKey('bdk_other')).toBeNull();
    await store.touchDevice('dev_1', T0 + 5);
    expect(await store.devices(ME.id)).toEqual([{ ...device, lastSeenAt: T0 + 5 }]);
    expect(await store.devices(OTHER.id)).toEqual([]);
    expect(await store.revokeDevice(OTHER.id, 'dev_1', T0 + 9)).toBe(false);
    expect(await store.revokeDevice(ME.id, 'dev_1', T0 + 9)).toBe(true);
    expect(await store.revokeDevice(ME.id, 'dev_1', T0 + 10)).toBe(false);
    expect(await store.deviceByKey('bdk_secret')).toBeNull();
    expect((await store.devices(ME.id))[0].revokedAt).toBe(T0 + 9);
  });

  it('gives a signed-in user the account they created', async () => {
    const store = await make();
    expect(await store.accountForUser(ME.id)).toEqual(ME);
    expect(await store.accountForUser('user_nobody')).toBeNull();
  });

  it('appends usage without failing', async () => {
    const store = await make();
    await store.appendUsage({
      accountId: ME.id, at: T0, path: '/chat/completions', model: 'deepseek/deepseek-v4.1-flash', requestedModel: null,
      status: 200, credits: 12345, estimated: false, useCase: 'chat', agentName: 'copilot',
    });
  });

  // The admin console (03/10/2026).
  it('lists every account once, with its activity counted from a date', async () => {
    const store = await make();
    const call = (at: number, credits: number) => store.appendUsage({
      accountId: ME.id, at, path: '/chat/completions', model: 'm', requestedModel: null,
      status: 200, credits, estimated: false, useCase: 'chat', agentName: 'copilot',
    });
    await call(T0 + 10, 100);
    await call(T0 + 20, 50);
    await store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'topup', credits: 7, reference: 'r' });
    const list = await store.listAccounts(T0 + 15);
    expect(list.map((s) => s.account.id)).toEqual([ME.id, OTHER.id]);
    expect(list[0]).toMatchObject({ account: ME, quota: null, mediaBalance: 7, lastActiveAt: T0 + 20, recentCredits: 50 });
    expect(list[1]).toMatchObject({ account: OTHER, mediaBalance: 0, lastActiveAt: null, recentCredits: 0 });
  });

  it('changes a plan and suspends, seen through the account\'s token', async () => {
    const store = await make();
    expect(await store.setPlan(ME.id, 'pro')).toBe(true);
    expect(await store.setPlan('acc_nobody', 'pro')).toBe(false);
    expect((await store.accountByToken('tok-me'))?.planId).toBe('pro');
    expect(await store.setSuspended(ME.id, T0 + 5)).toBe(true);
    expect((await store.accountByToken('tok-me'))?.suspendedAt).toBe(T0 + 5);
    expect((await store.accountForUser(ME.id))?.suspendedAt).toBe(T0 + 5);
    await store.setSuspended(ME.id, null);
    expect(await store.account(ME.id)).toEqual({ ...ME, planId: 'pro' });
  });

  it('keeps the console journal, newest first, per account if asked', async () => {
    const store = await make();
    await store.appendAdminLog({ at: T0, actor: 'a@x', action: 'plan', accountId: ME.id, detail: 'A → B' });
    await store.appendAdminLog({ at: T0, actor: 'a@x', action: 'credits', accountId: OTHER.id, detail: '+5' });
    await store.appendAdminLog({ at: T0 + 1, actor: 'token', action: 'suspend', accountId: ME.id, detail: 'x' });
    expect((await store.adminLog(10)).map((e) => e.action)).toEqual(['suspend', 'credits', 'plan']);
    expect((await store.adminLog(1)).map((e) => e.action)).toEqual(['suspend']);
    expect(await store.adminLog(10, ME.id)).toEqual([
      { at: T0 + 1, actor: 'token', action: 'suspend', accountId: ME.id, detail: 'x' },
      { at: T0, actor: 'a@x', action: 'plan', accountId: ME.id, detail: 'A → B' },
    ]);
  });

  it('keeps the model settings, replaced whole on a second save', async () => {
    const store = await make();
    expect(await store.modelSettings()).toEqual([]);
    const opus = { modelId: 'anthropic/opus', enabled: true, minPlan: 'pro', recommended: true, strength: 'puissant' as const, freeRank: null };
    const flash = { modelId: 'deepseek/flash', enabled: true, minPlan: null, recommended: false, strength: null, freeRank: 0 };
    await store.saveModelSettings([opus, flash], T0);
    await store.saveModelSettings([{ ...opus, enabled: false, recommended: false }], T0 + 1);
    const byId = Object.fromEntries((await store.modelSettings()).map((s) => [s.modelId, s]));
    expect(byId).toEqual({ 'anthropic/opus': { ...opus, enabled: false, recommended: false }, 'deepseek/flash': flash });
  });

  it('lists every instance', async () => {
    const store = await make();
    const record = { accountId: ME.id, app: 'baarali-instances', machineId: 'm1', volumeId: 'v1', image: 'img:1', managed: true, keys: 2 };
    await store.saveInstance(record);
    expect(await store.allInstances()).toEqual([record]);
  });

  it('keeps announcements, newest first, and counts each person once per kind', async () => {
    const store = await make();
    const base = { button: null, target: 'none' as const, link: null, audience: 'all' as const, tone: 'info' as const, startsAt: T0, endsAt: T0 + 86_400_000, createdBy: 'a@x', removedAt: null };
    await store.saveAnnouncement({ ...base, id: 'ann_1', text: 'Un', createdAt: T0 });
    await store.saveAnnouncement({ ...base, id: 'ann_2', text: 'Deux', createdAt: T0 + 1 });
    await store.saveAnnouncement({ ...base, id: 'ann_1', text: 'Un', createdAt: T0, removedAt: T0 + 5 });
    expect((await store.announcements(10)).map((a) => [a.id, a.removedAt])).toEqual([['ann_2', null], ['ann_1', T0 + 5]]);

    expect(await store.recordAnnouncementEvent('ann_2', ME.id, 'view', T0)).toBe(true);
    expect(await store.recordAnnouncementEvent('ann_2', ME.id, 'view', T0 + 9)).toBe(false);
    expect(await store.recordAnnouncementEvent('ann_2', OTHER.id, 'view', T0)).toBe(true);
    expect(await store.recordAnnouncementEvent('ann_2', ME.id, 'dismiss', T0)).toBe(true);
    // An announcement that does not exist counts nothing.
    expect(await store.recordAnnouncementEvent('ann_x', ME.id, 'view', T0)).toBe(false);
    expect((await store.announcementEventsOf('ann_2', ME.id)).sort()).toEqual(['dismiss', 'view']);
    expect(await store.announcementStats(['ann_1', 'ann_2'])).toEqual({
      ann_1: { view: 0, click: 0, dismiss: 0 },
      ann_2: { view: 2, click: 0, dismiss: 1 },
    });
  });

  it('sends a notification once, keeps each copy, and counts reads and clicks', async () => {
    const store = await make();
    const base = {
      body: 'Corps', button: null, target: 'none' as const, link: null, audience: 'all' as const, accountId: null,
      app: true, email: false, sendAt: T0, createdBy: 'a@x', sentAt: null, cancelledAt: null, test: false,
    };
    await store.saveNotification({ ...base, id: 'ntf_1', title: 'Un', createdAt: T0 });
    await store.saveNotification({ ...base, id: 'ntf_2', title: 'Deux', createdAt: T0 + 1, app: false, email: true });
    await store.saveNotification({ ...base, id: 'ntf_3', title: 'Trois', createdAt: T0 + 2, sendAt: T0 + 99 });
    expect((await store.notifications(10)).map((n) => n.id)).toEqual(['ntf_3', 'ntf_2', 'ntf_1']);

    // Leaves once; a cancelled one never; a sent one cannot be cancelled.
    expect(await store.claimNotification('ntf_1', T0 + 5)).toBe(true);
    expect(await store.claimNotification('ntf_1', T0 + 6)).toBe(false);
    expect(await store.cancelNotification('ntf_1', T0 + 7)).toBe(false);
    expect(await store.cancelNotification('ntf_3', T0 + 7)).toBe(true);
    expect(await store.claimNotification('ntf_3', T0 + 8)).toBe(false);
    // Saving again does not undo either.
    await store.saveNotification({ ...base, id: 'ntf_1', title: 'Un bis', createdAt: T0 });
    const after = await store.notifications(10);
    expect(after.find((n) => n.id === 'ntf_1')).toMatchObject({ title: 'Un bis', sentAt: T0 + 5, cancelledAt: null });
    expect(after.find((n) => n.id === 'ntf_3')?.cancelledAt).toBe(T0 + 7);

    await store.deliverNotification('ntf_1', [ME.id, OTHER.id, ME.id], T0 + 5);
    await store.deliverNotification('ntf_1', [ME.id], T0 + 50);
    await store.claimNotification('ntf_2', T0 + 10);
    await store.deliverNotification('ntf_2', [ME.id], T0 + 10);
    await store.markEmailed('ntf_2', [ME.id], T0 + 11);

    // The inbox holds what is read in the app only, with the first delivery time.
    const inbox = await store.inbox(ME.id, 10);
    expect(inbox.map((x) => [x.notice.id, x.delivery.deliveredAt, x.delivery.readAt])).toEqual([['ntf_1', T0 + 5, null]]);

    expect(await store.recordNotificationEvent('ntf_1', ME.id, 'read', T0 + 20)).toBe(true);
    expect(await store.recordNotificationEvent('ntf_1', ME.id, 'read', T0 + 21)).toBe(false);
    expect(await store.recordNotificationEvent('ntf_1', ME.id, 'click', T0 + 22)).toBe(true);
    expect(await store.recordNotificationEvent('ntf_1', ME.id, 'click', T0 + 23)).toBe(false);
    // A click alone is a read too.
    expect(await store.recordNotificationEvent('ntf_2', ME.id, 'click', T0 + 24)).toBe(true);
    // No copy, nothing counted.
    expect(await store.recordNotificationEvent('ntf_3', ME.id, 'read', T0 + 25)).toBe(false);
    expect((await store.inbox(ME.id, 10))[0].delivery.readAt).toBe(T0 + 20);

    expect(await store.notificationStats(['ntf_1', 'ntf_2', 'ntf_3'])).toEqual({
      ntf_1: { delivered: 2, emailed: 0, read: 1, clicked: 1 },
      ntf_2: { delivered: 1, emailed: 1, read: 1, clicked: 1 },
      ntf_3: { delivered: 0, emailed: 0, read: 0, clicked: 0 },
    });
  });

  it('remembers who opted out of emails', async () => {
    const store = await make();
    expect(await store.setEmailOptOut(ME.id, T0)).toBe(true);
    expect((await store.listAccounts(T0)).find((s) => s.account.id === ME.id)?.account.emailOptOutAt).toBe(T0);
    expect(await store.setEmailOptOut(ME.id, null)).toBe(true);
    expect((await store.listAccounts(T0)).find((s) => s.account.id === ME.id)?.account.emailOptOutAt).toBeUndefined();
    expect(await store.setEmailOptOut('acc_none', T0)).toBe(false);
  });

  it('keeps partners, the people they bring, offered plans, and pays each commission once', async () => {
    const store = await make();
    const rules = { ...DEFAULT_RULES, baseRate: 0.15 };
    expect(await store.programRules()).toBeNull();
    await store.saveProgramRules(rules, T0);
    expect(await store.programRules()).toEqual(rules);

    const awa = {
      id: 'ptn_awa', name: 'Awa', code: 'AWA', network: 'TikTok', city: null, accountId: ME.id, email: 'awa@x.test', status: 'active' as const,
      createdAt: T0, createdBy: 'boss', payoutMethod: 'wave' as const, payoutNumber: '+225 07 00 00 00',
    };
    expect(await store.savePartner(awa)).toBe(true);
    expect(await store.savePartner({ ...awa, id: 'ptn_copy' })).toBe(false);
    expect(await store.savePartner({ ...awa, name: 'Awa Tech', status: 'paused' })).toBe(true);
    expect(await store.partnerByCode('AWA')).toMatchObject({ name: 'Awa Tech', status: 'paused', payoutMethod: 'wave', email: 'awa@x.test' });
    expect((await store.partnerForAccount(ME.id))?.id).toBe('ptn_awa');
    expect(await store.partnerByCode('NOPE')).toBeNull();
    expect((await store.partners()).map((p) => p.id)).toEqual(['ptn_awa']);

    await store.countPartnerClick('ptn_awa', '2026-10-01');
    await store.countPartnerClick('ptn_awa', '2026-10-01');
    await store.countPartnerClick('ptn_awa', '2026-10-02');
    expect(await store.addReferral({ accountId: OTHER.id, partnerId: 'ptn_awa', at: T0, via: 'code' })).toBe(true);
    expect(await store.addReferral({ accountId: OTHER.id, partnerId: 'ptn_awa', at: T0 + 1, via: 'link' })).toBe(false);
    expect(await store.referralOf(OTHER.id)).toEqual({ accountId: OTHER.id, partnerId: 'ptn_awa', at: T0, via: 'code' });
    expect(await store.referralOf(ME.id)).toBeNull();
    expect(await store.partnerFigures()).toEqual({ ptn_awa: { clicks: 3, signups: 1 } });

    const gift = { id: 'gft_1', accountId: OTHER.id, planId: 'essentiel', previousPlanId: 'decouverte', startsAt: T0, endsAt: T0 + 9, reason: 'Partenaire AWA', endedAt: null };
    await store.addGift(gift);
    await store.addGift({ ...gift, id: 'gft_0', endsAt: T0 + 5 });
    expect((await store.openGifts()).map((g) => g.id)).toEqual(['gft_0', 'gft_1']);
    expect(await store.endGift('gft_0', T0 + 6)).toBe(true);
    expect(await store.endGift('gft_0', T0 + 7)).toBe(false);
    expect(await store.openGifts()).toEqual([gift]);

    const c = { id: 'pay_1', partnerId: 'ptn_awa', accountId: OTHER.id, paidAt: T0, amountXof: 13119, rate: 0.2, commissionXof: 2624, payableAt: T0 + 30, payoutId: null };
    expect(await store.addCommission(c)).toBe(true);
    expect(await store.addCommission({ ...c, commissionXof: 1 })).toBe(false);
    expect(await store.addCommission({ ...c, id: 'pay_2' })).toBe(true);
    const payout = { id: 'po_1', partnerId: 'ptn_awa', amountXof: 5248, method: 'wave' as const, number: '+225', reference: 'W1', at: T0 + 40, by: 'boss' };
    expect(await store.payCommissions(payout, ['pay_1', 'pay_2'])).toBe(2);
    // Paid already: no second payout is written.
    expect(await store.payCommissions({ ...payout, id: 'po_2' }, ['pay_1'])).toBe(0);
    expect(await store.commissions('ptn_awa')).toEqual([{ ...c, payoutId: 'po_1' }, { ...c, id: 'pay_2', payoutId: 'po_1' }]);
    expect(await store.commissions('ptn_other')).toEqual([]);
    expect(await store.payouts()).toEqual([payout]);

    const application = {
      id: 'app_1', name: 'Fatou', email: 'fatou@x.test', phone: null, network: 'Instagram', profile: 'https://instagram.com/fatou', audience: 's',
      city: 'Dakar', message: null, createdAt: T0, status: 'new' as const, decidedAt: null, decidedBy: null,
    };
    expect(await store.addPartnerApplication(application)).toBe(true);
    expect(await store.addPartnerApplication({ ...application, id: 'app_2', createdAt: T0 + 1 })).toBe(false);
    expect(await store.addPartnerApplication({ ...application, id: 'app_3', email: 'kader@x.test', createdAt: T0 + 2 })).toBe(true);
    expect((await store.partnerApplications(10)).map((a) => a.id)).toEqual(['app_3', 'app_1']);
    expect(await store.decidePartnerApplication('app_1', 'accepted', T0 + 5, 'boss')).toBe(true);
    expect(await store.decidePartnerApplication('app_1', 'declined', T0 + 6, 'boss')).toBe(false);
    expect((await store.partnerApplications(10)).find((a) => a.id === 'app_1')).toEqual({ ...application, status: 'accepted', decidedAt: T0 + 5, decidedBy: 'boss' });
    // Answered: the same email may apply again.
    expect(await store.addPartnerApplication({ ...application, id: 'app_4', createdAt: T0 + 7 })).toBe(true);
  });

  it('sends an automatic message once per period, keeps its switches, and leaves it out of the console list', async () => {
    const store = await make();
    expect(await store.autoMessageSettings()).toEqual({});
    await store.setAutoMessage('inactive', true, T0);
    await store.setAutoMessage('welcome', false, T0);
    await store.setAutoMessage('inactive', false, T0 + 1);
    expect(await store.autoMessageSettings()).toEqual({ inactive: false, welcome: false });

    expect(await store.claimAutoMessage('limit', ME.id, 'session:1', T0)).toBe(true);
    expect(await store.claimAutoMessage('limit', ME.id, 'session:1', T0 + 1)).toBe(false);
    expect(await store.claimAutoMessage('limit', ME.id, 'session:2', T0 + 2)).toBe(true);
    expect(await store.claimAutoMessage('limit', OTHER.id, 'session:1', T0 + 3)).toBe(true);
    expect(await store.claimAutoMessage('welcome', ME.id, 'once', T0 + 4)).toBe(true);
    expect(await store.autoMessageCounts()).toEqual({ limit: 3, welcome: 1 });

    const base = {
      title: 'Auto', body: 'Corps', button: null, target: 'none' as const, link: null, audience: 'account' as const, accountId: ME.id,
      app: true, email: false, sendAt: T0, createdAt: T0, sentAt: null, cancelledAt: null, test: false,
    };
    await store.saveNotification({ ...base, id: 'ntf_auto', createdBy: 'auto:limit' });
    await store.saveNotification({ ...base, id: 'ntf_admin', createdBy: 'a@x' });
    expect((await store.notifications(10)).map((n) => n.id)).toEqual(['ntf_admin']);
    await store.claimNotification('ntf_auto', T0);
    await store.deliverNotification('ntf_auto', [ME.id], T0);
    expect((await store.inbox(ME.id, 10)).map((x) => x.notice.id)).toEqual(['ntf_auto']);
  });
});

describe('linking an account to a sign-in', () => {
  // Better Auth's own table, reduced to the columns the link reads.
  async function withUsers(users: Array<{ id: string; email: string; verified: boolean }>) {
    const db = await freshDb();
    await migrate(db);
    await db.query('CREATE TABLE baarali.users (id text PRIMARY KEY, email text NOT NULL, "emailVerified" boolean NOT NULL)');
    for (const u of users) await db.query('INSERT INTO baarali.users VALUES ($1, $2, $3)', [u.id, u.email, u.verified]);
    const store = new PgStore(db, [PLAN]);
    await store.upsertAccount({ ...ME, id: 'owner', email: 'Me@Example.test' });
    return store;
  }

  it('links the owner to the user who signed in with its email, verified', async () => {
    const store = await withUsers([{ id: 'user_1', email: 'me@example.test', verified: true }]);
    // The account the sign-in created first, on Découverte, is set aside.
    await store.upsertAccount({ ...ME, id: 'user_1', planId: 'decouverte' });
    expect(await store.linkUserByVerifiedEmail('owner', 'Me@Example.test')).toBe(true);
    expect((await store.accountForUser('user_1'))?.id).toBe('owner');
    expect(await store.linkUserByVerifiedEmail('owner', 'Me@Example.test')).toBe(false);
  });

  it('never links an unverified email, nor a user already linked', async () => {
    const store = await withUsers([{ id: 'user_1', email: 'me@example.test', verified: false }]);
    expect(await store.linkUserByVerifiedEmail('owner', 'me@example.test')).toBe(false);
    expect(await store.accountForUser('user_1')).toBeNull();
  });
});

describe('migrations', () => {
  it('apply once, and again is a no-op', async () => {
    const db = await freshDb();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await migrate(db)).toBe(0);
  });

  it('rename the former `warell` schema in place, data and all', async () => {
    const db = await freshDb();
    await db.query('DROP SCHEMA IF EXISTS warell CASCADE');
    await migrate(db);
    await db.query('ALTER SCHEMA baarali RENAME TO warell');
    await db.query("INSERT INTO warell.accounts (id, plan_id) VALUES ('acc_old', 'essentiel')");
    expect(await migrate(db)).toBe(0);
    const { rows } = await db.query<{ id: string }>('SELECT id FROM baarali.accounts');
    expect(rows.map((r) => r.id)).toEqual(['acc_old']);
    const left = await db.query("SELECT 1 FROM pg_namespace WHERE nspname = 'warell'");
    expect(left.rows).toHaveLength(0);
  });

  it('keep the media ledger append only', async () => {
    const db = await freshDb();
    await migrate(db);
    const store = new PgStore(db, [PLAN]);
    await store.upsertAccount(ME);
    await store.applyMediaEntry({ accountId: ME.id, at: T0, kind: 'topup', credits: 10, reference: 'p' });
    await expect(db.query('UPDATE baarali.media_ledger SET credits = 1000 WHERE reference = $1', ['p'])).rejects.toThrow(/append only/);
    await expect(db.query('DELETE FROM baarali.media_ledger WHERE reference = $1', ['p'])).rejects.toThrow(/append only/);
  });

  it('keep an account\'s plan when it is upserted again, as at every boot', async () => {
    const db = await freshDb();
    await migrate(db);
    const store = new PgStore(db, [PLAN]);
    await store.upsertAccount(ME);
    await store.setPlan(ME.id, 'pro');
    // The owner's account at the next boot, BAARALI_PLAN_ID unchanged.
    await store.upsertAccount({ ...ME, email: 'new@example.test' });
    expect(await store.account(ME.id)).toEqual({ ...ME, email: 'new@example.test', planId: 'pro' });
  });

  it('keep the console journal append only', async () => {
    const db = await freshDb();
    await migrate(db);
    const store = new PgStore(db, [PLAN]);
    await store.appendAdminLog({ at: T0, actor: 'a@x', action: 'plan', accountId: null, detail: 'A → B' });
    await expect(db.query("UPDATE baarali.admin_log SET detail = 'rien'")).rejects.toThrow(/append only/);
    await expect(db.query('DELETE FROM baarali.admin_log')).rejects.toThrow(/append only/);
  });
});
