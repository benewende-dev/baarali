import { describe, expect, it } from 'vitest';
import { adminPage, deniedPage } from '../src/admin-page.js';
import { createApp } from '../src/app.js';
import { selectAccountPage } from '../src/sign-in-page.js';
import type { BaaraliAuth, SessionUser } from '../src/auth.js';
import type { FlyApi, MachineConfig } from '../src/fly.js';
import { createGateway } from '../src/gateway.js';
import { Instances } from '../src/instances.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';
import { MemoryMailer, NoticeLinks } from '../src/notifications.js';

// The admin console (/admin, decided 03/10/2026): who opens it, what each
// action changes, and the journal that keeps every one of them.

const T0 = Date.UTC(2026, 9, 3, 8, 0, 0);
const FREE: Plan = { id: 'decouverte', category: 'free', displayName: 'Découverte', weekCredits: 1_000_000, monthlyPrices: [], models: { models: ['deepseek/flash'], settings: { reasoning: { enabled: false } } } };
const PRO100: Plan = { id: 'pro-100', category: 'pro', displayName: 'Pro', weekCredits: 25_000_000, monthlyPrices: [{ amount: 10000, currency: 'EUR' }], models: null };
const PRO: Plan = { id: 'pro-200', category: 'pro', displayName: 'Pro', weekCredits: 50_000_000, monthlyPrices: [{ amount: 20000, currency: 'EUR' }], models: null };
const OWNER: Account = { id: 'acc_owner', email: 'boss@example.test', planId: 'decouverte', createdAt: T0 };
const AWA: Account = { id: 'acc_awa', email: 'awa@example.test', planId: 'decouverte', createdAt: T0 + 1000 };

const UPSTREAM = [
  { id: 'openai/gpt-6', name: 'OpenAI: GPT-6', pricing: { prompt: '0.000002', completion: '0.00001' } },
  { id: 'deepseek/flash', name: 'DeepSeek: Flash', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
  { id: 'anthropic/opus', name: 'Anthropic: Claude Opus', pricing: { prompt: '0.000015', completion: '0.000075' } },
  { id: 'anthropic/sonnet', name: 'Anthropic: Claude Sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } },
];

// The browser's session, played by a cookie naming who is signed in.
const SESSIONS: Record<string, SessionUser> = {
  boss: { id: OWNER.id, email: 'Boss@example.test', emailVerified: true },
  unproved: { id: 'u_x', email: 'boss@example.test', emailVerified: false },
  awa: { id: AWA.id, email: AWA.email, emailVerified: true },
};

const auth: BaaraliAuth = {
  methods: { email: true, phone: false, social: [] },
  handle: async () => new Response(null, { status: 404 }),
  userIdForAccessToken: async (t) => ({ 'at-awa': AWA.id })[t] ?? null,
  spacesTokenFor: async () => null,
  sessionUser: async (headers) => SESSIONS[headers.get('cookie')?.match(/session=(\w+)/)?.[1] ?? ''] ?? null,
  userIdForSession: async () => null,
};

function setup(opts: { adminEmails?: string[]; noAuth?: boolean; noMail?: boolean } = {}) {
  const calls: string[] = [];
  const mailer = new MemoryMailer();
  const links = new NoticeLinks('test-auth-secret', 'https://app.baarali.test');
  const fly: FlyApi = {
    createVolume: async () => ({ id: 'vol_1' }),
    createMachine: async (_app, { config }: { region: string; config: MachineConfig }) => ({ id: 'm_1', state: 'started', config }),
    machine: async (_app, id) => ({ id, state: id === 'm_broken' ? 'failed' : 'suspended', config: { image: 'registry.fly.io/baarali-instances:v10' } }),
    updateMachine: async (_app, id, config) => {
      calls.push(`update ${id} ${config.image}`);
      return { id, state: 'started', config };
    },
    start: async (_app, id) => void calls.push(`start ${id}`),
    restart: async (_app, id) => void calls.push(`restart ${id}`),
    waitStarted: async () => {},
    volume: async (_app, id) => ({ id, size_gb: 1, block_size: 4096, blocks: 250_000, blocks_free: 200_000, snapshot_retention: 5, auto_backup_enabled: true }),
    extendVolume: async () => ({ needs_restart: true }),
    setBackups: async () => {},
    snapshots: async () => [{ id: 's1', created_at: '2026-10-04T03:00:00Z' }, { id: 's2', created_at: '2026-10-05T03:00:00Z' }],
  };
  const store = new MemoryStore(new Map([[hashToken('tok-owner'), OWNER], [hashToken('tok-awa'), AWA]]), [FREE, PRO100, PRO]);
  let clock = T0 + 60_000;
  const instances = new Instances({
    store,
    secret: 'test-secret-0123456789abcdef0123',
    fly,
    config: { app: 'baarali-instances', region: 'cdg', image: 'registry.fly.io/baarali-instances:v11', apiUrl: 'https://app.baarali.test', maxInstances: 5, diskGb: 10, backupDays: 14 },
    now: () => clock,
  });
  const app = createApp({
    store,
    openRouterKey: 'k',
    publicUrl: 'https://app.baarali.test',
    appName: 'Baarali',
    mediaPacks: [{ id: 'medias-2', credits: 71, prices: [{ amount: 200, currency: 'EUR' }] }],
    adminTokenHash: hashToken('operator-token'),
    adminEmails: opts.adminEmails ?? ['boss@example.test'],
    auth: opts.noAuth ? undefined : auth,
    instances,
    gateway: createGateway({ store, instances, now: () => clock, fetch: globalThis.fetch }),
    mailer: opts.noMail ? undefined : mailer,
    noticeLinks: opts.noMail ? undefined : links,
    now: () => clock,
    // OpenRouter, played here: its model list, priced per token.
    fetch: (async (url: string) => {
      if (String(url).endsWith('/models')) return Response.json({ data: UPSTREAM });
      return new Response('{}');
    }) as typeof fetch,
  });
  const as = (who: string | null, path: string, init: RequestInit & { write?: boolean } = {}) =>
    app.request(path, {
      ...init,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(who ? { cookie: `session=${who}` } : {}),
        ...(init.write === false ? {} : init.method === 'POST' ? { 'x-baarali-admin': '1' } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
  const post = (who: string | null, path: string, body: unknown = {}) => as(who, path, { method: 'POST', body: JSON.stringify(body) });
  return { app, store, as, post, calls, mailer, links, tick: (ms: number) => { clock += ms; } };
}

describe('who opens the console', () => {
  it('does not exist without admin emails', async () => {
    const { as } = setup({ adminEmails: [] });
    expect((await as('boss', '/admin')).status).toBe(404);
    expect((await as('boss', '/admin/api/clients')).status).toBe(404);
  });

  it('sends a stranger to sign in, and comes back to /admin after', async () => {
    const { as } = setup();
    const res = await as(null, '/admin');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/v1/sign-in#admin');
    expect((await as(null, '/admin/api/clients')).status).toBe(404);
  });

  it('opens for an admin email, proved, whatever its case', async () => {
    const { as } = setup();
    const page = await as('boss', '/admin');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Boss@example.test');
    // Like the sign-in pages: only its own script, by nonce.
    expect(page.headers.get('content-security-policy')).toMatch(/script-src 'nonce-/);
  });

  it('refuses another account, and an admin email not proved, offering to switch', async () => {
    const { as } = setup();
    for (const who of ['awa', 'unproved']) {
      const page = await as(who, '/admin');
      expect(await page.text()).toContain('Changer de compte');
      expect((await as(who, '/admin/api/clients')).status).toBe(404);
    }
  });

  it('has no page without the sign-in server, only the token\'s JSON routes', async () => {
    const { as } = setup({ noAuth: true });
    expect((await as(null, '/admin')).status).toBe(404);
    expect((await as(null, '/admin/api/clients', { headers: { authorization: 'Bearer operator-token' } })).status).toBe(200);
  });

  it('opens the JSON routes to the operator token too, for scripts', async () => {
    const { as } = setup();
    const res = await as(null, '/admin/api/clients', { headers: { authorization: 'Bearer operator-token' } });
    expect(res.status).toBe(200);
    expect((await as(null, '/admin/api/clients', { headers: { authorization: 'Bearer wrong' } })).status).toBe(404);
  });

  it('changes nothing on a cookie alone: a write needs the console\'s header', async () => {
    const { as, store } = setup();
    const res = await as('boss', `/admin/api/clients/${AWA.id}/plan`, { method: 'POST', write: false, body: JSON.stringify({ plan: 'pro-200' }) });
    expect(res.status).toBe(403);
    expect((await store.account(AWA.id))?.planId).toBe('decouverte');
  });
});

// The scripts live in TypeScript template strings, where one backslash too
// few changes a regex or breaks the whole page: each must still compile.
it('serves page scripts that compile', () => {
  const pages = [adminPage({ nonce: 'n', admin: 'a@x' }), deniedPage({ nonce: 'n', who: null }), selectAccountPage({ who: 'a@x', lang: null, nonce: 'n' })];
  for (const html of pages) {
    const script = html.match(/<script nonce="n">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  }
});

describe('what the console changes', () => {
  it('lists the clients, newest first, with what they cost', async () => {
    const { as } = setup();
    const { data, plans, packs } = (await (await as('boss', '/admin/api/clients')).json()) as { data: Array<{ id: string; planName: string; cost: { xof: number } }>; plans: Array<{ name: string }>; packs: unknown };
    expect(data.map((c) => c.id)).toEqual([AWA.id, OWNER.id]);
    expect(data[0]).toMatchObject({ planName: 'Découverte', cost: { xof: 0 } });
    // Two Pro levels share a name: the dearer is « Pro max ».
    expect(plans.map((p) => p.name)).toEqual(['Découverte', 'Pro', 'Pro max']);
    // The packs as sold, to give one in a click.
    expect(packs).toEqual([{ id: 'medias-2', credits: 71, eur: 2 }]);
  });

  it('changes a plan, which the account\'s next call sees, and writes it down', async () => {
    const { post, as, store } = setup();
    expect(await (await post('boss', `/admin/api/clients/${AWA.id}/plan`, { plan: 'pro-200' })).json()).toEqual({ changed: true });
    expect((await store.accountByToken('tok-awa'))?.planId).toBe('pro-200');
    const overview = (await (await as('boss', '/admin/api/overview')).json()) as { paid: number; monthlyValueEur: number };
    expect(overview).toMatchObject({ paid: 1, monthlyValueEur: 200 });
    expect(await (await post('boss', `/admin/api/clients/${AWA.id}/plan`, { plan: 'pro-200' })).json()).toEqual({ changed: false });
    expect((await post('boss', `/admin/api/clients/${AWA.id}/plan`, { plan: 'gratuit-a-vie' })).status).toBe(400);
    expect((await post('boss', '/admin/api/clients/acc_nobody/plan', { plan: 'pro-200' })).status).toBe(404);

    const { data } = (await (await as('boss', '/admin/api/journal')).json()) as { data: Array<Record<string, unknown>> };
    expect(data).toEqual([expect.objectContaining({ actor: 'Boss@example.test', action: 'plan', account: AWA.email, detail: 'Découverte → Pro max' })]);
  });

  it('gives media credits once per payment reference, within a ceiling', async () => {
    const { post, store } = setup();
    const give = (body: unknown) => post('boss', `/admin/api/clients/${AWA.id}/credits`, body);
    expect(await (await give({ credits: 50, reference: 'OM-123' })).json()).toEqual({ added: 50, duplicate: false, balance: 50 });
    expect(await (await give({ credits: 50, reference: 'OM-123' })).json()).toEqual({ added: 0, duplicate: true, balance: 50 });
    // Without a reference, every gift is its own.
    await give({ credits: 5 });
    await give({ credits: 5 });
    expect(await store.mediaBalance(AWA.id)).toBe(60);
    for (const credits of [0, -5, 2.5, 10_001, '50']) expect((await give({ credits })).status).toBe(400);
    expect((await store.adminLog(10, AWA.id)).map((e) => e.detail)).toEqual(['+5 crédits médias', '+5 crédits médias', '+50 crédits médias · OM-123']);
  });

  it('credits one receipt once, whether it came by the console or the operator route', async () => {
    const { post, as, store } = setup();
    const route = await as(null, '/v1/admin/media-credits', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-token' },
      body: JSON.stringify({ account_id: AWA.id, pack: 'medias-2', reference: 'OM-777' }),
    });
    expect(await route.json()).toMatchObject({ added: 71 });
    expect(await (await post('boss', `/admin/api/clients/${AWA.id}/credits`, { credits: 71, reference: 'OM-777' })).json()).toMatchObject({ added: 0, duplicate: true });
    expect(await store.mediaBalance(AWA.id)).toBe(71);
  });

  it('resets the 5-hour session and leaves the week as it was', async () => {
    const { post, store } = setup();
    await store.saveQuotaState(AWA.id, { sessionStart: T0, sessionUsed: 900_000, weekStart: T0, weekUsed: 900_000 });
    expect((await post('boss', `/admin/api/clients/${AWA.id}/reset-session`)).status).toBe(200);
    expect(await store.quotaState(AWA.id)).toMatchObject({ sessionStart: null, sessionUsed: 0, weekUsed: 900_000 });
  });

  it('suspends an account: its tokens and its devices open nothing until restored', async () => {
    const { post, as, store, app } = setup();
    const added = await app.request('/v1/devices', { method: 'POST', headers: { authorization: 'Bearer at-awa', 'content-type': 'application/json' } });
    const { server } = (await added.json()) as { server: { key: string } };
    const me = () => app.request('/v1/me', { headers: { authorization: 'Bearer tok-awa' } });
    const gateway = () => app.request('/instance/rpc/x', { headers: { authorization: `Bearer ${server.key}` } });
    expect((await me()).status).toBe(200);

    expect(await (await post('boss', `/admin/api/clients/${AWA.id}/suspend`, { suspended: true })).json()).toEqual({ changed: true });
    expect((await me()).status).toBe(403);
    expect((await app.request('/v1/me', { headers: { authorization: 'Bearer at-awa' } })).status).toBe(403);
    expect((await gateway()).status).toBe(403);
    const { data } = (await (await as('boss', '/admin/api/clients')).json()) as { data: Array<{ id: string; suspendedAt: number | null }> };
    expect(data.find((c) => c.id === AWA.id)?.suspendedAt).not.toBeNull();

    await post('boss', `/admin/api/clients/${AWA.id}/suspend`, { suspended: false });
    expect((await me()).status).toBe(200);
    expect((await gateway()).status).not.toBe(403);
    expect((await store.adminLog(10, AWA.id)).map((e) => e.action)).toEqual(['restore', 'suspend']);
  });
});

describe('instances from the console', () => {
  async function withInstance() {
    const s = setup();
    await s.store.saveInstance({ accountId: AWA.id, app: 'baarali-instances', machineId: 'm_awa', volumeId: 'vol_awa', image: 'registry.fly.io/baarali-instances:v10', managed: true, keys: 2 });
    return s;
  }

  it('shows each machine with its state and whether it is behind', async () => {
    const { as } = await withInstance();
    const body = await (await as('boss', '/admin/api/instances')).json();
    expect(body).toEqual({
      currentImage: 'v11',
      diskGb: 10,
      data: [expect.objectContaining({
        accountId: AWA.id, email: AWA.email, image: 'v10', outdated: true, state: 'suspended',
        logsUrl: 'https://fly.io/apps/baarali-instances/machines/m_awa',
        // 50 000 blocks of 4 KiB in use; the newest of the snapshots.
        disk: { sizeGb: 1, usedGb: 0.2048, backupDays: 5, lastBackupAt: '2026-10-05T03:00:00Z' },
      })],
    });
    const overview = (await (await as('boss', '/admin/api/overview')).json()) as { attention: { outdatedInstances: number; failedInstances: unknown[] } };
    expect(overview.attention).toMatchObject({ outdatedInstances: 1, failedInstances: [] });
  });

  it('puts a machine that failed to start first in what needs attention', async () => {
    const { as, store } = await withInstance();
    await store.saveInstance({ accountId: OWNER.id, app: 'baarali-instances', machineId: 'm_broken', volumeId: 'v', image: 'registry.fly.io/baarali-instances:v11', managed: true, keys: 2 });
    const overview = (await (await as('boss', '/admin/api/overview')).json()) as { attention: { failedInstances: unknown[] } };
    expect(overview.attention.failedInstances).toEqual([{ id: OWNER.id, email: OWNER.email }]);
  });

  it('updates, restarts and wakes a machine, each written down', async () => {
    const { post, calls, store } = await withInstance();
    expect(await (await post('boss', `/admin/api/instances/${AWA.id}/update`)).json()).toEqual({ done: true });
    expect(calls).toContain('update m_awa registry.fly.io/baarali-instances:v11');
    // Already on the current image: nothing to do, nothing written.
    expect(await (await post('boss', `/admin/api/instances/${AWA.id}/update`)).json()).toEqual({ done: false });
    expect(await (await post('boss', `/admin/api/instances/${AWA.id}/restart`)).json()).toEqual({ done: true });
    expect(calls).toContain('restart m_awa');
    expect((await post('boss', '/admin/api/instances/acc_nobody/wake')).status).toBe(404);
    expect((await store.adminLog(10, AWA.id)).map((e) => e.action)).toEqual(['instance-restart', 'instance-update']);
  });
});

describe('models from the console', () => {
  type Listed = { vendors: Array<{ id: string; name: string; models: Array<Record<string, unknown>> }>; free: string[]; freeFromCode: boolean };
  type Preview = { default: string | null; groups: Array<{ name: string; models: Array<{ id: string; baarali: { unlock?: string; recommended: boolean } }> }> };
  const preview = async (as: ReturnType<typeof setup>['as'], plan: string) => (await (await as('boss', `/admin/api/models/preview?plan=${plan}`)).json()) as Preview;

  it('lists OpenRouter\'s models by vendor, in the vendors\' order, priced per million', async () => {
    const { as } = setup();
    const r = (await (await as('boss', '/admin/api/models')).json()) as Listed;
    expect(r.vendors.map((v) => v.name)).toEqual(['Anthropic', 'OpenAI', 'DeepSeek']);
    expect(r.vendors[0].models[0]).toMatchObject({
      id: 'anthropic/opus', name: 'Claude Opus', configured: false, enabled: true, minPlan: null, deduced: 'puissant', free: -1,
      price: { prompt: 15, completion: 75 },
    });
    expect(r).toMatchObject({ free: ['deepseek/flash'], freeFromCode: true });
  });

  it('closes a model to the plans below its minimum, padlocked, and writes it down', async () => {
    const { as, post, store } = setup();
    expect((await post('boss', '/admin/api/models', { ids: ['anthropic/opus'], set: { minPlan: 'pro-200', recommended: true } })).status).toBe(200);
    const pro = await preview(as, 'pro-100');
    const opus = pro.groups[0].models.find((m) => m.id === 'anthropic/opus');
    expect(opus?.baarali).toMatchObject({ unlock: 'Pro max', recommended: true });
    // A padlocked model comes last in its vendor's group.
    expect(pro.groups[0].models.map((m) => m.id)).toEqual(['anthropic/sonnet', 'anthropic/opus']);
    expect((await preview(as, 'pro-200')).default).toBe('anthropic/opus');
    expect((await store.adminLog(1))[0]).toMatchObject({ action: 'models', detail: 'anthropic/opus : conseillé, dès Pro max' });
  });

  it('reaches the apps\' list at once, and their calls', async () => {
    const { post, app } = setup();
    await post('boss', '/admin/api/models', { ids: ['anthropic/opus', 'anthropic/sonnet'], set: { enabled: false } });
    const listed = await app.request('/v1/llm/models', { headers: { authorization: 'Bearer tok-awa' } });
    const { data } = (await listed.json()) as { data: Array<{ id: string }> };
    expect(data.map((m) => m.id)).toEqual(['deepseek/flash']);
  });

  it('refuses a minimum that is not a paid plan, or an unknown strength, or no model', async () => {
    const { post } = setup();
    expect((await post('boss', '/admin/api/models', { ids: ['anthropic/opus'], set: { minPlan: 'decouverte' } })).status).toBe(400);
    expect((await post('boss', '/admin/api/models', { ids: ['anthropic/opus'], set: { strength: 'magique' } })).status).toBe(400);
    expect((await post('boss', '/admin/api/models', { ids: [], set: { enabled: false } })).status).toBe(400);
    expect((await post('boss', '/admin/api/models', { ids: ['anthropic/opus'], set: {} })).status).toBe(400);
  });

  it('sets Découverte\'s list and its order, and takes out what left it', async () => {
    const { as, post } = setup();
    await post('boss', '/admin/api/models/free', { ids: ['openai/gpt-6', 'deepseek/flash'] });
    let r = (await (await as('boss', '/admin/api/models')).json()) as Listed;
    expect(r).toMatchObject({ free: ['openai/gpt-6', 'deepseek/flash'], freeFromCode: false });
    await post('boss', '/admin/api/models/free', { ids: ['deepseek/flash'] });
    r = (await (await as('boss', '/admin/api/models')).json()) as Listed;
    expect(r.free).toEqual(['deepseek/flash']);
    const free = await preview(as, 'decouverte');
    expect(free.default).toBe('deepseek/flash');
    // gpt-6 was set up: Découverte sees it padlocked, open from the first paid plan.
    expect(free.groups.flatMap((g) => g.models).find((m) => m.id === 'openai/gpt-6')?.baarali.unlock).toBe('Pro');
    expect((await post('boss', '/admin/api/models/free', { ids: [] })).status).toBe(400);
  });
});

describe('Pixazo\'s models from the console', () => {
  type Media = { models: Array<{ id: string; kind: string; enabled: boolean; minPlan: string | null; recommended: boolean; credits: number; openFor: string[] }> };

  it('lists the code\'s media models, open to every plan until set', async () => {
    const { as } = setup();
    const r = (await (await as('boss', '/admin/api/media-models')).json()) as Media;
    expect(r.models.map((m) => m.kind)).toEqual(expect.arrayContaining(['video', 'speech', 'music']));
    expect(r.models.find((m) => m.id === 'veo-fast')).toMatchObject({ enabled: true, minPlan: null, recommended: false, credits: 80, openFor: ['decouverte', 'pro-100', 'pro-200'] });
  });

  it('opens one from a plan up, recommends it, and writes it down', async () => {
    const { as, post, store } = setup();
    expect((await post('boss', '/admin/api/media-models', { ids: ['veo'], set: { minPlan: 'pro-200', recommended: true } })).status).toBe(200);
    const r = (await (await as('boss', '/admin/api/media-models')).json()) as Media;
    expect(r.models.find((m) => m.id === 'veo')).toMatchObject({ minPlan: 'pro-200', recommended: true, openFor: ['pro-200'] });
    expect((await store.adminLog(1))[0]).toMatchObject({ action: 'media-models', detail: 'Pixazo veo : conseillé, dès Pro max' });
  });

  it('refuses an unknown model or plan', async () => {
    const { post } = setup();
    expect((await post('boss', '/admin/api/media-models', { ids: ['sora'], set: { enabled: false } })).status).toBe(400);
    expect((await post('boss', '/admin/api/media-models', { ids: ['veo'], set: { minPlan: 'platine' } })).status).toBe(400);
  });
});

describe('announcements', () => {
  const draft = { text: 'Parle à Baarali, il te répond à voix haute.', button: 'Essayer', target: 'voice', audience: 'all', tone: 'info', endsAt: T0 + 14 * 86_400_000 };

  it('publishes one banner at a time, shows it to the apps, and writes it down', async () => {
    const { as, post, app, tick } = setup();
    expect((await post('boss', '/admin/api/announcements', draft)).status).toBe(201);
    tick(1000);
    const second = await post('boss', '/admin/api/announcements', { ...draft, text: 'Les baarasseurs arrivent', target: 'none' });
    expect(second.status).toBe(201);
    const { data } = (await (await as('boss', '/admin/api/announcements')).json()) as { data: Array<{ text: string; status: string }> };
    expect(data.map((a) => [a.text, a.status])).toEqual([['Les baarasseurs arrivent', 'live'], [draft.text, 'removed']]);

    const seen = (await (await app.request('/v1/announcement', { headers: { authorization: 'Bearer tok-awa' } })).json()) as { announcement: { text: string; button: string | null } };
    expect(seen.announcement).toMatchObject({ text: 'Les baarasseurs arrivent', button: null });

    const journal = (await (await as('boss', '/admin/api/journal')).json()) as { data: Array<{ action: string }> };
    expect(journal.data.filter((e) => e.action === 'announcement')).toHaveLength(2);
  });

  it('refuses a bad banner with words the console shows', async () => {
    const { post } = setup();
    const res = await post('boss', '/admin/api/announcements', { ...draft, target: 'link', link: 'http://x.test' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/https/);
  });

  it('is published by an admin only, and never by a cookie alone', async () => {
    const { post, as } = setup();
    expect((await post('awa', '/admin/api/announcements', draft)).status).toBe(404);
    const forged = await as('boss', '/admin/api/announcements', { method: 'POST', body: JSON.stringify(draft), write: false });
    expect(forged.status).toBe(403);
  });

  it('withdraws, and counts views, clicks and closes once per person', async () => {
    const { as, post, app } = setup();
    const { id } = (await (await post('boss', '/admin/api/announcements', draft)).json()) as { id: string };
    const send = (token: string, kind: string) =>
      app.request(`/v1/announcement/${id}/events`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind }) });
    expect(((await (await send('tok-awa', 'view')).json()) as { counted: boolean }).counted).toBe(true);
    expect(((await (await send('tok-awa', 'view')).json()) as { counted: boolean }).counted).toBe(false);
    await send('tok-owner', 'view');
    await send('tok-awa', 'click');
    expect((await send('tok-awa', 'nope')).status).toBe(400);
    // Closed: that person no longer gets it; the others still do.
    await send('tok-awa', 'dismiss');
    const read = async (token: string) =>
      ((await (await app.request('/v1/announcement', { headers: { authorization: `Bearer ${token}` } })).json()) as { announcement: unknown }).announcement;
    expect(await read('tok-awa')).toBeNull();
    expect(await read('tok-owner')).not.toBeNull();

    const { data } = (await (await as('boss', '/admin/api/announcements')).json()) as { data: Array<{ stats: unknown }> };
    expect(data[0].stats).toEqual({ view: 2, click: 1, dismiss: 1 });

    expect((await post('boss', `/admin/api/announcements/${id}/remove`)).status).toBe(200);
    expect(await read('tok-owner')).toBeNull();
    expect((await post('boss', '/admin/api/announcements/ann_none/remove')).status).toBe(404);
  });

  it('counts nothing from an account the banner was not meant for', async () => {
    const { post, app } = setup();
    const { id } = (await (await post('boss', '/admin/api/announcements', { ...draft, audience: 'paid' })).json()) as { id: string };
    const res = await app.request(`/v1/announcement/${id}/events`, { method: 'POST', headers: { authorization: 'Bearer tok-awa', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'view' }) });
    expect(res.status).toBe(404);
    expect((await app.request('/v1/announcement/ann_none/events', { method: 'POST', headers: { authorization: 'Bearer tok-awa', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'view' }) })).status).toBe(404);
  });

  it('asks the apps for their own token', async () => {
    const { app } = setup();
    expect((await app.request('/v1/announcement')).status).toBe(401);
  });
});

describe('notifications', () => {
  const draft = { title: 'Baarali code pour toi', body: 'Demande au Chat de te fabriquer un petit outil.', button: 'Essayer', target: 'chat', audience: 'all', app: true, email: true };
  const asApp = (app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> }, token: string, path: string, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('counts who it would reach before sending', async () => {
    const { post, store } = setup();
    await store.setEmailOptOut(AWA.id, T0);
    const count = async (b: unknown) => (await (await post('boss', '/admin/api/notifications/audience', b)).json()) as { count: number; emailable: number; found: boolean };
    expect(await count({ audience: 'all' })).toEqual({ count: 2, emailable: 1, found: true });
    expect(await count({ audience: 'paid' })).toMatchObject({ count: 0 });
    expect(await count({ audience: 'account', accountEmail: 'AWA@example.test' })).toEqual({ count: 1, emailable: 0, found: true });
    expect(await count({ audience: 'account', accountEmail: 'nobody@x.test' })).toMatchObject({ count: 0, found: false });
  });

  it('sends now to the app and by email, writes it down, and the apps read it', async () => {
    const { post, as, app, mailer } = setup();
    const res = await post('boss', '/admin/api/notifications', draft);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ scheduled: false, delivered: 2, emailed: 2 });
    expect(mailer.outbox.map((m) => m.to).sort()).toEqual(['awa@example.test', 'boss@example.test']);
    expect(mailer.outbox[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    const inbox = (await (await asApp(app, 'tok-awa', '/v1/notifications')).json()) as { data: Array<{ id: string; title: string; read: boolean; target: string }>; unread: number };
    expect(inbox.unread).toBe(1);
    expect(inbox.data[0]).toMatchObject({ title: draft.title, target: 'chat', read: false });

    const id = inbox.data[0].id;
    expect(((await (await asApp(app, 'tok-awa', `/v1/notifications/${id}/events`, { kind: 'click' })).json()) as { counted: boolean }).counted).toBe(true);
    expect((await asApp(app, 'tok-awa', `/v1/notifications/${id}/events`, { kind: 'nope' })).status).toBe(400);
    expect(((await (await asApp(app, 'tok-awa', '/v1/notifications')).json()) as { unread: number }).unread).toBe(0);

    const list = (await (await as('boss', '/admin/api/notifications')).json()) as { email: boolean; data: Array<{ status: string; stats: unknown; audienceLabel: string }> };
    expect(list.email).toBe(true);
    expect(list.data[0]).toMatchObject({ status: 'sent', audienceLabel: 'Tous', stats: { delivered: 2, emailed: 2, read: 1, clicked: 1 } });
    const journal = (await (await as('boss', '/admin/api/journal')).json()) as { data: Array<{ action: string }> };
    expect(journal.data.filter((e) => e.action === 'notification')).toHaveLength(1);
  });

  it('marks all read, and counts nothing on a message that is not the person’s', async () => {
    const { post, app } = setup();
    const { id } = (await (await post('boss', '/admin/api/notifications', { ...draft, audience: 'account', accountEmail: 'boss@example.test' })).json()) as { id: string };
    expect((await asApp(app, 'tok-awa', `/v1/notifications/${id}/events`, { kind: 'read' })).status).toBe(404);
    expect(((await (await asApp(app, 'tok-awa', '/v1/notifications')).json()) as { data: unknown[] }).data).toEqual([]);
    expect(((await (await asApp(app, 'tok-owner', '/v1/notifications/read-all', {})).json()) as { changed: number }).changed).toBe(1);
    expect(((await (await asApp(app, 'tok-owner', '/v1/notifications')).json()) as { unread: number }).unread).toBe(0);
    expect((await app.request('/v1/notifications')).status).toBe(401);
  });

  it('holds a scheduled one until its time, and cancels one not yet sent', async () => {
    const { post, as, app, tick } = setup();
    const later = (await (await post('boss', '/admin/api/notifications', { ...draft, email: false, sendAt: T0 + 60_000 + 3_600_000 })).json()) as { id: string; scheduled: boolean };
    expect(later.scheduled).toBe(true);
    const other = (await (await post('boss', '/admin/api/notifications', { ...draft, title: 'Autre', email: false, sendAt: T0 + 60_000 + 3_600_000 })).json()) as { id: string };
    expect(((await (await post('boss', `/admin/api/notifications/${other.id}/cancel`)).json()) as { changed: boolean }).changed).toBe(true);
    const unread = async () => ((await (await asApp(app, 'tok-awa', '/v1/notifications')).json()) as { unread: number }).unread;
    expect(await unread()).toBe(0);
    tick(3_600_000 + 61_000);
    // The machine may have slept past the time: reading the inbox sends what is due first.
    expect(await unread()).toBe(1);
    const list = (await (await as('boss', '/admin/api/notifications')).json()) as { data: Array<{ id: string; status: string }> };
    expect(list.data.map((n) => [n.id, n.status])).toEqual([[other.id, 'cancelled'], [later.id, 'sent']]);
    expect(((await (await post('boss', `/admin/api/notifications/${later.id}/cancel`)).json()) as { changed: boolean }).changed).toBe(false);
  });

  it('sends a test to the admin alone, kept out of the journal', async () => {
    const { post, as, app, mailer } = setup();
    const res = await post('boss', '/admin/api/notifications', { ...draft, test: true });
    expect(await res.json()).toMatchObject({ delivered: 1, emailed: 1 });
    expect(mailer.outbox.map((m) => m.to)).toEqual(['boss@example.test']);
    expect(((await (await asApp(app, 'tok-awa', '/v1/notifications')).json()) as { data: unknown[] }).data).toEqual([]);
    const journal = (await (await as('boss', '/admin/api/journal')).json()) as { data: Array<{ action: string }> };
    expect(journal.data.filter((e) => e.action === 'notification')).toHaveLength(0);
  });

  it('refuses email without a mailer, and a bad draft, with words the console shows', async () => {
    const { post } = setup({ noMail: true });
    const res = await post('boss', '/admin/api/notifications', draft);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/email/i);
    const bad = await post('boss', '/admin/api/notifications', { ...draft, email: false, target: 'link', link: 'javascript:alert(1)' });
    expect(((await bad.json()) as { error: { message: string } }).error.message).toMatch(/https/);
  });

  it('is sent by an admin only, and never by a cookie alone', async () => {
    const { post, as } = setup();
    expect((await post('awa', '/admin/api/notifications', draft)).status).toBe(404);
    expect((await as('boss', '/admin/api/notifications', { method: 'POST', body: JSON.stringify(draft), write: false })).status).toBe(403);
  });

  it('counts an email click and open, and opts out only by the button', async () => {
    const { post, app, links, store } = setup();
    const { id } = (await (await post('boss', '/admin/api/notifications', { ...draft, target: 'plans' })).json()) as { id: string };
    const token = links.token(id, AWA.id);
    const click = await app.request(`/n/c/${token}`, { redirect: 'manual' });
    expect(click.status).toBe(302);
    expect(click.headers.get('location')).toBe('https://app.baarali.test/tarifs');
    expect((await app.request(`/n/o/${token}`)).headers.get('content-type')).toBe('image/gif');
    expect((await store.notificationStats([id]))[id]).toMatchObject({ read: 1, clicked: 1 });

    // A forged token is no one.
    expect((await app.request(`/n/c/${token.slice(0, -2)}xx`, { redirect: 'manual' })).headers.get('location')).toBe('https://app.baarali.test');

    const page = await app.request(`/n/u/${token}`);
    expect(await page.text()).toContain('Me désinscrire');
    const optedOut = async () => (await store.listAccounts(T0)).find((s) => s.account.id === AWA.id)?.account.emailOptOutAt;
    expect(await optedOut()).toBeUndefined();
    await app.request(`/n/u/${token}`, { method: 'POST' });
    expect(await optedOut()).toBeTypeOf('number');
  });
});
