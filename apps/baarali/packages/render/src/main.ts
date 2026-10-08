import fs from 'node:fs/promises';
import process from 'node:process';
import { serve } from '@hono/node-server';
import { hyperframesRenderer } from './hyperframes.js';
import { RenderQueue } from './queue.js';
import { createApp } from './server.js';

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
setInterval(() => void queue.sweep().catch((err) => console.error('[render] sweep', err)), 5 * 60 * 1000).unref();

// The machine stops itself once idle, never in the middle of a render: Fly's
// own auto-stop counts requests, and a long render may go minutes without one.
// The next request starts it again (fly.toml).
const IDLE_MS = 15 * 60 * 1000;
let lastActivity = Date.now();
setInterval(() => {
  if (queue.busy) lastActivity = Date.now();
  else if (Date.now() - lastActivity > IDLE_MS) {
    console.log('[render] idle, stopping');
    process.exit(0);
  }
}, 30_000).unref();

const app = createApp({ queue, secret });
const port = Number(process.env.PORT ?? '8080');
serve({
  fetch: (req: Request) => {
    // Fly's health checks are not work: they must not keep the machine up.
    if (new URL(req.url).pathname.startsWith('/jobs')) lastActivity = Date.now();
    return app.fetch(req);
  },
  port,
  hostname: '::',
});
console.log(`[render] listening on ${port}`);
