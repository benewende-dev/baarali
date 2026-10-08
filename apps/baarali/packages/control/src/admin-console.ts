import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { CREDITS_PER_DOLLAR } from '@x/shared/dist/billing.js';
import { isAdmin, type SoldPack } from './admin.js';
import { adminPage, deniedPage } from './admin-page.js';
import { isLive, parseDraft, type Announcement } from './announcements.js';
import type { PartnerProgram } from './partner-program.js';
import { partnerWelcomeMail } from './partner-page.js';
import { siteOf } from './partner-routes.js';
import { normalizeCode, parseRules, PAYOUT_METHODS, PAYOUT_WORDS, TIER_WORDS, type Partner, type PayoutMethod } from './partners.js';
import { AUTO_KINDS, type AutoKind, type AutoMessages } from './auto-messages.js';
import { audienceOf, emailable, parseNoticeDraft, sendNotice, type DispatchDeps, type Notice } from './notifications.js';
import { AUTH_BASE_PATH, type BaaraliAuth } from './auth.js';
import { ASSUMPTIONS, OFFERS } from './catalog.js';
import { html } from './html.js';
import {
  compareVendors,
  deduceStrength,
  isFreePlan,
  isStrength,
  planLabeler,
  presentFor,
  STRENGTHS,
  vendorName,
  vendorOf,
  pickerGroups,
  mediaKey,
  mediaOpen,
  mediaRecommended,
  type ModelSetting,
  type PickerModel,
  openUntouched,
} from './model-access.js';
import type { ModelCatalog, UpstreamModels } from './model-catalog.js';
import { displayName } from './models.js';
import { MEDIA_MODELS, mediaCredits } from './media.js';
import { WEEKS_PER_MONTH } from './pricing.js';
import type { Instances } from './instances.js';
import { advance, budgetsForWeek, gauges, initialState, WEEK_MS } from './quota.js';
import type { AccountSummary, ControlStore, InstanceRecord, Plan } from './store.js';

// The admin console (decided 03/10/2026): app.baarali.com/admin, for the
// emails in BAARALI_ADMIN_EMAILS only, signed in like everyone else. It
// reads accounts, changes a plan, gives media credits, suspends, and wakes,
// updates or restarts an instance; every change is written to admin_log.
// What a model call really costs is shown here, never to a customer.

export interface ConsoleDeps {
  store: ControlStore;
  auth?: BaaraliAuth;
  /** Lowercase; empty: the console does not exist (404). */
  adminEmails: string[];
  /** The operator token still opens the JSON routes, for scripts. */
  adminTokenHash?: string;
  mediaPacks: SoldPack[];
  instances?: Instances;
  models: ModelCatalog;
  upstreamModels: UpstreamModels;
  now: () => number;
  /** Notifications: the store, the clock and, when email is on, the mailer. */
  notices: DispatchDeps;
  auto: AutoMessages;
  program: PartnerProgram;
  /** The app's address; the public site is the same without `app.` (partner-routes.ts). */
  publicUrl: string;
}

/** One write touches this many models at most: a whole vendor fits, a slip does not empty the catalog. */
export const MAX_MODELS_PER_WRITE = 500;

const blank = (modelId: string): ModelSetting => ({ modelId, enabled: openUntouched(modelId), minPlan: null, recommended: false, strength: null, freeRank: null });

/** OpenRouter prices a token in dollars; the console reads them per million. */
function perMillion(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 100) / 100 : null;
}

/** Who is acting: an admin's email, or `token` for the operator token. */
type Actor = string;

/** A media credit gift has a ceiling: a slip of the keyboard must not give away a fortune. */
export const MAX_GIFT_CREDITS = 10_000;

const XOF_PER_USD = 1 / ASSUMPTIONS.usdPerUnit.XOF;

/** What model calls cost us, in dollars and CFA francs (rounded). */
export function costOf(credits: number): { usd: number; xof: number } {
  const usd = credits / CREDITS_PER_DOLLAR;
  return { usd: Math.round(usd * 100) / 100, xof: Math.round(usd * XOF_PER_USD) };
}

/**
 * What one subscriber of the plan brings in a month, in euros: a weekly plan
 * (Semaine) has no monthly price, so its week counts 52/12 times.
 */
function monthlyEur(planId: string): number {
  const billing = OFFERS.find((o) => o.id === planId)?.billing;
  if (!billing || billing.kind !== 'paid') return 0;
  const eur = billing.prices.find((p) => p.currency === 'EUR')?.amount ?? 0;
  return (billing.period === 'week' ? eur * WEEKS_PER_MONTH : eur) / 100;
}

const percent = (used: number, of: number) => (of > 0 ? Math.min(100, Math.round((used / of) * 100)) : 0);

/** One account as the console shows it. */
export function clientRow(s: AccountSummary, plan: Plan | null, now: number, label: (p: Plan) => string) {
  const g = gauges(s.quota ?? initialState(s.account.createdAt), budgetsForWeek(plan?.weekCredits ?? 0), now);
  return {
    id: s.account.id,
    email: s.account.email,
    planId: s.account.planId,
    planName: plan ? label(plan) : s.account.planId,
    createdAt: s.account.createdAt,
    suspendedAt: s.account.suspendedAt ?? null,
    session: percent(g.session.usedCredits, g.session.sanctionedCredits),
    week: percent(g.week.usedCredits, g.week.sanctionedCredits),
    weekResetsAt: g.week.resetsAt,
    mediaBalance: s.mediaBalance,
    lastActiveAt: s.lastActiveAt,
    cost: costOf(s.recentCredits),
  };
}

export function mountAdminConsole(app: Hono<any>, deps: ConsoleDeps): void {
  if (deps.adminEmails.length === 0) return;
  const { store } = deps;

  async function sessionAdmin(c: Context): Promise<{ actor: Actor } | { who: string | null } | null> {
    const user = deps.auth ? await deps.auth.sessionUser(c.req.raw.headers) : null;
    if (!user) return null;
    if (user.email && user.emailVerified && deps.adminEmails.includes(user.email.toLowerCase())) return { actor: user.email };
    return { who: user.email };
  }

  // The page: signed in as an admin, or sent to sign in, or told no.
  app.get('/admin', async (c) => {
    // Without the sign-in server nobody can sign in: only the operator token's JSON routes remain.
    if (!deps.auth) return c.notFound();
    const who = await sessionAdmin(c);
    if (!who) return c.redirect(`${AUTH_BASE_PATH}/sign-in#admin`, 302);
    if (!('actor' in who)) return html((nonce) => deniedPage({ nonce, who: who.who }));
    return html((nonce) => adminPage({ nonce, admin: who.actor }));
  });

  // The JSON routes. A cookie alone is not enough to change anything: the
  // page sends a header no other site can set without our CORS consent.
  const api = async (c: Context, write: boolean): Promise<Actor | Response> => {
    const bearer = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
    if (bearer && isAdmin({ store, adminTokenHash: deps.adminTokenHash, packs: deps.mediaPacks, now: deps.now }, bearer)) return 'token';
    const who = await sessionAdmin(c);
    if (!who || !('actor' in who)) return c.json({ error: { code: 'not_found' } }, 404);
    if (write && c.req.header('x-baarali-admin') !== '1') return c.json({ error: { code: 'forbidden' } }, 403);
    return who.actor;
  };
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    const parsed: unknown = await c.req.json().catch(() => null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  };
  const log = (actor: Actor, action: string, accountId: string | null, detail: string) =>
    store.appendAdminLog({ at: deps.now(), actor, action, accountId, detail });

  const summaries = async () => {
    const now = deps.now();
    const plans = await store.plans();
    const list = await store.listAccounts(now - WEEK_MS);
    const label = planLabeler(plans);
    return { now, plans, label, list, rows: list.map((s) => clientRow(s, plans.find((p) => p.id === s.account.planId) ?? null, now, label)) };
  };

  app.get('/admin/api/overview', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const { now, plans, label, list, rows } = await summaries();
    const instances = await store.allInstances();
    const outdated = deps.instances?.currentImage
      ? instances.filter((i) => deps.instances!.outdatedRecord(i)).length
      : 0;
    // A machine that failed to start is the first thing to see (mockup of 03/10/2026).
    const failed = deps.instances
      ? (await Promise.all(instances.map((r) => deps.instances!.machineState(r).catch(() => null))))
          .flatMap((m, i) => (m?.state === 'failed' ? [instances[i].accountId] : []))
      : [];
    const paid = rows.filter((r) => plans.find((p) => p.id === r.planId)?.category !== 'free');
    const monthly = paid.reduce((sum, r) => sum + monthlyEur(r.planId), 0);
    const weekCredits = list.reduce((sum, s) => sum + s.recentCredits, 0);
    return c.json({
      clients: rows.length,
      newThisWeek: rows.filter((r) => r.createdAt >= now - WEEK_MS).length,
      activeThisWeek: rows.filter((r) => r.lastActiveAt !== null && r.lastActiveAt >= now - WEEK_MS).length,
      paid: paid.length,
      monthlyValueEur: Math.round(monthly),
      weekCost: costOf(weekCredits),
      plans: plans.map((p) => ({ id: p.id, name: label(p), count: rows.filter((r) => r.planId === p.id).length })),
      attention: {
        atLimit: rows.filter((r) => r.week >= 100 || r.session >= 100).map((r) => ({ id: r.id, email: r.email })),
        suspended: rows.filter((r) => r.suspendedAt !== null).length,
        outdatedInstances: outdated,
        failedInstances: failed.map((id) => ({ id, email: rows.find((r) => r.id === id)?.email ?? null })),
      },
    });
  });

  app.get('/admin/api/clients', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const { rows, plans, label } = await summaries();
    return c.json({
      data: rows,
      plans: plans.map((p) => ({ id: p.id, name: label(p) })),
      // The packs as sold, to give one in a click; any other amount stays possible.
      packs: deps.mediaPacks.map((p) => ({ id: p.id, credits: p.credits, eur: (p.prices.find((m) => m.currency === 'EUR')?.amount ?? 0) / 100 })),
    });
  });

  app.get('/admin/api/clients/:id', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const { rows } = await summaries();
    const row = rows.find((r) => r.id === c.req.param('id'));
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    const [devices, history, journal, instance] = await Promise.all([
      store.devices(row.id),
      store.mediaHistory(row.id, 10),
      store.adminLog(20, row.id),
      store.instance(row.id),
    ]);
    return c.json({
      ...row,
      devices: devices.map((d) => ({ name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, revoked: d.revokedAt !== null })),
      media: history,
      journal,
      instance: instance && { image: instance.image, managed: instance.managed },
    });
  });

  app.post('/admin/api/clients/:id/plan', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    const account = await store.account(id);
    if (!account) return c.json({ error: { code: 'not_found' } }, 404);
    const planId = (await body(c)).plan;
    const plan = typeof planId === 'string' ? await store.plan(planId) : null;
    if (!plan) return c.json({ error: { code: 'invalid_request', message: 'Unknown plan' } }, 400);
    if (plan.id === account.planId) return c.json({ changed: false });
    // Named before the change: the memory store hands out the record it changes.
    const label = planLabeler(await store.plans());
    const before = await store.plan(account.planId);
    const from = before ? label(before) : account.planId;
    await store.setPlan(id, plan.id);
    await log(actor, 'plan', id, `${from} → ${label(plan)}`);
    return c.json({ changed: true });
  });

  app.post('/admin/api/clients/:id/credits', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    if (!(await store.account(id))) return c.json({ error: { code: 'not_found' } }, 404);
    const b = await body(c);
    const credits = b.credits;
    if (typeof credits !== 'number' || !Number.isInteger(credits) || credits < 1 || credits > MAX_GIFT_CREDITS) {
      return c.json({ error: { code: 'invalid_request', message: `credits: a whole number from 1 to ${MAX_GIFT_CREDITS}` } }, 400);
    }
    // A payment reference makes a second click on the same payment harmless.
    // It is the receipt as is, like /v1/admin/media-credits and the payment
    // rail to come: one receipt credits once, whichever way it came in.
    const given = typeof b.reference === 'string' ? b.reference.trim().slice(0, 80) : '';
    const reference = given || `admin:gift-${randomUUID()}`;
    const result = await store.applyMediaEntry({ accountId: id, at: deps.now(), kind: 'topup', credits, reference });
    if (result === 'applied') await log(actor, 'credits', id, `+${credits} crédits médias${given ? ` · ${given}` : ''}`);
    return c.json({ added: result === 'applied' ? credits : 0, duplicate: result === 'duplicate', balance: await store.mediaBalance(id) });
  });

  app.post('/admin/api/clients/:id/reset-session', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    const account = await store.account(id);
    if (!account) return c.json({ error: { code: 'not_found' } }, 404);
    const state = advance((await store.quotaState(id)) ?? initialState(account.createdAt), deps.now());
    await store.saveQuotaState(id, { ...state, sessionStart: null, sessionUsed: 0 });
    await log(actor, 'session', id, 'Session de 5 h remise à zéro');
    return c.json({ ok: true });
  });

  app.post('/admin/api/clients/:id/suspend', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    const account = await store.account(id);
    if (!account) return c.json({ error: { code: 'not_found' } }, 404);
    const suspend = (await body(c)).suspended === true;
    if (suspend === Boolean(account.suspendedAt)) return c.json({ changed: false });
    await store.setSuspended(id, suspend ? deps.now() : null);
    await log(actor, suspend ? 'suspend' : 'restore', id, suspend ? 'Compte suspendu' : 'Compte rétabli');
    return c.json({ changed: true });
  });

  app.get('/admin/api/instances', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const [records, accounts] = await Promise.all([store.allInstances(), store.listAccounts(deps.now())]);
    const current = deps.instances?.currentImage ?? null;
    const data = await Promise.all(
      records.map(async (r) => {
        // One machine Fly cannot describe must not hide the others.
        const [live, disk] = deps.instances
          ? await Promise.all([deps.instances.machineState(r).catch(() => 'unknown' as const), deps.instances.diskState(r).catch(() => null)])
          : [null, null];
        return {
          accountId: r.accountId,
          email: accounts.find((a) => a.account.id === r.accountId)?.account.email ?? null,
          app: r.app,
          machineId: r.machineId,
          managed: r.managed,
          // Its logs and metrics, on Fly's dashboard (signed in there).
          logsUrl: r.managed && r.machineId ? `https://fly.io/apps/${r.app}/machines/${r.machineId}` : null,
          image: imageLabel(r.image),
          outdated: Boolean(deps.instances?.outdatedRecord(r)),
          state: live === 'unknown' ? 'unknown' : (live?.state ?? null),
          disk,
        };
      }),
    );
    return c.json({ currentImage: imageLabel(current), diskGb: deps.instances?.diskGb ?? null, data });
  });

  for (const action of ['wake', 'update', 'restart'] as const) {
    app.post(`/admin/api/instances/:accountId/${action}`, async (c) => {
      const actor = await api(c, true);
      if (actor instanceof Response) return actor;
      const accountId = c.req.param('accountId');
      const record = await store.instance(accountId);
      if (!record || !deps.instances) return c.json({ error: { code: 'not_found' } }, 404);
      try {
        const done = await act(deps.instances, record, action);
        if (done) await log(actor, `instance-${action}`, accountId, INSTANCE_WORDS[action]);
        return c.json({ done });
      } catch (err) {
        console.error(`[admin] instance ${action} of ${accountId} failed`, err);
        return c.json({ error: { code: 'instance_failed' } }, 502);
      }
    });
  }

  // The models (decided 03/10/2026): OpenRouter's catalog, the owner's
  // settings over it, and what each plan's picker then shows.
  const upstream = async () => {
    const parsed = JSON.parse(await deps.upstreamModels.get()) as { data?: unknown };
    if (!Array.isArray(parsed.data)) throw new Error('unexpected catalog');
    return parsed.data.filter((m): m is { id: string; name?: unknown; pricing?: { prompt?: unknown; completion?: unknown } } =>
      !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string');
  };

  app.get('/admin/api/models', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    let list;
    try {
      list = await upstream();
    } catch (err) {
      console.error('[admin] OpenRouter catalog unreadable', err);
      return c.json({ error: { code: 'upstream_failed', message: 'Le catalogue OpenRouter ne répond pas' } }, 502);
    }
    deps.models.clear();
    const catalog = await deps.models.get();
    const label = planLabeler(catalog.plans);
    const byVendor = new Map<string, unknown[]>();
    const known = new Set(list.map((m) => m.id));
    for (const m of list) {
      const s = catalog.settings.get(m.id);
      const vendor = vendorOf(m.id);
      byVendor.set(vendor, [...(byVendor.get(vendor) ?? []), {
        id: m.id,
        name: typeof m.name === 'string' ? displayName(m.name) : m.id,
        configured: Boolean(s),
        enabled: s?.enabled ?? openUntouched(m.id),
        minPlan: s?.minPlan ?? null,
        recommended: s?.recommended ?? false,
        strength: s?.strength ?? null,
        deduced: deduceStrength(m.id),
        free: catalog.free.indexOf(m.id),
        price: { prompt: perMillion(m.pricing?.prompt), completion: perMillion(m.pricing?.completion) },
      }]);
    }
    const vendors = [...byVendor.entries()]
      .sort(([a], [b]) => compareVendors(a, b))
      .map(([id, models]) => ({ id, name: vendorName(id), models }));
    return c.json({
      plans: catalog.plans.map((p) => ({ id: p.id, name: label(p), free: isFreePlan(p) })),
      strengths: STRENGTHS,
      free: catalog.free,
      // Découverte's list as the code sets it, until the console sets one.
      freeFromCode: ![...catalog.settings.values()].some((s) => s.freeRank !== null),
      // Settings for models OpenRouter no longer lists: kept, shown apart.
      gone: [...catalog.settings.keys()].filter((id) => !known.has(id)),
      vendors,
    });
  });

  app.post('/admin/api/models', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const b = await body(c);
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === 'string' && x.includes('/')))] : [];
    const set = b.set && typeof b.set === 'object' && !Array.isArray(b.set) ? (b.set as Record<string, unknown>) : {};
    if (ids.length === 0 || ids.length > MAX_MODELS_PER_WRITE) {
      return c.json({ error: { code: 'invalid_request', message: `ids: 1 to ${MAX_MODELS_PER_WRITE} models` } }, 400);
    }
    const catalog = await deps.models.get();
    const paid = catalog.plans.filter((p) => !isFreePlan(p)).map((p) => p.id);
    const change: Partial<ModelSetting> = {};
    if (typeof set.enabled === 'boolean') change.enabled = set.enabled;
    if (typeof set.recommended === 'boolean') change.recommended = set.recommended;
    if ('minPlan' in set) {
      if (set.minPlan !== null && !(typeof set.minPlan === 'string' && paid.includes(set.minPlan))) {
        return c.json({ error: { code: 'invalid_request', message: `minPlan: null or one of ${paid.join(', ')}` } }, 400);
      }
      change.minPlan = set.minPlan as string | null;
    }
    if ('strength' in set) {
      if (set.strength !== null && !isStrength(set.strength)) return c.json({ error: { code: 'invalid_request', message: 'Unknown strength' } }, 400);
      change.strength = set.strength;
    }
    if (Object.keys(change).length === 0) return c.json({ error: { code: 'invalid_request', message: 'Nothing to change' } }, 400);
    const settings = ids.map((id) => ({ ...(catalog.settings.get(id) ?? blank(id)), ...change, modelId: id }));
    await store.saveModelSettings(settings, deps.now());
    deps.models.clear();
    const label = planLabeler(catalog.plans);
    const words = [
      change.enabled !== undefined ? (change.enabled ? 'ouvert' : 'masqué') : null,
      change.recommended !== undefined ? (change.recommended ? 'conseillé' : 'plus conseillé') : null,
      change.minPlan !== undefined ? `dès ${change.minPlan ? label(catalog.plans.find((p) => p.id === change.minPlan)!) : 'tout forfait payant'}` : null,
      change.strength !== undefined ? `point fort : ${change.strength ? STRENGTHS[change.strength] : 'automatique'}` : null,
    ].filter(Boolean).join(', ');
    await log(actor, 'models', null, `${ids.length === 1 ? ids[0] : `${ids.length} modèles`} : ${words}`);
    return c.json({ saved: settings.length });
  });

  // Découverte's list, in order: the first is the default, the others take over.
  app.post('/admin/api/models/free', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const raw = (await body(c)).ids;
    const ids = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.includes('/')))] : [];
    if (ids.length === 0 || ids.length > 10) {
      return c.json({ error: { code: 'invalid_request', message: 'Découverte needs 1 to 10 models' } }, 400);
    }
    const catalog = await deps.models.get();
    const leaving = [...catalog.settings.values()].filter((s) => s.freeRank !== null && !ids.includes(s.modelId));
    const settings = [
      ...leaving.map((s) => ({ ...s, freeRank: null })),
      ...ids.map((id, i) => ({ ...(catalog.settings.get(id) ?? blank(id)), modelId: id, enabled: true, freeRank: i })),
    ];
    await store.saveModelSettings(settings, deps.now());
    deps.models.clear();
    await log(actor, 'models-free', null, `Découverte : ${ids.join(', ')}`);
    return c.json({ free: ids });
  });

  // Exactly what one plan's picker receives (/v1/llm/models).
  app.get('/admin/api/models/preview', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const catalog = await deps.models.get();
    const plan = catalog.plans.find((p) => p.id === c.req.query('plan'));
    if (!plan) return c.json({ error: { code: 'invalid_request', message: 'Unknown plan' } }, 400);
    const label = planLabeler(catalog.plans);
    let shown: string | null;
    try {
      shown = presentFor(catalog, plan, await deps.upstreamModels.get(), (id) => {
        const p = catalog.plans.find((x) => x.id === id);
        return p ? label(p) : id;
      });
    } catch {
      shown = null;
    }
    if (shown === null) return c.json({ error: { code: 'upstream_failed', message: 'Le catalogue OpenRouter ne répond pas' } }, 502);
    const { data } = JSON.parse(shown) as { data: PickerModel[] };
    return c.json({ default: data[0]?.id ?? null, groups: pickerGroups(data) });
  });

  // Pixazo's models (03/10/2026): media.ts is their catalog, since Pixazo
  // lists none; the console opens, closes and recommends them.
  const MEDIA_KINDS = { video: 'Vidéo', speech: 'Voix', music: 'Musique' } as const;

  app.get('/admin/api/media-models', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    deps.models.clear();
    const catalog = await deps.models.get();
    const label = planLabeler(catalog.plans);
    return c.json({
      plans: catalog.plans.map((p) => ({ id: p.id, name: label(p) })),
      kinds: MEDIA_KINDS,
      models: MEDIA_MODELS.map((m) => {
        const s = catalog.settings.get(mediaKey(m.id));
        const credits = mediaCredits(m, { model: m.id, prompt: 'x' });
        return {
          id: m.id,
          kind: m.kind,
          name: m.displayName,
          ...(m.durations ? { durations: m.durations } : {}),
          configured: Boolean(s),
          enabled: s?.enabled ?? true,
          minPlan: s?.minPlan ?? null,
          recommended: mediaRecommended(catalog, m.id),
          // The default request: what the agent quotes first.
          credits,
          usd: Math.round(m.costUsd({ model: m.id, prompt: 'x' }) * 1000) / 1000,
          openFor: catalog.plans.filter((p) => mediaOpen(catalog, p, m.id)).map((p) => p.id),
        };
      }),
    });
  });

  app.post('/admin/api/media-models', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const b = await body(c);
    const known = new Set(MEDIA_MODELS.map((m) => m.id));
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === 'string' && known.has(x)))] : [];
    const set = b.set && typeof b.set === 'object' && !Array.isArray(b.set) ? (b.set as Record<string, unknown>) : {};
    if (ids.length === 0) return c.json({ error: { code: 'invalid_request', message: `ids: some of ${[...known].join(', ')}` } }, 400);
    const catalog = await deps.models.get();
    const change: Partial<ModelSetting> = {};
    if (typeof set.enabled === 'boolean') change.enabled = set.enabled;
    if (typeof set.recommended === 'boolean') change.recommended = set.recommended;
    if ('minPlan' in set) {
      // Every plan may open a media model, Découverte included: credits pay for it.
      if (set.minPlan !== null && !(typeof set.minPlan === 'string' && catalog.plans.some((p) => p.id === set.minPlan))) {
        return c.json({ error: { code: 'invalid_request', message: 'minPlan: null or a plan id' } }, 400);
      }
      change.minPlan = set.minPlan as string | null;
    }
    if (Object.keys(change).length === 0) return c.json({ error: { code: 'invalid_request', message: 'Nothing to change' } }, 400);
    // A first setting keeps the code's « Conseillé »: hiding a model must not also unmark it.
    const first = (id: string) => ({ ...blank(mediaKey(id)), recommended: mediaRecommended(catalog, id) });
    const settings = ids.map((id) => ({ ...(catalog.settings.get(mediaKey(id)) ?? first(id)), ...change, modelId: mediaKey(id) }));
    await store.saveModelSettings(settings, deps.now());
    deps.models.clear();
    const label = planLabeler(catalog.plans);
    const words = [
      change.enabled !== undefined ? (change.enabled ? 'ouvert' : 'masqué') : null,
      change.recommended !== undefined ? (change.recommended ? 'conseillé' : 'plus conseillé') : null,
      change.minPlan !== undefined ? `dès ${change.minPlan ? label(catalog.plans.find((p) => p.id === change.minPlan)!) : 'tout forfait'}` : null,
    ].filter(Boolean).join(', ');
    await log(actor, 'media-models', null, `Pixazo ${ids.join(', ')} : ${words}`);
    return c.json({ saved: settings.length });
  });

  // Announcements: the banner at the top of the Chat (07/10/2026).
  const statusOf = (a: Announcement, now: number) =>
    a.removedAt !== null ? 'removed' : isLive(a, now) ? 'live' : a.startsAt > now ? 'scheduled' : 'ended';

  app.get('/admin/api/announcements', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const now = deps.now();
    const list = await store.announcements(50);
    const stats = await store.announcementStats(list.map((a) => a.id));
    return c.json({ data: list.map((a) => ({ ...a, status: statusOf(a, now), stats: stats[a.id] })) });
  });

  app.post('/admin/api/announcements', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const now = deps.now();
    const parsed = parseDraft(await body(c), now);
    if (!parsed.ok) return c.json({ error: { code: 'invalid_request', message: parsed.message } }, 400);
    // One banner at a time: the one before ends now, scheduled ones included.
    for (const old of await store.announcements(50)) {
      if (old.removedAt === null && old.endsAt > now) await store.saveAnnouncement({ ...old, removedAt: now });
    }
    const announcement: Announcement = { id: `ann_${randomUUID()}`, ...parsed.draft, createdAt: now, createdBy: actor, removedAt: null };
    await store.saveAnnouncement(announcement);
    await log(actor, 'announcement', null, `Annonce publiée : « ${announcement.text} »`);
    return c.json({ id: announcement.id }, 201);
  });

  app.post('/admin/api/announcements/:id/remove', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const found = (await store.announcements(50)).find((a) => a.id === c.req.param('id'));
    if (!found) return c.json({ error: { code: 'not_found' } }, 404);
    if (found.removedAt !== null) return c.json({ changed: false });
    await store.saveAnnouncement({ ...found, removedAt: deps.now() });
    await log(actor, 'announcement-removed', null, `Annonce retirée : « ${found.text} »`);
    return c.json({ changed: true });
  });

  // Notifications (07/10/2026): a message for everyone, a group or one person.
  const AUDIENCE_WORDS: Record<Notice['audience'], string> = {
    all: 'Tous', free: 'Découverte', paid: 'Forfaits payants', limit: 'Limite atteinte', inactive: 'Inactifs 14 j', account: 'Un client',
  };
  /** The people a message would reach now: how many, and how many by email. */
  const reach = async (audience: Notice['audience'], accountEmail: string | null) => {
    const now = deps.now();
    const [list, plans] = await Promise.all([store.listAccounts(now), store.plans()]);
    const accountId = audience === 'account' ? (list.find((s) => s.account.email?.toLowerCase() === accountEmail)?.account.id ?? null) : null;
    const people = audience === 'account' && !accountId ? [] : audienceOf({ audience, accountId }, list, plans, now);
    return { accountId, people, count: people.length, emailable: people.filter(emailable).length };
  };

  app.post('/admin/api/notifications/audience', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const b = await body(c);
    const audience = typeof b.audience === 'string' ? (b.audience as Notice['audience']) : 'all';
    if (!Object.hasOwn(AUDIENCE_WORDS, audience)) return c.json({ error: { code: 'invalid_request', message: 'Public inconnu.' } }, 400);
    const email = typeof b.accountEmail === 'string' ? b.accountEmail.trim().toLowerCase() : null;
    const r = await reach(audience, email);
    return c.json({ count: r.count, emailable: r.emailable, found: audience !== 'account' || r.accountId !== null });
  });

  app.get('/admin/api/notifications', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const list = await store.notifications(50);
    const stats = await store.notificationStats(list.map((n) => n.id));
    const accounts = list.some((n) => n.accountId) ? await store.listAccounts(deps.now()) : [];
    const emailOf = (id: string | null) => (id ? (accounts.find((a) => a.account.id === id)?.account.email ?? id) : null);
    return c.json({
      email: Boolean(deps.notices.mailer),
      data: list.map((n) => ({
        ...n,
        audienceLabel: n.audience === 'account' ? (emailOf(n.accountId) ?? AUDIENCE_WORDS.account) : AUDIENCE_WORDS[n.audience],
        status: n.cancelledAt !== null ? 'cancelled' : n.sentAt !== null ? 'sent' : 'scheduled',
        stats: stats[n.id],
      })),
    });
  });

  app.post('/admin/api/notifications', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const now = deps.now();
    const b = await body(c);
    const test = b.test === true;
    const parsed = parseNoticeDraft(b, now);
    if (!parsed.ok) return c.json({ error: { code: 'invalid_request', message: parsed.message } }, 400);
    const d = parsed.draft;
    if (d.email && !deps.notices.mailer) return c.json({ error: { code: 'invalid_request', message: 'L’email n’est pas branché sur ce serveur.' } }, 400);
    // A test goes to the admin alone, now: their own account must exist.
    const r = await reach(test ? 'account' : d.audience, test ? actor.toLowerCase() : d.accountEmail);
    if ((test || d.audience === 'account') && !r.accountId) {
      return c.json({ error: { code: 'invalid_request', message: test ? 'Ton compte Baarali est introuvable : connecte-toi une fois à l’app avec cet email.' : 'Aucun client avec cet email.' } }, 400);
    }
    const notice: Notice = {
      id: `ntf_${randomUUID()}`,
      title: d.title, body: d.body, button: d.button, target: d.target, link: d.link,
      audience: test ? 'account' : d.audience,
      accountId: test || d.audience === 'account' ? r.accountId : null,
      app: d.app, email: d.email,
      sendAt: test ? now : d.sendAt,
      createdAt: now, createdBy: actor, sentAt: null, cancelledAt: null, test,
    };
    await store.saveNotification(notice);
    const due = notice.sendAt <= now;
    const result = due ? await sendNotice(deps.notices, notice) : { delivered: 0, emailed: 0 };
    if (!test) {
      const when = due ? 'envoyée' : `programmée pour le ${new Date(notice.sendAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
      await log(actor, 'notification', notice.accountId, `Notification ${when} (${AUDIENCE_WORDS[notice.audience]}) : « ${notice.title} »`);
    }
    return c.json({ id: notice.id, scheduled: !due, ...result }, 201);
  });

  app.post('/admin/api/notifications/:id/cancel', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const found = (await store.notifications(100)).find((n) => n.id === c.req.param('id'));
    if (!found) return c.json({ error: { code: 'not_found' } }, 404);
    // Atomic: a message leaving at this very moment is not cancelled after the fact.
    if (!(await store.cancelNotification(found.id, deps.now()))) return c.json({ changed: false });
    await log(actor, 'notification-cancelled', found.accountId, `Notification annulée : « ${found.title} »`);
    return c.json({ changed: true });
  });

  app.get('/admin/api/auto-messages', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const [on, counts] = await Promise.all([deps.auto.settings(), store.autoMessageCounts()]);
    return c.json({ email: Boolean(deps.notices.mailer), data: AUTO_KINDS.map((kind) => ({ kind, enabled: on[kind], sent: counts[kind] ?? 0 })) });
  });

  app.post('/admin/api/auto-messages/:kind', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const kind = c.req.param('kind') as AutoKind;
    if (!AUTO_KINDS.includes(kind)) return c.json({ error: { code: 'not_found' } }, 404);
    const b = await body(c);
    if (typeof b.enabled !== 'boolean') return c.json({ error: { code: 'invalid_request', message: 'enabled attendu.' } }, 400);
    await deps.auto.set(kind, b.enabled);
    await log(actor, 'auto-message', null, `Message automatique « ${AUTO_WORDS[kind]} » ${b.enabled ? 'activé' : 'coupé'}`);
    return c.json({ kind, enabled: b.enabled });
  });

  // The partner programme (partners.ts): who brings clients, what they earn,
  // what is paid to them, and the rules that decide it.
  const accountByEmail = async (email: string) =>
    (await store.listAccounts(deps.now())).find((s) => s.account.email?.toLowerCase() === email.toLowerCase())?.account ?? null;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  app.get('/admin/api/partners', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const [rules, summaries, payouts, plans, accounts, applications] = await Promise.all([
      deps.program.rules(),
      deps.program.summaries(),
      store.payouts(),
      store.plans(),
      store.listAccounts(deps.now()),
      store.partnerApplications(50),
    ]);
    const emailOf = (id: string | null) => (id ? (accounts.find((a) => a.account.id === id)?.account.email ?? null) : null);
    const nameOf = (id: string) => summaries.find((s) => s.partner.id === id)?.partner.name ?? id;
    return c.json({
      rules,
      plans: plans.filter((p) => p.category !== 'free').map((p) => ({ id: p.id, name: p.displayName })),
      methods: PAYOUT_METHODS.map((m) => ({ id: m, name: PAYOUT_WORDS[m] })),
      data: summaries
        .map(({ payableIds: _ids, ...s }) => ({ ...s, tierLabel: TIER_WORDS[s.tier], accountEmail: emailOf(s.partner.accountId) ?? s.partner.email, linked: s.partner.accountId !== null }))
        .sort((a, b) => b.paying - a.paying || b.signups - a.signups),
      payouts: payouts.slice(0, 30).map((p) => ({ ...p, partnerName: nameOf(p.partnerId), methodLabel: PAYOUT_WORDS[p.method] })),
      applications: applications.filter((a) => a.status === 'new'),
      email: Boolean(deps.notices.mailer),
    });
  });

  /** The fields the console sets; the code and the account are checked here. */
  const partnerFields = async (b: Record<string, unknown>, base: Partner): Promise<Partner | string> => {
    const next = { ...base };
    if ('name' in b) {
      const name = text(b.name, 60);
      if (!name) return 'Le nom est attendu.';
      next.name = name;
    }
    if ('code' in b) {
      const code = normalizeCode(b.code);
      if (!code) return 'Le code : de 3 à 16 lettres ou chiffres.';
      next.code = code;
    }
    if ('network' in b) next.network = text(b.network, 40);
    if ('city' in b) next.city = text(b.city, 40);
    if ('status' in b) {
      if (b.status !== 'active' && b.status !== 'paused') return 'État inconnu.';
      next.status = b.status;
    }
    if ('payoutMethod' in b) {
      if (b.payoutMethod !== null && !PAYOUT_METHODS.includes(b.payoutMethod as PayoutMethod)) return 'Moyen de paiement inconnu.';
      next.payoutMethod = (b.payoutMethod as PayoutMethod | null) ?? null;
    }
    if ('payoutNumber' in b) {
      const number = text(b.payoutNumber, 24);
      if (number && !/^\+?[\d ]{8,20}$/.test(number)) return 'Le numéro : des chiffres, avec l’indicatif (+226…).';
      next.payoutNumber = number;
    }
    if ('accountEmail' in b) {
      // Linked now when the account exists; otherwise at their first sign-in with it, proved.
      const email = text(b.accountEmail, 200)?.toLowerCase() ?? null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Cet email ne semble pas valide.';
      next.email = email;
      next.accountId = email ? ((await accountByEmail(email))?.id ?? null) : null;
    }
    return next;
  };

  app.post('/admin/api/partners', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const b = await body(c);
    if (!('name' in b) || !('code' in b)) return c.json({ error: { code: 'invalid_request', message: 'Le nom et le code sont attendus.' } }, 400);
    const blank: Partner = {
      id: `ptn_${randomUUID()}`, name: '', code: '', network: null, city: null, accountId: null, email: null, status: 'active',
      createdAt: deps.now(), createdBy: actor, payoutMethod: null, payoutNumber: null,
    };
    const partner = await partnerFields(b, blank);
    if (typeof partner === 'string') return c.json({ error: { code: 'invalid_request', message: partner } }, 400);
    const application = typeof b.applicationId === 'string' ? (await store.partnerApplications(200)).find((a) => a.id === b.applicationId && a.status === 'new') : undefined;
    if (b.applicationId !== undefined && !application) return c.json({ error: { code: 'not_found', message: 'Candidature introuvable ou déjà traitée.' } }, 404);
    if (!(await store.savePartner(partner))) return c.json({ error: { code: 'conflict', message: 'Ce code ou ce compte est déjà à un autre partenaire.' } }, 409);
    await log(actor, 'partner', partner.accountId, `Partenaire ajouté : ${partner.name} (${partner.code})`);
    // From an application: it is answered, and the creator gets their link by email.
    let emailed = false;
    if (application) {
      await store.decidePartnerApplication(application.id, 'accepted', deps.now(), actor);
      if (deps.notices.mailer) {
        const rules = await deps.program.rules();
        const gift = rules.giftPlanId ? ((await store.plan(rules.giftPlanId))?.displayName ?? null) : null;
        const mail = partnerWelcomeMail(partner, application.email, { site: siteOf(deps.publicUrl), app: deps.publicUrl }, rules, gift);
        emailed = (await deps.notices.mailer.send([mail])).accepted.length > 0;
      }
    }
    return c.json({ id: partner.id, code: partner.code, emailed }, 201);
  });

  app.post('/admin/api/partners/applications/:id/decline', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const found = (await store.partnerApplications(200)).find((a) => a.id === c.req.param('id'));
    if (!found) return c.json({ error: { code: 'not_found' } }, 404);
    if (!(await store.decidePartnerApplication(found.id, 'declined', deps.now(), actor))) return c.json({ changed: false });
    await log(actor, 'partner-application', null, `Candidature partenaire écartée : ${found.name} (${found.network})`);
    return c.json({ changed: true });
  });

  app.post('/admin/api/partners/rules', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const parsed = parseRules(await body(c), (await store.plans()).map((p) => p.id));
    if (!parsed.ok) return c.json({ error: { code: 'invalid_request', message: parsed.message } }, 400);
    const r = parsed.rules;
    await store.saveProgramRules(r, deps.now());
    const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;
    await log(actor, 'partner-rules', null, `Règles partenaires : ${pct(r.baseRate)} / ${pct(r.silverRate)} dès ${r.silverFrom} / ${pct(r.goldRate)} dès ${r.goldFrom}, ${r.months} mois, ${r.holdDays} j, seuil ${r.payoutMinXof} F, cadeau ${r.giftPlanId ? `${r.giftPlanId} ${r.giftDays} j` : 'aucun'}`);
    return c.json({ rules: r });
  });

  app.post('/admin/api/partners/:id', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const found = (await store.partners()).find((p) => p.id === c.req.param('id'));
    if (!found) return c.json({ error: { code: 'not_found' } }, 404);
    const partner = await partnerFields(await body(c), found);
    if (typeof partner === 'string') return c.json({ error: { code: 'invalid_request', message: partner } }, 400);
    if (!(await store.savePartner(partner))) return c.json({ error: { code: 'conflict', message: 'Ce code ou ce compte est déjà à un autre partenaire.' } }, 409);
    const what = partner.status !== found.status ? (partner.status === 'paused' ? 'mis en pause' : 'repris') : 'modifié';
    await log(actor, 'partner', partner.accountId, `Partenaire ${what} : ${partner.name} (${partner.code})`);
    return c.json({ id: partner.id });
  });

  app.post('/admin/api/partners/:id/payout', async (c) => {
    const actor = await api(c, true);
    if (actor instanceof Response) return actor;
    const b = await body(c);
    const result = await deps.program.payout(c.req.param('id'), typeof b.reference === 'string' ? b.reference : '', actor);
    if (!result.ok) return c.json({ error: { code: 'invalid_request', message: result.message } }, 400);
    const p = result.payout;
    const partner = (await store.partners()).find((x) => x.id === p.partnerId);
    await log(actor, 'partner-payout', partner?.accountId ?? null, `Paiement partenaire : ${p.amountXof} F à ${partner?.name ?? p.partnerId} par ${PAYOUT_WORDS[p.method]} (${p.reference})`);
    return c.json({ payout: p });
  });

  app.get('/admin/api/journal', async (c) => {
    const actor = await api(c, false);
    if (actor instanceof Response) return actor;
    const [entries, accounts] = await Promise.all([store.adminLog(200), store.listAccounts(deps.now())]);
    const emailOf = (id: string | null) => (id ? (accounts.find((a) => a.account.id === id)?.account.email ?? id) : null);
    return c.json({ data: entries.map((e) => ({ ...e, account: emailOf(e.accountId) })) });
  });
}

const AUTO_WORDS: Record<AutoKind, string> = {
  limit: 'Limite atteinte',
  media_low: 'Crédits médias presque épuisés',
  gift_ending: 'Forfait offert qui se termine',
  inactive: 'Client inactif depuis 14 jours',
  welcome: 'Bienvenue',
};

const INSTANCE_WORDS = { wake: 'Instance réveillée', update: 'Instance mise à jour', restart: 'Instance redémarrée' } as const;

async function act(instances: Instances, record: InstanceRecord, action: 'wake' | 'update' | 'restart'): Promise<boolean> {
  if (action === 'wake') {
    await instances.wake(record);
    return true;
  }
  if (action === 'update') return instances.updateNow(record);
  await instances.restart(record);
  return true;
}

/** `registry.fly.io/baarali-instances:v11` → `v11`. */
function imageLabel(image: string | null): string | null {
  if (!image) return null;
  const tag = image.split(':').at(-1);
  return tag && !tag.includes('/') ? tag : image;
}
