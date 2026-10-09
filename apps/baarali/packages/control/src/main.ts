import { serve } from '@hono/node-server';
import pg from 'pg';
import { accountResolver, createApp } from './app.js';
import { FlyMachines } from './fly.js';
import { createGateway } from './gateway.js';
import { Instances, settleOwnerInstance, type InstancesConfig } from './instances.js';
import { SOCIAL_PROVIDERS, createAuth, migrateAuth, type AuthDeps, type SocialCredentials, type BaaraliAuth } from './auth.js';
import { LogSender, NoSender, ResendSender, type CodeSender } from './codes.js';
import { ASSUMPTIONS, MEDIA_PACKS, OFFERS } from './catalog.js';
import { packCredits, plansFrom } from './pricing.js';
import { migrate, poolDb } from './db.js';
import { PgStore } from './pg-store.js';
import { LISTEN_PATH, createListenRelay } from './voice.js';
import { MemoryStore, hashToken, type Account, type ControlStore } from './store.js';
import { AutoMessages } from './auto-messages.js';
import { PartnerProgram } from './partner-program.js';
import { MemoryMailer, NoticeDispatcher, NoticeLinks, ResendMailer, type Mailer } from './notifications.js';

// Entry point (roadmap §4): the owner, their instance token, the plan catalog
// of catalog.ts. With DATABASE_URL, everything lives in Postgres (decided
// 01/10/2026); without it, in memory, forgotten when the machine stops.

/** Codes in the log are for development only: never set BAARALI_DEV_CODES in production. */
function codeSender(): CodeSender {
  if (process.env.BAARALI_DEV_CODES === '1') return new LogSender();
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return new ResendSender(process.env.RESEND_API_KEY, process.env.EMAIL_FROM);
  return new NoSender();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const publicUrl = required('BAARALI_PUBLIC_URL').replace(/\/+$/, '');
const plans = plansFrom(OFFERS, ASSUMPTIONS);
const planId = process.env.BAARALI_PLAN_ID ?? 'essentiel';
if (!plans.some((p) => p.id === planId)) {
  throw new Error(`BAARALI_PLAN_ID must be one of: ${plans.map((p) => p.id).join(', ')}`);
}
const owner: Account = {
  id: process.env.BAARALI_ACCOUNT_ID ?? 'owner',
  email: process.env.BAARALI_ACCOUNT_EMAIL ?? null,
  planId,
  createdAt: Date.parse(process.env.BAARALI_ACCOUNT_CREATED_AT ?? '') || Date.now(),
};

const instanceToken = required('BAARALI_INSTANCE_TOKEN');
// Our Spaces server (apps/harbor, AGENTS.md « Les espaces »); unset: no Spaces.
const spacesUrl = process.env.BAARALI_SPACES_URL?.replace(/\/+$/, '') || undefined;
let store: ControlStore;
let auth: BaaraliAuth | undefined;
if (process.env.DATABASE_URL) {
  // Our statements name the `baarali` schema; Better Auth's do not, so the
  // search path puts its tables there too (architecture §3.5).
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  // Set on each new connection rather than as a startup option, which some
  // poolers drop silently (seen 01/10/2026: Better Auth's tables then landed
  // in `public`). A client runs its queries in order, so this one goes first
  // (pg 8 warns that queueing is deprecated; pinned to 8, revisit with pg 9).
  pool.on('connect', (client) => {
    client.query('SET search_path TO baarali').catch((err: unknown) => console.error('[control] search_path', err));
  });
  const db = poolDb(pool);
  console.log(`[control] ${await migrate(db)} migration(s) applied`);
  const pgStore = new PgStore(db, plans);
  // An existing account keeps its creation date (its weeks stay anchored
  // there) and its plan: BAARALI_PLAN_ID only seeds it, the console changes it.
  await pgStore.upsertAccount(owner);
  await pgStore.grantToken(instanceToken, owner.id);
  store = pgStore;

  // The sign-in server (architecture §3.5 "Comptes et connexion"): only with
  // its secret, so a deployment without one keeps phase 0's instance token.
  if (process.env.BAARALI_AUTH_SECRET) {
    const social = Object.fromEntries(
      SOCIAL_PROVIDERS.flatMap((p): Array<[string, SocialCredentials]> => {
        const id = process.env[`${p.toUpperCase()}_CLIENT_ID`];
        const secret = process.env[`${p.toUpperCase()}_CLIENT_SECRET`];
        return id && secret ? [[p, { clientId: id, clientSecret: secret }]] : [];
      }),
    );
    const authDeps: AuthDeps = {
      publicUrl,
      secret: process.env.BAARALI_AUTH_SECRET,
      database: pool,
      db,
      sender: codeSender(),
      social,
      onUserCreated: async (u, signUp) => {
        const account = { id: u.id, email: u.email, planId: 'decouverte', createdAt: u.createdAt };
        await pgStore.upsertAccount(account);
        // Never in the way of the sign-up: a partner missed is only a partner missed.
        if (signUp.refCode) await program.attach(account, signUp.refCode, 'link').catch((err) => console.error('[partners] attach', err));
      },
      now: Date.now,
      spacesUrl,
    };
    await migrateAuth(authDeps);
    auth = createAuth(authDeps);
    // The owner's account predates the sign-in server: it becomes theirs
    // when they sign in with its email, verified (architecture §3.5).
    if (owner.email && (await pgStore.linkUserByVerifiedEmail(owner.id, owner.email))) {
      console.log('[control] owner account linked to its sign-in');
    }
    console.log(`[control] sign-in: ${[...(authDeps.sender.email ? ['email'] : []), ...(authDeps.sender.sms ? ['sms'] : []), ...Object.keys(social)].join(', ') || 'no method yet'}`);
  }
} else {
  store = new MemoryStore(new Map([[hashToken(instanceToken), owner]]), plans);
}

// The owner's media credits, granted once: in Postgres the reference is
// already taken on the next start; in memory everything was forgotten, so
// the grant comes back (phase 0 only).
const ownerMediaCredits = Number(process.env.BAARALI_OWNER_MEDIA_CREDITS ?? '0');
if (Number.isInteger(ownerMediaCredits) && ownerMediaCredits > 0) {
  await store.applyMediaEntry({ accountId: owner.id, at: Date.now(), kind: 'topup', credits: ownerMediaCredits, reference: 'owner-grant' });
}

const mediaPacks = MEDIA_PACKS.map((pack) => ({ id: pack.id, credits: packCredits(pack, ASSUMPTIONS), prices: pack.prices }));

// One instance per account (architecture §3.5 « Instances »). Without the
// gateway secret, no device connects; without Fly's token, only the owner's
// instance of phase 0 is reached, no new one is created.
let instances: Instances | undefined;
if (process.env.BAARALI_GATEWAY_SECRET) {
  const flyToken = process.env.FLY_API_TOKEN;
  const image = process.env.BAARALI_INSTANCE_IMAGE;
  const config: InstancesConfig | undefined =
    flyToken && image
      ? {
          app: process.env.BAARALI_INSTANCES_APP ?? 'baarali-instances',
          region: process.env.BAARALI_INSTANCES_REGION ?? 'cdg',
          image,
          apiUrl: publicUrl,
          maxInstances: Number(process.env.BAARALI_MAX_INSTANCES ?? '20'),
          diskGb: Number(process.env.BAARALI_INSTANCE_DISK_GB ?? '10'),
          backupDays: Number(process.env.BAARALI_INSTANCE_BACKUP_DAYS ?? '14'),
        }
      : undefined;
  instances = new Instances({
    store,
    secret: process.env.BAARALI_GATEWAY_SECRET,
    fly: flyToken ? new FlyMachines(flyToken) : undefined,
    config,
    now: Date.now,
  });
  // Deployed by hand (packages/instance/fly.toml), reached, never updated.
  const ownerApp = process.env.BAARALI_OWNER_INSTANCE_APP;
  if ((await settleOwnerInstance(store, owner.id, ownerApp)) === 'retired') {
    console.log('[control] owner instance retired; a managed one comes at the next sign-in');
  }
  console.log(`[control] instances: ${config ? `${config.app}, ${config.maxInstances} at most` : 'owner only'}`);
  console.log(`[control] instance tokens granted: ${await instances.grantRunningTokens()}`);
  // A running instance on an old image moves once unused for 10 minutes.
  const sweeping = instances;
  setInterval(() => void sweeping.updateIdle().catch((err) => console.error('[instances] idle sweep', err)), 2 * 60_000).unref();
}
const gateway = instances ? createGateway({ store, instances, now: Date.now, fetch: globalThis.fetch }) : undefined;

const deepgramKey = process.env.DEEPGRAM_API_KEY || undefined;
console.log(`[control] voice: ${deepgramKey ? 'deepgram' : 'off'}${process.env.ELEVENLABS_API_KEY ? ', elevenlabs for pro' : ''}`);

// The console's notifications by email: Resend, from the sign-in codes'
// address; their links are signed with a key derived from the auth secret.
const mailer: Mailer | undefined =
  process.env.BAARALI_DEV_CODES === '1'
    ? new MemoryMailer()
    : process.env.RESEND_API_KEY && process.env.EMAIL_FROM
      ? new ResendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM)
      : undefined;
const noticeLinks = process.env.BAARALI_AUTH_SECRET ? new NoticeLinks(process.env.BAARALI_AUTH_SECRET, publicUrl) : undefined;
const dispatch = { store, now: Date.now, mailer: noticeLinks ? mailer : undefined, links: noticeLinks };
const auto = new AutoMessages(dispatch);
const program = new PartnerProgram({ store, now: Date.now, auto });
const notices = new NoticeDispatcher(dispatch, [auto, program]);
// Scheduled ones leave on time while the machine is awake (app.ts sends them on waking too).
setInterval(() => void notices.run(), 60_000).unref();
console.log(`[control] notifications: app${mailer && noticeLinks ? ', email' : ''}`);

const app = createApp({
  store,
  openRouterKey: required('OPENROUTER_API_KEY'),
  publicUrl,
  appName: process.env.BAARALI_APP_NAME ?? 'Baarali',
  // Optional: without it, media generation answers 503 and text still works.
  pixazoKey: process.env.PIXAZO_API_KEY || undefined,
  // Optional: without it, Studio Motion exports answer 503 (motion.ts).
  render: process.env.BAARALI_RENDER_SECRET
    ? { url: (process.env.BAARALI_RENDER_URL ?? 'http://baarali-render.flycast').replace(/\/+$/, ''), secret: process.env.BAARALI_RENDER_SECRET }
    : undefined,
  motionReviewModel: process.env.MOTION_REVIEW_MODEL || undefined,
  // Optional: without it, reading aloud answers 503 and listening is refused.
  deepgramKey,
  elevenLabs: process.env.ELEVENLABS_API_KEY
    ? {
        key: process.env.ELEVENLABS_API_KEY,
        voices: { fr: process.env.ELEVENLABS_VOICE_FR || undefined, en: process.env.ELEVENLABS_VOICE_EN || undefined },
      }
    : undefined,
  mediaPacks,
  home: {
    offers: OFFERS,
    weekCredits: Object.fromEntries(plans.map((p) => [p.id, p.weekCredits])),
    packs: mediaPacks,
    // Set once a desktop version is published (apps/baarali/AGENTS.md « L'app de bureau »).
    downloadBase: process.env.BAARALI_DOWNLOAD_BASE || undefined,
  },
  adminTokenHash: process.env.BAARALI_ADMIN_TOKEN ? hashToken(process.env.BAARALI_ADMIN_TOKEN) : undefined,
  // The admin console (/admin): these emails, once verified, and only with the sign-in server.
  adminEmails: (process.env.BAARALI_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  auth,
  instances,
  gateway,
  spacesUrl,
  mailer: noticeLinks ? mailer : undefined,
  noticeLinks,
  notices,
  auto,
  program,
  fetch: globalThis.fetch,
  now: Date.now,
});

const port = Number(process.env.PORT ?? '8080');
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[control] listening on :${port}`);
});
// Two WebSockets: listening (voice.ts), and the instance's events through the gateway.
const listen = deepgramKey
  ? createListenRelay({ store, deepgramKey, fetch: globalThis.fetch, now: Date.now, accountFor: accountResolver(store, auth) })
  : undefined;
server.on('upgrade', (req, socket, head) => {
  if (listen && (req.url ?? '').split('?')[0] === LISTEN_PATH) listen(req, socket, head);
  else if (gateway) gateway.upgrade(req, socket, head);
  else socket.destroy();
});
