import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { buildApiConfig } from './config.js';
import { OPENROUTER_BASE, proxyLlm, type ProxyDeps } from './llm-proxy.js';
import { ModelCatalog, UpstreamModels } from './model-catalog.js';
import { isAdmin, topUpMedia, type SoldPack } from './admin.js';
import { ANNOUNCEMENT_EVENTS, bannerFor, publicBanner, reaches } from './announcements.js';
import { mountAdminConsole } from './admin-console.js';
import { AutoMessages } from './auto-messages.js';
import { PartnerProgram } from './partner-program.js';
import { partnerRoutes } from './partner-routes.js';
import { dayWords, REDEEM_WINDOW_MS, refCookie } from './partners.js';
import { emailTarget, NOTICE_EVENTS, NoticeDispatcher, publicNotice, type Mailer, type NoticeLinks } from './notifications.js';
import { asset } from './assets.js';
import { AUTH_BASE_PATH, type BaaraliAuth } from './auth.js';
import { homePage, type HomeData } from './home-page.js';
import { planOffers, PRICING_PATH, pricingPage } from './pricing-page.js';
import { html } from './html.js';
import { LEGAL_PATHS, legalPage, type LegalDoc } from './legal-page.js';
import { GATEWAY_PATH, type Gateway } from './gateway.js';
import { InstanceUnavailable, type Instances } from './instances.js';
import { createGeneration, getGeneration, listMediaModels, mediaBalance, mediaHistory } from './media-route.js';
import { advance, budgetsForWeek, gauges, initialState } from './quota.js';
import { hashToken, type Account, type ControlStore } from './store.js';
import { speak, transcribe, type VoiceDeps } from './voice.js';

export type ControlDeps = ProxyDeps & {
  /** Unset: media generation is off (503). */
  pixazoKey?: string;
  pixazoBase?: string;
  /** Unset: voice answers 503 (voice.ts). */
  deepgramKey?: string;
  deepgramBase?: string;
  /** Unset: the Pro plans read with Aura-2 too (voice.ts). */
  elevenLabs?: VoiceDeps['elevenLabs'];
  /** The media credit packs on sale (pricing.ts, packCredits). */
  mediaPacks: SoldPack[];
  /** SHA-256 of the operator token; unset: /v1/admin answers 404. */
  adminTokenHash?: string;
  /** Who may open the admin console (/admin), lowercase; empty or unset: it does not exist. */
  adminEmails?: string[];
  /** The home page with the prices (baarali.com); unset: `/` answers 404. */
  home?: HomeData;
  /** The sign-in server; unset: only instance tokens open /v1 (phase 0). */
  auth?: BaaraliAuth;
  /** One instance per account and the door to it; unset: no device can connect. */
  instances?: Instances;
  gateway?: Gateway;
  /**
   * Our Spaces server (Harbor), told to the apps by /v1/config. Only with
   * the sign-in server: Harbor trusts the tokens it signs, no others.
   */
  spacesUrl?: string;
  /** Unset: the console's notifications are read in the app only. */
  mailer?: Mailer;
  /** Signs the links of the emails (click, open, opt-out); unset with the mailer. */
  noticeLinks?: NoticeLinks;
  /** Sends the due notifications; main.ts also runs it every minute. */
  notices?: NoticeDispatcher;
  /** The automatic messages (limit reached, welcome…); main.ts shares it with the dispatcher. */
  auto?: AutoMessages;
  /** The partner programme; main.ts shares it with the sign-in server. */
  program?: PartnerProgram;
};

type Env = { Variables: { account: Account } };

function bearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Each sign-in on an app adds one; old ones are revoked from the list. */
const MAX_DEVICES = 10;

const publicDevice = (d: { id: string; name: string; createdAt: number; lastSeenAt: number | null; revokedAt: number | null }) => ({
  id: d.id,
  name: d.name,
  created_at: new Date(d.createdAt).toISOString(),
  last_seen_at: d.lastSeenAt === null ? null : new Date(d.lastSeenAt).toISOString(),
  revoked_at: d.revokedAt === null ? null : new Date(d.revokedAt).toISOString(),
});

/** An instance token, or an access token our sign-in server issued; also the voice WebSocket's door (main.ts). */
export function accountResolver(store: ControlStore, auth?: BaaraliAuth) {
  return async (token: string): Promise<Account | null> => {
    const byToken = await store.accountByToken(token);
    if (byToken || !auth) return byToken;
    const userId = await auth.userIdForAccessToken(token);
    return userId ? store.accountForUser(userId) : null;
  };
}

/** A code is checked as it is typed: enough for typing, not for guessing. */
const CODE_CHECKS_PER_MINUTE = 30;

const REDEEM_WORDS = {
  unknown: 'Ce code n’existe pas. Vérifiez l’orthographe.',
  paused: 'Ce code n’est plus actif.',
  own: 'C’est votre propre code partenaire.',
  already: 'Un code partenaire est déjà lié à votre compte.',
  late: 'Un code partenaire se saisit dans les 7 jours qui suivent l’inscription.',
} as const;

export function createApp(deps: ControlDeps) {
  // One cache of the console's model settings, for the proxy and the console (model-catalog.ts).
  const models = deps.models ?? new ModelCatalog(deps.store, deps.now);
  // OpenRouter's list, for the console and to reroute a withdrawn model (llm-proxy.ts).
  const upstreamModels =
    deps.upstreamModels ??
    new UpstreamModels(
      () => deps.fetch(`${deps.upstreamBase ?? OPENROUTER_BASE}/models`, { headers: { authorization: `Bearer ${deps.openRouterKey}` } }),
      deps.now,
    );
  const app = new Hono<Env>();
  const dispatch = { store: deps.store, now: deps.now, mailer: deps.mailer, links: deps.noticeLinks };
  const auto = deps.auto ?? new AutoMessages(dispatch);
  const program = deps.program ?? new PartnerProgram({ store: deps.store, now: deps.now, auto });
  auto.welcomeGift ??= async (accountId) => {
    const gift = await program.openGiftOf(accountId);
    const plan = gift ? await deps.store.plan(gift.planId) : null;
    return gift ? `Le forfait ${plan?.displayName ?? gift.planId} vous est offert jusqu’au ${dayWords(gift.endsAt)}.` : null;
  };
  const notices = deps.notices ?? new NoticeDispatcher(dispatch, [auto, program]);

  app.get('/health', (c) => c.json({ ok: true }));

  // The machine sleeps when idle (fly.toml): the first requests after waking
  // send what came due meanwhile. Never awaited: nobody waits for it.
  app.use('*', async (_c, next) => {
    void notices.run();
    await next();
  });

  if (deps.home) {
    const home = deps.home;
    app.get('/', async (c) => {
      // The app's « Upgrade » buttons open `${appUrl}?intent=upgrade` (renderer
      // sidebar, billing dialog, settings): the plans are what they came for.
      if (c.req.query('intent') === 'upgrade') return c.redirect(PRICING_PATH, 302);
      // A partner's link: counted, remembered for the sign-up (partners.ts).
      const partner = c.req.query('p') ? await program.click(c.req.query('p')) : null;
      const rules = await program.rules();
      const gifted = partner && rules.giftPlanId ? await deps.store.plan(rules.giftPlanId) : null;
      // A paused partner's link still sends people here, but earns nothing and offers nothing.
      const active = partner?.status === 'active' ? partner : null;
      const referral = active ? { partner: active.name, gift: gifted ? { plan: gifted.displayName, days: rules.giftDays } : null } : null;
      const page = html((nonce) => homePage(home, { lang: c.req.header('accept-language') ?? null, nonce, referral }));
      if (active) page.headers.set('set-cookie', refCookie(active.code, rules, deps.publicUrl));
      return page;
    });
    app.get(PRICING_PATH, (c) => html((nonce) => pricingPage(home, { lang: c.req.header('accept-language') ?? null, nonce })));
    // The same plans, for the app's own window (no browser: the account lives in the app).
    app.get('/v1/plans', (c) => c.json(planOffers(home, c.req.query('lang') ?? c.req.header('accept-language') ?? null)));
    for (const doc of Object.keys(LEGAL_PATHS) as LegalDoc[]) {
      app.get(LEGAL_PATHS[doc], (c) => html((nonce) => legalPage(doc, { lang: c.req.header('accept-language') ?? null, nonce, downloads: Boolean(home.downloadBase) })));
    }
    app.get('/assets/:name', (c) => {
      const file = asset(c.req.param('name'));
      if (!file) return c.notFound();
      // Names never change content: a new font gets a new name.
      return c.body(file.body, 200, { 'content-type': file.type, 'cache-control': 'public, max-age=31536000, immutable' });
    });
  }

  // Unauthenticated, like the Rowboat Labs route: core reads it before login.
  app.get('/v1/config', async (c) =>
    c.json(buildApiConfig({ publicUrl: deps.publicUrl, spacesUrl: deps.auth ? deps.spacesUrl : undefined, voice: Boolean(deps.deepgramKey) }, await deps.store.plans())),
  );

  // Where core looks for its OAuth server (`${supabaseUrl}/auth/v1`).
  if (deps.auth) {
    const auth = deps.auth;
    app.all(`${AUTH_BASE_PATH}/*`, (c) => auth.handle(c.req.raw));
  }

  partnerRoutes(app, { store: deps.store, program, auth: deps.auth, home: deps.home, publicUrl: deps.publicUrl, now: deps.now });

  const accountFor = accountResolver(deps.store, deps.auth);

  const authed = createMiddleware<Env>(async (c, next) => {
    const token = bearer(c.req.header('authorization'));
    const account = token ? await accountFor(token) : null;
    if (!account) return c.json({ error: { code: 'unauthorized' } }, 401);
    // Suspended from the admin console: nothing is served, nothing is spent.
    if (account.suspendedAt) return c.json({ error: { code: 'account_suspended' } }, 403);
    c.set('account', account);
    await next();
  });
  app.use('/v1/me', authed);
  app.use('/v1/llm/*', authed);
  app.use('/v1/media/*', authed);
  app.use('/v1/spaces/*', authed);
  app.use('/v1/voice/*', authed);
  app.use('/v1/announcement', authed);
  app.use('/v1/announcement/*', authed);
  app.use('/v1/notifications', authed);
  app.use('/v1/notifications/*', authed);
  app.use('/v1/codes/*', authed);

  // A cloud instance trades its token for a Spaces one (core
  // auth/spaces-exchange.ts): Spaces verify only our signed JWTs.
  app.post('/v1/spaces/token', async (c) => {
    const traded = deps.auth && deps.spacesUrl ? await deps.auth.spacesTokenFor(c.get('account').id) : null;
    if (!traded) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json({ access_token: traded.token, token_type: 'Bearer', expires_in: traded.expiresIn });
  });

  // Same body as the Rowboat Labs /v1/me (core billing/billing.ts reads it).
  // Session → `daily`, week → `monthly`: see architecture §3.5.
  app.get('/v1/me', async (c) => {
    const account = c.get('account');
    const plan = await deps.store.plan(account.planId);
    const state = (await deps.store.quotaState(account.id)) ?? initialState(account.createdAt);
    const now = deps.now();
    const g = gauges(state, budgetsForWeek(plan?.weekCredits ?? 0), now);
    // A session opens with its first message: before that, it ends nowhere.
    const sessionOpen = advance(state, now).sessionStart !== null;
    const bucket = ({ sanctionedCredits, usedCredits, availableCredits }: typeof g.week) => ({
      sanctionedCredits,
      usedCredits,
      availableCredits,
    });
    // An admin's app links to the console (03/10/2026): only a hint, the
    // console itself checks the signed-in, verified email again.
    const admin = !!account.email && (deps.adminEmails ?? []).includes(account.email.toLowerCase());
    return c.json({
      user: { id: account.id, email: account.email },
      ...(admin ? { admin: { url: `${deps.publicUrl}/admin` } } : {}),
      billing: {
        planId: plan ? plan.id : null,
        status: plan ? 'active' : null,
        trialExpiresAt: null,
        usage: {
          monthly: { ...bucket(g.week), resetsAt: new Date(g.week.resetsAt).toISOString() },
          daily: {
            ...bucket(g.session),
            usageDay: new Date(g.session.resetsAt).toISOString(),
            ...(sessionOpen ? { resetsAt: new Date(g.session.resetsAt).toISOString() } : {}),
          },
          store: { availableCredits: 0 },
        },
      },
    });
  });

  app.all('/v1/llm/*', (c) => proxyLlm({ ...deps, models, upstreamModels, auto }, c.get('account'), c.req.raw));

  // A whole recording to text (voice.ts): the phone's push-to-talk, the apps' file transcription.
  app.post('/v1/voice/transcribe', (c) =>
    deps.deepgramKey
      ? transcribe({ ...deps, deepgramKey: deps.deepgramKey }, c.get('account'), c.req.raw)
      : c.json({ error: { code: 'voice_unavailable', message: 'Voice is not configured' } }, 503),
  );
  // Reading aloud (voice.ts); listening is the WebSocket of main.ts.
  app.post('/v1/voice/text-to-speech/:voiceId', (c) =>
    deps.deepgramKey
      ? speak({ ...deps, deepgramKey: deps.deepgramKey }, c.get('account'), c.req.param('voiceId'), c.req.raw)
      : c.json({ error: { code: 'voice_unavailable', message: 'Voice is not configured' } }, 503),
  );
  // The banner at the top of the Chat (07/10/2026): the newest one meant
  // for the account's plan, unless the person closed it.
  app.get('/v1/announcement', async (c) => {
    const account = c.get('account');
    const plan = await deps.store.plan(account.planId);
    const now = deps.now();
    const top = bannerFor(await deps.store.announcements(20), plan, () => false, now);
    if (!top || (await deps.store.announcementEventsOf(top.id, account.id)).includes('dismiss')) return c.json({ announcement: null });
    return c.json({ announcement: publicBanner(top) });
  });

  // Seen, followed or closed: counted once per person and kind.
  app.post('/v1/announcement/:id/events', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { kind?: unknown } | null;
    const kind = body?.kind;
    if (typeof kind !== 'string' || !(ANNOUNCEMENT_EVENTS as readonly string[]).includes(kind)) {
      return c.json({ error: { code: 'invalid_request', message: `kind: one of ${ANNOUNCEMENT_EVENTS.join(', ')}` } }, 400);
    }
    // Only an announcement meant for this account's plan: the console's
    // figures must not count people it was never shown to.
    const account = c.get('account');
    const found = (await deps.store.announcements(50)).find((a) => a.id === c.req.param('id'));
    if (!found || !reaches(found, await deps.store.plan(account.planId))) return c.json({ error: { code: 'not_found' } }, 404);
    const counted = await deps.store.recordAnnouncementEvent(found.id, account.id, kind as (typeof ANNOUNCEMENT_EVENTS)[number], deps.now());
    return c.json({ counted });
  });

  // A partner's code typed in the app, soon after signing up (partners.ts):
  // the phone app signs up without the site's cookie.
  // Whether the app still offers the field: within the window, no partner yet.
  // Once linked, the partner's name, so the account says who recommended it.
  app.get('/v1/codes/partner', async (c) => {
    const account = c.get('account');
    const referral = await deps.store.referralOf(account.id);
    const partner = referral ? (await deps.store.partners()).find((p) => p.id === referral.partnerId) : undefined;
    const until = account.createdAt + REDEEM_WINDOW_MS;
    const open = !referral && deps.now() < until;
    // The plan a code brings, as attach() would offer it: to someone on the free plan only.
    const rules = await program.rules();
    const [current, gifted] = open && rules.giftPlanId ? await Promise.all([deps.store.plan(account.planId), deps.store.plan(rules.giftPlanId)]) : [null, null];
    const gift = gifted && (!current || current.category === 'free') ? { plan: gifted.displayName, plan_id: gifted.id, days: rules.giftDays } : null;
    // The plan offered, while it runs: the account shows its days.
    const running = await program.openGiftOf(account.id);
    const runningPlan = running ? await deps.store.plan(running.planId) : null;
    return c.json({
      partner: partner?.name ?? null,
      can_redeem: open,
      until: open ? new Date(until).toISOString() : null,
      gift,
      running: running && account.planId === running.planId
        ? { plan: runningPlan?.displayName ?? running.planId, starts_at: new Date(running.startsAt).toISOString(), ends_at: new Date(running.endsAt).toISOString() }
        : null,
    });
  });

  // A code checked as it is typed: who it belongs to, before it is applied.
  // Partners' names are public (their link shows them); still, a few a minute.
  const checks = new Map<string, number[]>();
  app.get('/v1/codes/check', async (c) => {
    const account = c.get('account');
    const now = deps.now();
    const times = (checks.get(account.id) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= CODE_CHECKS_PER_MINUTE) return c.json({ error: { code: 'rate_limited', message: 'Trop d’essais. Réessayez dans une minute.' } }, 429);
    checks.set(account.id, [...times, now]);
    if (checks.size > 5000) checks.clear();
    const result = await program.check(account, c.req.query('code'), 'code');
    if (!result.ok) return c.json({ error: { code: result.reason, message: REDEEM_WORDS[result.reason] } }, 400);
    const { partner } = result;
    return c.json({ partner: { name: partner.name, network: partner.network, city: partner.city } });
  });

  app.post('/v1/codes/redeem', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    const account = c.get('account');
    const result = await program.attach(account, body.code, 'code');
    if (!result.ok) return c.json({ error: { code: result.reason, message: REDEEM_WORDS[result.reason] } }, 400);
    const plan = result.gift ? await deps.store.plan(result.gift.planId) : null;
    return c.json({
      partner: result.partner.name,
      gift: result.gift ? { plan: plan?.displayName ?? result.gift.planId, ends_at: new Date(result.gift.endsAt).toISOString() } : null,
    });
  });

  // The console's messages for this person (07/10/2026): the bell on the
  // Mac, the inbox on the phone. Newest first, with how many are unread.
  app.get('/v1/notifications', async (c) => {
    // Just woken: what came due while asleep is sent before the inbox is read.
    await notices.run();
    const list = await deps.store.inbox(c.get('account').id, 30);
    return c.json({ data: list.map(({ notice, delivery }) => publicNotice(notice, delivery)), unread: list.filter((x) => x.delivery.readAt === null).length });
  });

  app.post('/v1/notifications/read-all', async (c) => {
    const account = c.get('account');
    const now = deps.now();
    let changed = 0;
    for (const { delivery } of await deps.store.inbox(account.id, 30)) {
      if (delivery.readAt === null && (await deps.store.recordNotificationEvent(delivery.noticeId, account.id, 'read', now))) changed++;
    }
    return c.json({ changed });
  });

  // Read or followed: only the person's own copy, counted the first time.
  app.post('/v1/notifications/:id/events', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { kind?: unknown } | null;
    const kind = body?.kind;
    if (typeof kind !== 'string' || !(NOTICE_EVENTS as readonly string[]).includes(kind)) {
      return c.json({ error: { code: 'invalid_request', message: `kind: one of ${NOTICE_EVENTS.join(', ')}` } }, 400);
    }
    const account = c.get('account');
    const mine = (await deps.store.inbox(account.id, 100)).some((x) => x.notice.id === c.req.param('id'));
    if (!mine) return c.json({ error: { code: 'not_found' } }, 404);
    const counted = await deps.store.recordNotificationEvent(c.req.param('id'), account.id, kind as (typeof NOTICE_EVENTS)[number], deps.now());
    return c.json({ counted });
  });

  // The links of the emails, signed for one person (notifications.ts NoticeLinks).
  if (deps.noticeLinks) {
    const links = deps.noticeLinks;
    const copyOf = async (token: string) => {
      const who = links.read(token);
      if (!who) return null;
      const notice = (await deps.store.notifications(200)).find((n) => n.id === who.noticeId);
      return notice ? { ...who, notice } : null;
    };
    // The button: counted, then on to where it leads.
    app.get('/n/c/:token', async (c) => {
      const copy = await copyOf(c.req.param('token'));
      if (!copy) return c.redirect(deps.publicUrl, 302);
      await deps.store.recordNotificationEvent(copy.noticeId, copy.accountId, 'click', deps.now());
      return c.redirect(emailTarget(copy.notice, deps.publicUrl, PRICING_PATH), 302);
    });
    // Opened: a one-pixel image, the same for everyone.
    app.get('/n/o/:token', async (c) => {
      const copy = await copyOf(c.req.param('token'));
      if (copy) await deps.store.recordNotificationEvent(copy.noticeId, copy.accountId, 'read', deps.now());
      return c.body(PIXEL, 200, { 'content-type': 'image/gif', 'cache-control': 'no-store' });
    });
    // Opting out: a page with a button (a link checker opening the URL must
    // not unsubscribe anyone), and the mail apps' one-click POST (RFC 8058).
    app.get('/n/u/:token', async (c) => {
      const copy = await copyOf(c.req.param('token'));
      return html((nonce) => optOutPage({ nonce, ok: Boolean(copy), done: false }));
    });
    app.post('/n/u/:token', async (c) => {
      const copy = await copyOf(c.req.param('token'));
      if (copy) await deps.store.setEmailOptOut(copy.accountId, deps.now());
      return html((nonce) => optOutPage({ nonce, ok: Boolean(copy), done: Boolean(copy) }));
    });
  }

  app.get('/v1/media/models', (c) => listMediaModels({ ...deps, models }, c.get('account')));
  app.get('/v1/media/balance', (c) => mediaBalance(deps, c.get('account')));
  app.get('/v1/media/history', (c) => mediaHistory(deps, c.get('account')));
  app.get('/v1/media/packs', (c) => c.json({ data: deps.mediaPacks }));
  app.post('/v1/media/generations', (c) => createGeneration({ ...deps, models, auto }, c.get('account'), c.req.raw));
  app.get('/v1/media/generations/:id', (c) => getGeneration(deps, c.get('account'), c.req.param('id')));

  // Devices (security §2): only a signed-in person adds one, with the
  // access token of their sign-in, never an instance with its own token.
  if (deps.auth && deps.instances) {
    const auth = deps.auth;
    const instances = deps.instances;
    const person = createMiddleware<Env>(async (c, next) => {
      const token = bearer(c.req.header('authorization'));
      // The desktop's OAuth access token, or the phone app's session.
      const userId = token ? (await auth.userIdForAccessToken(token)) ?? (await auth.userIdForSession(token)) : null;
      const account = userId ? await deps.store.accountForUser(userId) : null;
      if (!account) return c.json({ error: { code: 'unauthorized' } }, 401);
      if (account.suspendedAt) return c.json({ error: { code: 'account_suspended' } }, 403);
      c.set('account', account);
      await next();
    });
    app.use('/v1/devices', person);
    app.use('/v1/devices/*', person);
    app.use('/v1/session/*', person);

    // The phone app's Spaces token, renewed with its session (it has no
    // OAuth refresh token: it signed in with its own screens).
    app.post('/v1/session/spaces-token', async (c) => {
      const traded = deps.spacesUrl ? await auth.spacesTokenFor(c.get('account').id) : null;
      if (!traded) return c.json({ error: { code: 'not_found' } }, 404);
      return c.json({ access_token: traded.token, token_type: 'Bearer', expires_in: traded.expiresIn });
    });

    // The app calls this once signed in: the instance is created the first
    // time, and the device gets the key it will show the gateway.
    app.post('/v1/devices', async (c) => {
      const account = c.get('account');
      const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Appareil';
      try {
        await instances.ensure(account);
      } catch (err) {
        if (err instanceof InstanceUnavailable) {
          return c.json({ error: { code: err.problem === 'full' ? 'instances_full' : 'instances_off' } }, 503);
        }
        console.error('[control] instance creation failed', err);
        return c.json({ error: { code: 'instance_unavailable' } }, 503);
      }
      const active = (await deps.store.devices(account.id)).filter((d) => d.revokedAt === null);
      if (active.length >= MAX_DEVICES) return c.json({ error: { code: 'too_many_devices' } }, 409);
      const key = `bdk_${randomBytes(32).toString('base64url')}`;
      const device = { id: `dev_${randomUUID()}`, accountId: account.id, name, createdAt: deps.now(), lastSeenAt: null, revokedAt: null };
      await deps.store.addDevice(device, hashToken(key));
      return c.json({ device: publicDevice(device), server: { url: `${deps.publicUrl}${GATEWAY_PATH}`, key } }, 201);
    });

    app.get('/v1/devices', async (c) => c.json({ data: (await deps.store.devices(c.get('account').id)).map(publicDevice) }));

    app.delete('/v1/devices/:id', async (c) => {
      const revoked = await deps.store.revokeDevice(c.get('account').id, c.req.param('id'), deps.now());
      return revoked ? c.body(null, 204) : c.json({ error: { code: 'not_found' } }, 404);
    });
  }

  if (deps.gateway) {
    const gateway = deps.gateway;
    app.all(GATEWAY_PATH, (c) => gateway.http(c.req.raw));
    app.all(`${GATEWAY_PATH}/*`, (c) => gateway.http(c.req.raw));
  }

  mountAdminConsole(app, {
    store: deps.store,
    auth: deps.auth,
    adminEmails: deps.adminEmails ?? [],
    adminTokenHash: deps.adminTokenHash,
    mediaPacks: deps.mediaPacks,
    instances: deps.instances,
    models,
    upstreamModels,
    now: deps.now,
    notices: dispatch,
    auto,
    program,
    publicUrl: deps.publicUrl,
  });

  app.post('/v1/admin/media-credits', async (c) => {
    if (!isAdmin({ ...deps, packs: deps.mediaPacks }, bearer(c.req.header('authorization')))) {
      return c.json({ error: { code: 'not_found' } }, 404);
    }
    return topUpMedia({ ...deps, packs: deps.mediaPacks }, c.req.raw);
  });

  return app;
}

/** A transparent 1×1 GIF. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** « Ne plus recevoir ces emails »: one button, then the answer. */
function optOutPage({ nonce, ok, done }: { nonce: string; ok: boolean; done: boolean }): string {
  const body = !ok
    ? '<h1>Lien inconnu</h1><p>Ce lien ne fonctionne pas. Répondez à l’email et nous vous retirerons de la liste.</p>'
    : done
      ? '<h1>C’est fait</h1><p>Vous ne recevrez plus nos emails d’information. Les codes de connexion et les messages dans l’app continuent.</p>'
      : '<h1>Ne plus recevoir ces emails ?</h1><p>Les codes de connexion et les messages dans l’app continuent.</p><form method="post"><button type="submit">Me désinscrire</button></form>';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Baarali</title>
<style nonce="${nonce}">body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f6f9;color:#111827;display:grid;place-items:center;min-height:100svh;padding:0 16px}
main{max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:26px 28px}h1{font-size:19px;margin:0 0 10px}p{font-size:15px;line-height:1.5;color:#374151;margin:0 0 16px}
button{font:inherit;font-weight:600;background:#0062C4;color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#171717;color:#f3f4f6}main{background:#1f1f1f;border-color:#2e2e2e}p{color:#d1d5db}}</style></head>
<body><main>${body}</main></body></html>`;
}
