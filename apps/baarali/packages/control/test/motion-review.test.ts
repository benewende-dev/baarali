import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { POSTERS_PER_HOUR, REVIEW_MODEL, underHourlyLimit } from '../src/motion-review.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';

const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);
const PLANS: Plan[] = [{ id: 'essentiel', category: 'starter', displayName: 'Essentiel', weekCredits: 1000, monthlyPrices: [], models: null }];

interface Seen { url: string; init: RequestInit & { headers?: Record<string, string> }; body: string | null }

function setup(respond: (s: Seen) => Response, opts: { render?: boolean; account?: string } = {}) {
  const id = opts.account ?? 'me';
  const accounts = new Map<string, Account>([[hashToken('me'), { id, email: null, planId: 'essentiel', createdAt: T0 }]]);
  const store = new MemoryStore(accounts, PLANS);
  const seen: Seen[] = [];
  const app = createApp({
    store, openRouterKey: 'or', publicUrl: 'https://c.test', appName: 'Baarali', now: () => T0, mediaPacks: [],
    render: opts.render === false ? undefined : { url: 'http://render.test', secret: 'rs' },
    fetch: (async (url: string, init: RequestInit = {}) => {
      const body = init.body ? await new Response(init.body as BodyInit).text() : null;
      const s = { url: String(url), init: init as Seen['init'], body };
      seen.push(s);
      return respond(s);
    }) as typeof fetch,
  });
  const project = JSON.stringify({ files: [{ path: 'index.html', data: 'PGh0bWw+' }] });
  const review = (q: string) =>
    app.request(`/v1/motion/review?${q}`, { method: 'POST', body: project, headers: { authorization: 'Bearer me', 'content-type': 'application/json', 'content-length': String(project.length) } });
  const poster = (q: string) =>
    app.request(`/v1/motion/poster?${q}`, { method: 'POST', body: project, headers: { authorization: 'Bearer me', 'content-type': 'application/json', 'content-length': String(project.length) } });
  return { store, seen, review, poster, project };
}

const stills = () => Response.json({ stills: [{ t: 2, data: 'AAA' }, { t: 6, data: 'BBB' }] });
const vision = (text: string | null, cost = 0.0005) => Response.json({ choices: [{ message: { content: text } }], usage: { cost } });

describe('/v1/motion/review', () => {
  it('takes the stills, has them reviewed, and charges the review to the quota', async () => {
    const { review, seen, store, project } = setup((s) => (s.url.startsWith('http://render.test') ? stills() : vision('Frame 2: OK\nVerdict: ready')), { account: 'me-1' });
    const res = await review('times=2,6&brief=Promo%20-20%25');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stills: [{ t: 2, data: 'AAA' }, { t: 6, data: 'BBB' }], review: 'Frame 2: OK\nVerdict: ready', model: REVIEW_MODEL });
    expect(seen[0].url).toBe('http://render.test/stills?times=2%2C6');
    expect(seen[0].init.headers).toMatchObject({ authorization: 'Bearer rs' });
    expect(seen[0].body).toBe(project);
    const call = JSON.parse(seen[1].body!);
    expect(seen[1].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.model).toBe(REVIEW_MODEL);
    const parts = call.messages[1].content;
    expect(parts[0].text).toContain('Promo -20%');
    expect(parts.filter((p: { type: string }) => p.type === 'image_url').map((p: { image_url: { url: string } }) => p.image_url.url)).toEqual(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']);
    expect(store.usage.filter((u) => u.accountId === 'me-1')).toMatchObject([{ path: '/motion/review', model: REVIEW_MODEL, status: 200 }]);
    expect(store.usage.find((u) => u.accountId === 'me-1')!.credits).toBeGreaterThan(0);
  });

  it('still gives the stills when the review fails', async () => {
    const { review } = setup((s) => (s.url.startsWith('http://render.test') ? stills() : new Response('down', { status: 502 })), { account: 'me-2' });
    expect(await (await review('times=2,6')).json()).toMatchObject({ stills: [{ t: 2 }, { t: 6 }], review: null });
  });

  it('says why the stills could not be taken', async () => {
    const bad = setup(() => Response.json({ error: 'index.html has no root with data-width and data-height' }, { status: 400 }), { account: 'me-3' });
    expect(await (await bad.review('times=1')).json()).toMatchObject({ error: { code: 'invalid_project', message: 'index.html has no root with data-width and data-height' } });
    const busy = setup(() => Response.json({ error: 'busy' }, { status: 503 }), { account: 'me-4' });
    expect((await busy.review('times=1')).status).toBe(503);
    const none = setup(() => stills(), { render: false, account: 'me-5' });
    expect((await none.review('times=1')).status).toBe(503);
    const noTimes = setup(() => stills(), { account: 'me-6' });
    expect((await noTimes.review('times=abc')).status).toBe(400);
  });

  it('stops a loop of previews', () => {
    for (let i = 0; i < 3; i++) expect(underHourlyLimit('loop', T0 + i, 3)).toBe(true);
    expect(underHourlyLimit('loop', T0 + 10, 3)).toBe(false);
    expect(underHourlyLimit('loop', T0 + 3_600_001, 3)).toBe(true);
  });
});

describe('/v1/motion/poster', () => {
  it('relays the project to the render service, free, logged, and bounded per hour', async () => {
    const { poster, seen, store, project } = setup(() => Response.json({ pngs: [{ t: 3.9, data: 'PNG' }], pdf: 'PDF' }), { account: 'po-1' });
    const res = await poster('times=1.95,3.95&title=Carte%20Awa');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pngs: [{ t: 3.9, data: 'PNG' }], pdf: 'PDF' });
    expect(seen[0].url).toBe('http://render.test/poster?times=1.95%2C3.95&title=Carte+Awa');
    expect(seen[0].init.headers).toMatchObject({ authorization: 'Bearer rs' });
    expect(seen[0].body).toBe(project);
    expect(store.usage.filter((u) => u.accountId === 'po-1')).toMatchObject([{ path: '/motion/poster', status: 200, credits: 0 }]);
    for (let i = 1; i < POSTERS_PER_HOUR; i++) await poster('times=1');
    expect(await (await poster('times=1')).json()).toMatchObject({ error: { code: 'too_many_posters' } });
  });

  it('says why a poster could not be made', async () => {
    const bad = setup(() => Response.json({ error: 'data-print-mm does not match the page' }, { status: 400 }), { account: 'po-2' });
    expect(await (await bad.poster('times=1')).json()).toMatchObject({ error: { code: 'invalid_project', message: 'data-print-mm does not match the page' } });
    const none = setup(() => Response.json({}), { render: false, account: 'po-3' });
    expect((await none.poster('times=1')).status).toBe(503);
    expect((await bad.poster('times=x')).status).toBe(400);
  });
});
