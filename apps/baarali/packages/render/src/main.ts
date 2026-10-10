import fs from 'node:fs/promises';
import process from 'node:process';
import { serve } from '@hono/node-server';
import { hyperframesPoster, hyperframesRenderer, hyperframesStills } from './hyperframes.js';
import { RenderQueue } from './queue.js';
import { createApp } from './server.js';
import { StillsDesk } from './stills.js';

// baarali-render on Fly (Studio Motion step 2, decided 08/10/2026): Chrome,
// FFmpeg and the HyperFrames producer, reached by the control plane only.

const secret = process.env.BAARALI_RENDER_SECRET ?? '';
if (secret.length < 32) {
  console.error('[render] BAARALI_RENDER_SECRET (32 characters or more) is required');
  process.exit(1);
}
const root = process.env.RENDER_DIR ?? '/tmp/renders';
await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });

const queue = new RenderQueue({
  root,
  renderer: hyperframesRenderer({ ffmpeg: process.env.HYPERFRAMES_FFMPEG_PATH ?? 'ffmpeg' }),
  concurrency: Math.max(1, Number(process.env.RENDER_CONCURRENCY ?? '1')),
  // Two hours for the control plane to fetch the file.
  ttlMs: 2 * 60 * 60 * 1000,
  now: Date.now,
});
const stills = new StillsDesk({ root, stiller: hyperframesStills(), poster: hyperframesPoster({ ffmpeg: process.env.HYPERFRAMES_FFMPEG_PATH ?? 'ffmpeg' }) });
setInterval(() => void queue.sweep().catch((err) => console.error('[render] sweep', err)), 5 * 60 * 1000).unref();

// The machine stops itself once idle, never in the middle of a render: Fly's
// own auto-stop counts requests, and a long render may go minutes without one.
// The next request starts it again (fly.toml).
// 10 minutes (08/10/2026, was 15): the larger machine costs twice as much
// idle; the instance fetches a finished file within seconds anyway.
const IDLE_MS = 10 * 60 * 1000;
let lastActivity = Date.now();
setInterval(() => {
  if (queue.busy || stills.busy) lastActivity = Date.now();
  else if (Date.now() - lastActivity > IDLE_MS) {
    console.log('[render] idle, stopping');
    process.exit(0);
  }
}, 30_000).unref();

const app = createApp({ queue, secret, stills });
const port = Number(process.env.PORT ?? '8080');
serve({
  fetch: (req: Request) => {
    // Fly's health checks are not work: they must not keep the machine up.
    const p = new URL(req.url).pathname;
    if (p.startsWith('/jobs') || p === '/stills' || p === '/poster') lastActivity = Date.now();
    return app.fetch(req);
  },
  port,
  hostname: '::',
});
console.log(`[render] listening on ${port}`);
