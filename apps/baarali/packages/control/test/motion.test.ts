import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { billedSeconds, monthStart, nextMonthStart, renderWindow, splitFor } from '../src/motion.js';
import { WEEK_MS } from '../src/quota.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';

const T0 = Date.UTC(2026, 9, 8, 12, 0, 0);
const plan = (id: string, category: Plan['category']): Plan => ({ id, category, displayName: id, weekCredits: 1000, monthlyPrices: [], models: null });
const PLANS = [plan('essentiel', 'starter'), plan('decouverte', 'free'), plan('pro-200', 'pro'), plan('semaine', 'starter')];

interface Seen { url: string; init: RequestInit & { headers?: Record<string, string> }; body: string | null }

function setup(respond: (s: Seen) => Response, opts: { planId?: string; credits?: number; render?: boolean; createdAt?: number } = {}) {
  const accounts = new Map<string, Account>([
    [hashToken('me'), { id: 'me', email: null, planId: opts.planId ?? 'essentiel', createdAt: opts.createdAt ?? T0 }],
    [hashToken('other'), { id: 'other', email: null, planId: 'essentiel', createdAt: T0 }],
  ]);
  const store = new MemoryStore(accounts, PLANS);
  if (opts.credits) void store.applyMediaEntry({ accountId: 'me', at: T0, kind: 'topup', credits: opts.credits, reference: 'seed' });
  const seen: Seen[] = [];
  let now = T0;
  const app = createApp({
    store, openRouterKey: 'or', publicUrl: 'https://c.test', appName: 'Baarali', now: () => now, mediaPacks: [],
    render: opts.render === false ? undefined : { url: 'http://render.test', secret: 'rs' },
    fetch: (async (url: string, init: RequestInit = {}) => {
      const body = init.body ? await new Response(init.body as BodyInit).text() : null;
      const s = { url: String(url), init: init as Seen['init'], body };
      seen.push(s);
      return respond(s);
    }) as typeof fetch,
  });
  const call = (path: string, init: RequestInit = {}, token = 'me') =>
    app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) ?? {}) } });
  const project = JSON.stringify({ files: [{ path: 'index.html', data: 'PGh0bWw+' }] });
  const submit = (q: string, token = 'me') =>
    call(`/v1/motion/renders?${q}`, { method: 'POST', body: project, headers: { 'content-type': 'application/json', 'content-length': String(project.length) } }, token);
  return { store, seen, call, submit, project, tick: (ms: number) => (now += ms) };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const accepted = (seconds: number) => json({ id: 'x', status: 'queued', machine: 'm-42', seconds }, 202);

describe('Studio Motion export rules', () => {
  it('gives each plan its minutes and counts 60 images a second twice', () => {
    const born = { createdAt: T0 - 10 * 24 * 3600_000 };
    expect(renderWindow(PLANS[0], born, T0)).toEqual({ per: 'month', minutes: 30, start: monthStart(T0), end: nextMonthStart(T0) });
    expect(renderWindow(PLANS[1], born, T0).minutes).toBe(2);
    expect(renderWindow(PLANS[2], born, T0).minutes).toBe(300);
    expect(renderWindow(plan('pro-100', 'pro'), born, T0).minutes).toBe(120);
    expect(renderWindow(null, born, T0).minutes).toBe(0);
    // Semaine: 3 minutes a week, the quota's week (here the second since the account opened).
    expect(renderWindow(PLANS[3], born, T0)).toEqual({ per: 'week', minutes: 3, start: born.createdAt + WEEK_MS, end: born.createdAt + 2 * WEEK_MS });
    expect(billedSeconds(9.2, 30)).toBe(10);
    expect(billedSeconds(10, 60)).toBe(20);
    expect(splitFor(30, 120)({ included: 100, extra: 0 })).toEqual({ included: 20, credits: 1 });
    expect(splitFor(60, 0)({ included: 0, extra: 0 })).toEqual({ included: 0, credits: 3 });
  });

  it('counts the credits to the second over the period, not export by export', () => {
    // 10 s past the minutes, three times: 30 s, so 2 credits (3 a minute), not 3.
    const paid = [0, 10, 20].map((extra) => splitFor(10, 0)({ included: 0, extra }).credits);
    expect(paid).toEqual([1, 0, 1]);
    // 100 s in all, 5 credits, however it is cut.
    expect(splitFor(100, 0)({ included: 0, extra: 0 }).credits).toBe(5);
    expect(splitFor(70, 30)({ included: 0, extra: 0 })).toEqual({ included: 30, credits: 2 });
    expect(new Date(monthStart(T0)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(nextMonthStart(Date.UTC(2026, 11, 31))).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('/v1/motion', () => {
  it('streams the project to the render service and takes the minutes from the plan', async () => {
    const { submit, seen, store, project, call } = setup(() => accepted(10));
    const res = await submit('format=mp4&fps=30&seconds=10');
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'rendering', seconds: 10, included_seconds: 10, credits: 0, allowance: { total_seconds: 1800, used_seconds: 10 }, balance: 0 });
    expect(seen[0].url).toMatch(/^http:\/\/render\.test\/jobs\/new\?id=mr_[0-9a-f]{32}&format=mp4&fps=30$/);
    expect(seen[0].init.headers).toMatchObject({ authorization: 'Bearer rs', 'content-length': String(project.length) });
    expect(seen[0].body).toBe(project);
    expect(await store.motionUsage('me', monthStart(T0))).toEqual({ included: 10, extra: 0 });
    expect(await (await call('/v1/motion/allowance')).json()).toMatchObject({ period: 'month', total_seconds: 1800, used_seconds: 10, credits_per_minute: 3, resets_at: '2026-11-01T00:00:00.000Z' });
  });

  it('charges credits beyond the minutes, and refuses what they cannot pay before rendering', async () => {
    const free = setup(() => accepted(100), { planId: 'decouverte', credits: 4 });
    // 2 minutes included: 100 s fit, the next 100 s take 20 from them and 80 s of credits (4).
    expect(await (await free.submit('seconds=100')).json()).toMatchObject({ included_seconds: 100, credits: 0 });
    const second = await free.submit('seconds=100');
    expect(await second.json()).toMatchObject({ included_seconds: 20, credits: 4, balance: 0 });
    const third = await free.submit('seconds=100');
    expect(third.status).toBe(402);
    expect((await third.json()).error).toMatchObject({ code: 'insufficient_media_credits', cost: 5, balance: 0 });
    expect(free.seen).toHaveLength(2);
  });

  it('gives the Semaine plan 3 minutes for each paid week', async () => {
    const week = setup(() => accepted(120), { planId: 'semaine', credits: 10, createdAt: T0 - 3 * 24 * 3600_000 });
    const allowance = await (await week.call('/v1/motion/allowance')).json();
    expect(allowance).toMatchObject({ period: 'week', total_seconds: 180, used_seconds: 0, resets_at: new Date(T0 + 4 * 24 * 3600_000).toISOString() });
    expect(allowance).not.toHaveProperty('window');
    expect(await (await week.submit('seconds=120')).json()).toMatchObject({ included_seconds: 120, credits: 0 });
    // 60 s left: the next 120 s pay 60 s, 3 credits.
    expect(await (await week.submit('seconds=120')).json()).toMatchObject({ included_seconds: 60, credits: 3, allowance: { period: 'week', used_seconds: 180 } });
    // The next week, the minutes are back.
    week.tick(4 * 24 * 3600_000);
    expect(await (await week.submit('seconds=120')).json()).toMatchObject({ included_seconds: 120, credits: 0 });
    expect(await week.store.mediaBalance('me')).toBe(7);
  });

  it('follows the export to its file, on the machine that holds it', async () => {
    let state = 'rendering';
    const { submit, call, seen } = setup((s) => {
      if (s.url.includes('/jobs/new')) return accepted(6);
      if (s.url.endsWith('/file')) return new Response('VIDEO', { headers: { 'content-type': 'video/mp4', 'content-length': '5' } });
      return json({ status: state, progress: 0.4, bytes: state === 'done' ? 5 : null });
    });
    const { id } = await (await submit('format=mp4-light&seconds=6')).json();
    expect(await (await call(`/v1/motion/renders/${id}`)).json()).toMatchObject({ status: 'rendering', progress: 0.4 });
    expect(seen[1].init.headers).toMatchObject({ 'fly-force-instance-id': 'm-42' });
    expect((await call(`/v1/motion/renders/${id}/file`)).status).toBe(404); // not done yet
    state = 'done';
    expect(await (await call(`/v1/motion/renders/${id}`)).json()).toMatchObject({ status: 'done', progress: 1, bytes: 5 });
    const polls = seen.length;
    await call(`/v1/motion/renders/${id}`);
    expect(seen.length).toBe(polls); // finished: not asked again
    const file = await call(`/v1/motion/renders/${id}/file`);
    expect(file.headers.get('content-type')).toBe('video/mp4');
    expect(await file.text()).toBe('VIDEO');
    expect((await call(`/v1/motion/renders/${id}`, {}, 'other')).status).toBe(404);
    expect((await call(`/v1/motion/renders/${id}/file`, {}, 'other')).status).toBe(404);
  });

  it('gives back minutes and credits once when the render fails, with its reason', async () => {
    const { submit, call, store } = setup((s) => (s.url.includes('/jobs/new') ? accepted(60) : json({ status: 'failed', error: 'GSAP is not allowed' })), { planId: 'decouverte', credits: 10 });
    await submit('seconds=60');
    const { id } = await (await submit('seconds=60&fps=60')).json();
    expect(await store.mediaBalance('me')).toBe(7);
    expect(await (await call(`/v1/motion/renders/${id}`)).json()).toMatchObject({ status: 'failed', error: 'GSAP is not allowed' });
    await call(`/v1/motion/renders/${id}`);
    expect(await store.mediaBalance('me')).toBe(10);
    expect(store.ledger.filter((e) => e.kind === 'refund')).toHaveLength(1);
    expect(await store.motionUsage('me', monthStart(T0))).toEqual({ included: 60, extra: 0 });
  });

  it('refunds what the render service refuses, and a duration that lied', async () => {
    const bad = setup(() => json({ error: 'Bad file path: ../x' }, 400), { planId: 'decouverte' });
    const res = await bad.submit('seconds=10');
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('Bad file path');
    expect(await bad.store.motionUsage('me', monthStart(T0))).toEqual({ included: 0, extra: 0 });

    const liar = setup(() => accepted(90), { planId: 'decouverte' });
    expect((await liar.submit('seconds=5')).status).toBe(400);
    expect(await liar.store.motionUsage('me', monthStart(T0))).toEqual({ included: 0, extra: 0 });

    const down = setup(() => { throw new Error('ECONNREFUSED'); });
    expect((await down.submit('seconds=5')).status).toBe(502);
    expect(await down.store.motionUsage('me', monthStart(T0))).toEqual({ included: 0, extra: 0 });
  });

  it('checks the request and is off without the render service', async () => {
    const { submit, call } = setup(() => accepted(10));
    expect((await submit('format=avi&seconds=10')).status).toBe(400);
    expect((await submit('fps=25&seconds=10')).status).toBe(400);
    expect((await submit('seconds=400')).status).toBe(400);
    expect((await submit('format=mp4')).status).toBe(400);
    expect((await call('/v1/motion/renders?seconds=5', { method: 'POST', body: '' })).status).toBe(411);
    expect((await call('/v1/motion/allowance', {}, 'nobody')).status).toBe(401);
    const off = setup(() => accepted(10), { render: false });
    expect((await off.submit('seconds=10')).status).toBe(503);
  });
});
