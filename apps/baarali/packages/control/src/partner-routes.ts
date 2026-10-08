import { randomUUID } from 'node:crypto';
import type { Env, Hono } from 'hono';
import { AUTH_BASE_PATH, type BaaraliAuth } from './auth.js';
import type { HomeData } from './home-page.js';
import { html } from './html.js';
import type { PartnerProgram } from './partner-program.js';
import { AUDIENCE_SIZES, NETWORKS, PARTNER_SPACE_PATH, PARTNERS_PATH, partnerSpacePage, partnersPage } from './partner-page.js';
import { PAYOUT_METHODS, PAYOUT_WORDS, type Commission, type Partner, type PartnerApplication, type PayoutMethod } from './partners.js';
import type { ControlStore } from './store.js';

// The partner programme's public side (partner-page.ts): the page that
// invites creators and takes their application, and each partner's own
// space, opened by their sign-in.

export interface PartnerRouteDeps {
  store: ControlStore;
  program: PartnerProgram;
  auth?: BaaraliAuth;
  home?: HomeData;
  publicUrl: string;
  now: () => number;
}

/** The public site's address: the app's host without `app.` (https://app.baarali.com → https://baarali.com). */
export function siteOf(publicUrl: string): string {
  const url = new URL(publicUrl);
  return `${url.protocol}//${url.host.replace(/^app\./, '')}`;
}

/** At most this many applications per address and hour: the form is open to anyone. */
const APPLY_PER_HOUR = 5;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

type ApplyResult = { ok: true; value: Omit<PartnerApplication, 'id' | 'createdAt' | 'status' | 'decidedAt' | 'decidedBy'> } | { ok: false; message: string };

export function parseApplication(b: Record<string, unknown>): ApplyResult {
  const text = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  const name = text('name', 60);
  const email = text('email', 200).toLowerCase();
  const profile = text('profile', 300);
  const phone = text('phone', 24);
  if (name.length < 2) return { ok: false, message: 'Votre nom est attendu.' };
  if (!EMAIL.test(email)) return { ok: false, message: 'Cet email ne semble pas valide.' };
  if (!NETWORKS.includes(b.network as (typeof NETWORKS)[number])) return { ok: false, message: 'Choisissez votre réseau.' };
  if (!/^https?:\/\/[^\s]+\.[^\s]+$/.test(profile)) return { ok: false, message: 'Le lien vers votre profil commence par https://' };
  if (!AUDIENCE_SIZES.includes(b.audience as (typeof AUDIENCE_SIZES)[number])) return { ok: false, message: 'Choisissez la taille de votre public.' };
  if (phone && !/^\+?[\d ]{8,20}$/.test(phone)) return { ok: false, message: 'Le téléphone : des chiffres, avec l’indicatif.' };
  return {
    ok: true,
    value: {
      name,
      email,
      phone: phone || null,
      network: b.network as string,
      profile,
      audience: b.audience as string,
      city: text('city', 60) || null,
      message: text('message', 500) || null,
    },
  };
}

/** A month's earnings, as the partner reads them. */
export function monthsOf(commissions: Commission[], now: number) {
  const byMonth = new Map<string, Commission[]>();
  for (const c of commissions) {
    const month = new Date(c.paidAt).toISOString().slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), c]);
  }
  return [...byMonth]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({
      month,
      clients: new Set(list.map((c) => c.accountId)).size,
      earnedXof: list.reduce((s, c) => s + c.commissionXof, 0),
      state: list.every((c) => c.payoutId !== null) ? 'paid' : list.every((c) => c.payoutId !== null || c.payableAt <= now) ? 'ready' : 'pending',
      payableAt: Math.max(...list.map((c) => c.payableAt)),
    }));
}

export function partnerRoutes<E extends Env>(app: Hono<E>, deps: PartnerRouteDeps): void {
  const site = siteOf(deps.publicUrl);
  const giftName = async () => {
    const rules = await deps.program.rules();
    return rules.giftPlanId ? ((await deps.store.plan(rules.giftPlanId))?.displayName ?? null) : null;
  };

  if (deps.home) {
    const home = deps.home;
    const essentiel = home.offers.find((o) => o.id === 'essentiel');
    const essentielXof = essentiel?.billing.kind === 'paid' ? (essentiel.billing.prices.find((p) => p.currency === 'XOF')?.amount ?? 0) : 0;
    app.get(PARTNERS_PATH, async (c) => {
      const data = { rules: await deps.program.rules(), essentielXof, giftPlan: await giftName() };
      return html((nonce) => partnersPage(data, { lang: c.req.header('accept-language') ?? null, nonce }));
    });

    const recent = new Map<string, number[]>();
    app.post(`${PARTNERS_PATH}/candidature`, async (c) => {
      const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      // A field people never see: what fills it is a robot, told it worked.
      if (typeof b.website === 'string' && b.website) return c.json({ ok: true });
      const now = deps.now();
      const ip = c.req.header('fly-client-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
      const times = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
      if (times.length >= APPLY_PER_HOUR) return c.json({ error: { code: 'rate_limited', message: 'Trop d’envois d’ici. Réessayez dans une heure.' } }, 429);
      const parsed = parseApplication(b);
      if (!parsed.ok) return c.json({ error: { code: 'invalid_request', message: parsed.message } }, 400);
      recent.set(ip, [...times, now]);
      if (recent.size > 5000) recent.clear();
      const added = await deps.store.addPartnerApplication({ ...parsed.value, id: `app_${randomUUID()}`, createdAt: now, status: 'new', decidedAt: null, decidedBy: null });
      if (!added) return c.json({ error: { code: 'conflict', message: 'Une candidature avec cet email attend déjà notre réponse.' } }, 409);
      return c.json({ ok: true }, 201);
    });
  }

  if (!deps.auth) return;
  const auth = deps.auth;
  const partnerOf = async (headers: Headers): Promise<{ partner: Partner | null; email: string | null } | null> => {
    const user = await auth.sessionUser(headers);
    if (!user) return null;
    const account = await deps.store.accountForUser(user.id);
    if (!account) return { partner: null, email: user.email };
    let partner = await deps.store.partnerForAccount(account.id);
    // Accepted before they had an account: their first sign-in with that email, proved, links it.
    const email = user.email?.toLowerCase();
    if (!partner && email && user.emailVerified) {
      const invited = (await deps.store.partners()).find((p) => p.accountId === null && p.email === email);
      if (invited && (await deps.store.savePartner({ ...invited, accountId: account.id }))) partner = { ...invited, accountId: account.id };
    }
    return { partner, email: user.email };
  };

  app.get(PARTNER_SPACE_PATH, async (c) => {
    if (!(await auth.sessionUser(c.req.raw.headers))) return c.redirect(`${AUTH_BASE_PATH}/sign-in#partenaire`, 302);
    return html((nonce) => partnerSpacePage({ nonce, publicSite: site }));
  });

  app.get(`${PARTNER_SPACE_PATH}/api`, async (c) => {
    const who = await partnerOf(c.req.raw.headers);
    if (!who) return c.json({ error: { code: 'unauthorized' } }, 401);
    if (!who.partner) return c.json({ partner: null });
    const partner = who.partner;
    const [summary, rules, commissions, gift] = await Promise.all([
      deps.program.summaries().then((all) => all.find((s) => s.partner.id === partner.id)!),
      deps.program.rules(),
      deps.store.commissions(partner.id),
      giftName(),
    ]);
    return c.json({
      partner: { name: partner.name, code: partner.code, status: partner.status, payoutMethod: partner.payoutMethod, payoutNumber: partner.payoutNumber },
      rules,
      giftPlan: gift,
      clicks: summary.clicks,
      signups: summary.signups,
      paying: summary.paying,
      tier: summary.tier,
      payableXof: summary.payableXof,
      pendingXof: summary.pendingXof,
      paidXof: summary.paidXof,
      months: monthsOf(commissions, deps.now()),
    });
  });

  app.post(`${PARTNER_SPACE_PATH}/api/paiement`, async (c) => {
    // A form elsewhere cannot set this header: no cross-site write.
    if (c.req.header('x-baarali-partner') !== '1') return c.json({ error: { code: 'forbidden' } }, 403);
    const who = await partnerOf(c.req.raw.headers);
    if (!who) return c.json({ error: { code: 'unauthorized' } }, 401);
    if (!who.partner) return c.json({ error: { code: 'not_found' } }, 404);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const method = b.method === null ? null : (b.method as PayoutMethod);
    if (method !== null && !PAYOUT_METHODS.includes(method)) return c.json({ error: { code: 'invalid_request', message: 'Choisissez un moyen de paiement.' } }, 400);
    const number = typeof b.number === 'string' ? b.number.trim() : '';
    if (method && !/^\+?[\d ]{8,20}$/.test(number)) return c.json({ error: { code: 'invalid_request', message: 'Le numéro : des chiffres, avec l’indicatif (+226…).' } }, 400);
    await deps.store.savePartner({ ...who.partner, payoutMethod: method, payoutNumber: method ? number : null });
    // Where the money goes is kept in the journal: a changed number is seen before the next payout.
    await deps.store.appendAdminLog({
      at: deps.now(),
      actor: `partenaire ${who.email ?? who.partner.code}`,
      action: 'partner-payout-method',
      accountId: who.partner.accountId,
      detail: `Paiement de ${who.partner.name} : ${method ? `${PAYOUT_WORDS[method]} ${number}` : 'retiré'}`,
    });
    return c.json({ ok: true });
  });
}
