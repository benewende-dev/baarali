import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { MAX_PROJECT_BYTES } from './project.js';
import { CONTENT_TYPES, type Job, type RenderQueue } from './queue.js';
import type { StillsDesk } from './stills.js';

// baarali-render's HTTP API. Only the control plane calls it, over Flycast,
// with the shared secret: the control plane counts the minutes and the
// credits, this service only renders.

// Fly's proxy may send the next request to another machine: the control
// plane pins it to this one with fly-force-instance-id.
const machine = process.env.FLY_MACHINE_ID ?? null;

const view = (j: Job) => ({
  id: j.id,
  machine,
  status: j.status,
  progress: Math.round(j.progress * 100) / 100,
  format: j.format,
  fps: j.fps,
  seconds: j.seconds,
  bytes: j.bytes,
  error: j.error,
});

export function createApp(deps: { queue: RenderQueue; secret: string; stills?: StillsDesk }) {
  const app = new Hono();
  const expected = Buffer.from(`Bearer ${deps.secret}`);

  app.get('/health', (c) => c.json({ ok: true, busy: deps.queue.busy || !!deps.stills?.busy }));

  const authorized = createMiddleware(async (c, next) => {
    const given = Buffer.from(c.req.header('authorization') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
  app.use('/jobs/*', authorized);
  app.use('/stills', authorized);
  app.use('/poster', authorized);

  // The agent's preview (stills.ts): a few frames, answered at once.
  app.post('/stills', bodyLimit({ maxSize: Math.ceil(MAX_PROJECT_BYTES * 1.4), onError: (c) => c.json({ error: 'The project is too large' }, 413) }), async (c) => {
    if (!deps.stills) return c.json({ error: 'Stills are not available' }, 503);
    let files: unknown;
    try {
      files = ((await c.req.json()) as { files?: unknown }).files;
    } catch {
      return c.json({ error: 'Expected a JSON body' }, 400);
    }
    try {
      const r = await deps.stills.take(files, c.req.query('times'));
      return r.ok ? c.json({ stills: r.stills }) : c.json({ error: r.message }, r.status);
    } catch (err) {
      console.error('[render] stills', err);
      return c.json({ error: 'The stills failed' }, 500);
    }
  });

  // Posters (poster.ts): PNGs, and on paper the printer's PDF, answered at once.
  app.post('/poster', bodyLimit({ maxSize: Math.ceil(MAX_PROJECT_BYTES * 1.4), onError: (c) => c.json({ error: 'The project is too large' }, 413) }), async (c) => {
    if (!deps.stills) return c.json({ error: 'Posters are not available' }, 503);
    let files: unknown;
    try {
      files = ((await c.req.json()) as { files?: unknown }).files;
    } catch {
      return c.json({ error: 'Expected a JSON body' }, 400);
    }
    try {
      const r = await deps.stills.poster(files, c.req.query('times'), c.req.query('title') ?? '');
      return r.ok ? c.json({ pngs: r.pngs, pdf: r.pdf }) : c.json({ error: r.message }, r.status);
    } catch (err) {
      console.error('[render] poster', err);
      return c.json({ error: 'The poster failed' }, 500);
    }
  });

  // base64 grows a file by a third.
  app.post('/jobs/new', bodyLimit({ maxSize: Math.ceil(MAX_PROJECT_BYTES * 1.4), onError: (c) => c.json({ error: 'The project is too large' }, 413) }), async (c) => {
    // The control plane streams the instance's body through untouched: what
    // it decided (id, format, fps) comes in the query.
    let files: unknown;
    try {
      files = ((await c.req.json()) as { files?: unknown }).files;
    } catch {
      return c.json({ error: 'Expected a JSON body' }, 400);
    }
    const q = c.req.query();
    const r = await deps.queue.submit({
      id: q.id,
      format: q.format,
      fps: q.fps === undefined ? undefined : Number(q.fps),
      seconds: q.seconds === undefined ? undefined : Number(q.seconds),
      files,
    });
    if (!r.ok) return c.json({ error: r.message }, r.status);
    return c.json(view(r.job), 202);
  });

  app.get('/jobs/:id', (c) => {
    const job = deps.queue.get(c.req.param('id'));
    return job ? c.json(view(job)) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/jobs/:id/file', async (c) => {
    const job = deps.queue.get(c.req.param('id'));
    if (!job || job.status !== 'done') return c.json({ error: 'not_found' }, 404);
    const file = deps.queue.fileOf(job);
    try {
      const { size } = await fs.stat(file);
      return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        headers: { 'content-type': CONTENT_TYPES[job.format], 'content-length': String(size) },
      });
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
  });

  return app;
}
