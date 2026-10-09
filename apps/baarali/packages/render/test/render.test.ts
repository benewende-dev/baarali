import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProject, compositionSeconds, safePath, usesGsap } from '../src/project.js';
import { RefusedError, RenderQueue, type Renderer } from '../src/queue.js';
import { createApp } from '../src/server.js';

const SECRET = 'x'.repeat(40);
const html = (seconds = 6) =>
  `<!doctype html><html><body><div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}" data-width="1080" data-height="1920"></div></body></html>`;
const b64 = (s: string) => Buffer.from(s).toString('base64');
const body = (over: Record<string, unknown> = {}) => ({
  id: 'job-0001',
  format: 'mp4',
  files: [{ path: 'index.html', data: b64(html()) }, { path: 'assets/logo.svg', data: b64('<svg/>') }],
  ...over,
});
/** As the control plane sends it: the decisions in the query, the instance's body as it came. */
const post = (b: Record<string, unknown>) => {
  const { files, ...meta } = b;
  const q = new URLSearchParams(Object.entries(meta).map(([k, v]) => [k, String(v)]));
  return [`/jobs/new?${q}`, { method: 'POST', body: JSON.stringify({ files }) }] as const;
};

async function setup(renderer: Renderer) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'render-'));
  let now = 1_000;
  const queue = new RenderQueue({ root, renderer, concurrency: 1, ttlMs: 60_000, now: () => now });
  const app = createApp({ queue, secret: SECRET });
  const call = (p: string, init: RequestInit = {}) =>
    app.request(p, { ...init, headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  return { root, queue, app, call, tick: (ms: number) => (now += ms) };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe('project', () => {
  it('reads the root duration and refuses unsafe paths', () => {
    expect(compositionSeconds(html(12.5))).toBe(12.5);
    expect(compositionSeconds('<div data-duration="4"></div>')).toBeNull();
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'a\\b', '']) expect(safePath(bad)).toBeNull();
    expect(safePath('assets/clip.mp4')).toBe('assets/clip.mp4');
  });

  it('wants an index.html with a duration, within the limits', () => {
    expect(checkProject([{ path: 'a.html', data: b64(html()) }])).toMatchObject({ ok: false, message: 'The project has no index.html' });
    expect(checkProject([{ path: 'index.html', data: b64('<p>hi</p>') }])).toMatchObject({ ok: false });
    expect(checkProject([{ path: 'index.html', data: b64(html(301)) }])).toMatchObject({ ok: false, message: 'Longer than 300 s' });
    expect(checkProject(body().files)).toMatchObject({ ok: true, seconds: 6 });
  });

  it('spots GSAP', () => {
    expect(usesGsap('<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>')).toBe(true);
    expect(usesGsap('<script>gsap.to(".a", {x: 1})</script>')).toBe(true);
    expect(usesGsap('<script>hf(".a", [], {at: 0, d: 1})</script>')).toBe(false);
  });
});

describe('render service', () => {
  it('needs the secret', async () => {
    const { app } = await setup(async () => {});
    expect((await app.request('/jobs/job-0001')).status).toBe(401);
    expect((await app.request('/jobs/job-0001', { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await app.request('/health')).status).toBe(200);
  });

  it('renders a job, serves its file once done, and forgets it after the ttl', async () => {
    const seen: string[] = [];
    const { call, queue, root, tick } = await setup(async (task, progress) => {
      seen.push(await fs.readFile(path.join(task.dir, 'assets/logo.svg'), 'utf8'));
      progress(0.5);
      await fs.writeFile(task.out, 'VIDEO');
    });
    const res = await call(...post(body()));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ id: 'job-0001', seconds: 6, format: 'mp4' });
    // The same id again is refused, not rendered twice.
    expect((await call(...post(body()))).status).toBe(409);
    await until(() => queue.get('job-0001')?.status === 'done');
    expect(seen).toEqual(['<svg/>']);
    expect(await (await call('/jobs/job-0001')).json()).toMatchObject({ status: 'done', progress: 1, bytes: 5, error: null });
    const file = await call('/jobs/job-0001/file');
    expect(file.headers.get('content-type')).toBe('video/mp4');
    expect(await file.text()).toBe('VIDEO');
    // The sources went once the file was made; the file goes after the ttl.
    await expect(fs.access(path.join(root, 'job-0001', 'project'))).rejects.toThrow();
    tick(61_000);
    expect(await queue.sweep()).toBe(1);
    expect((await call('/jobs/job-0001')).status).toBe(404);
  });

  it("tells a composition's own fault, and hides ours", async () => {
    const { call, queue } = await setup(async (task) => {
      if (task.format === 'gif') throw new RefusedError('GSAP is not allowed');
      throw new Error('chrome crashed at /tmp/secret');
    });
    await call(...post(body({ id: 'job-gif-01', format: 'gif' })));
    await call(...post(body({ id: 'job-mp4-01' })));
    await until(() => queue.get('job-mp4-01')?.status === 'failed');
    expect(queue.get('job-gif-01')).toMatchObject({ status: 'failed', error: 'GSAP is not allowed' });
    expect(queue.get('job-mp4-01')).toMatchObject({ status: 'failed', error: 'The render failed' });
    expect((await call('/jobs/job-mp4-01/file')).status).toBe(404);
  });

  it('renders one at a time and refuses bad requests', async () => {
    let active = 0;
    let most = 0;
    const { call, queue } = await setup(async (task) => {
      active++;
      most = Math.max(most, active);
      await new Promise((r) => setTimeout(r, 10));
      await fs.writeFile(task.out, 'x');
      active--;
    });
    for (const id of ['job-a-0001', 'job-b-0001', 'job-c-0001']) await call(...post(body({ id })));
    await until(() => queue.get('job-c-0001')?.status === 'done');
    expect(most).toBe(1);
    expect((await call(...post(body({ id: 'job-d-0001', format: 'avi' })))).status).toBe(400);
    expect((await call(...post(body({ id: 'job-e-0001', fps: 25 })))).status).toBe(400);
    expect((await call(...post(body({ id: 'x' })))).status).toBe(400);
    expect((await call('/jobs/new?id=job-f-0001&format=mp4', { method: 'POST', body: '{' })).status).toBe(400);
  });

  it('refuses a project whose duration is not the one announced, before rendering it', async () => {
    let rendered = 0;
    const { call, queue } = await setup(async (task) => {
      rendered++;
      await fs.writeFile(task.out, 'x');
    });
    const wrong = await call(...post(body({ id: 'job-lie-0001', seconds: 2 })));
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe('The composition lasts 6 s, not the 2 s announced');
    expect(queue.get('job-lie-0001')).toBeNull();
    // Whole seconds are what is counted: 5.4 s announced for 6 s is the same export.
    expect((await call(...post(body({ id: 'job-ok-0001', seconds: 5.4 })))).status).toBe(202);
    await until(() => queue.get('job-ok-0001')?.status === 'done');
    expect(rendered).toBe(1);
  });
});

describe('capture browsers', () => {
  it('asks the producer for RENDER_WORKERS browsers, or lets it decide', async () => {
    const { captureWorkers } = await import('../src/hyperframes.js');
    expect(captureWorkers({ RENDER_WORKERS: '4' })).toBe(4);
    expect(captureWorkers({})).toBeUndefined();
    expect(captureWorkers({ RENDER_WORKERS: 'many' })).toBeUndefined();
    expect(captureWorkers({ RENDER_WORKERS: '0' })).toBeUndefined();
  });
});
