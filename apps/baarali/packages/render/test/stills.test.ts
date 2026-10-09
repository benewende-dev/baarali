import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RenderQueue } from '../src/queue.js';
import { createApp } from '../src/server.js';
import { compositionSize, MAX_STILLS, stillTimes, StillsDesk, type Stiller } from '../src/stills.js';

const SECRET = 'x'.repeat(40);
const html = `<!doctype html><html><body><div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1080" data-height="1920"></div></body></html>`;
const files = [{ path: 'index.html', data: Buffer.from(html).toString('base64') }];

async function setup(stiller: Stiller, waitMs?: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stills-'));
  const desk = new StillsDesk({ root, stiller, waitMs });
  const queue = new RenderQueue({ root, renderer: async () => {}, concurrency: 1, ttlMs: 1000, now: Date.now });
  const app = createApp({ queue, secret: SECRET, stills: desk });
  const post = (times: string, auth = SECRET) =>
    app.request(`/stills?times=${times}`, { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ files }) });
  return { root, desk, post };
}

describe('stills', () => {
  it('reads the size and keeps the times inside the composition', () => {
    expect(compositionSize(html)).toEqual({ width: 1080, height: 1920 });
    expect(compositionSize('<div data-composition-id="x" data-width="0"></div>')).toBeNull();
    expect(stillTimes('1.5,-2,99,1.5,abc', 10)).toEqual([1.5, 0, 9.966666666666667]);
    expect(stillTimes('', 10)).toBeNull();
    expect(stillTimes('1,2,3,4,5,6,7,8', 10)).toHaveLength(MAX_STILLS);
  });

  it('answers the stills in order, for the secret only, and cleans up', async () => {
    let seen: { dir: string; times: number[]; width: number } | null = null;
    const { root, post } = await setup(async (task) => {
      seen = { dir: task.dir, times: task.times, width: task.width };
      expect(await fs.readFile(path.join(task.dir, 'index.html'), 'utf8')).toBe(html);
      return task.times.map((t) => Buffer.from(`jpeg@${t}`));
    });
    expect((await post('2', 'wrong'.repeat(8))).status).toBe(401);
    const res = await post('4,2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stills: Array<{ t: number; data: string }> };
    expect(body.stills.map((s) => [s.t, Buffer.from(s.data, 'base64').toString()])).toEqual([[4, 'jpeg@4'], [2, 'jpeg@2']]);
    expect(seen!.width).toBe(1080);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('refuses a request without times', async () => {
    const { post } = await setup(async () => []);
    expect((await post('')).status).toBe(400);
  });

  it('takes one request at a time, and gives up past the wait', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let running = 0;
    let most = 0;
    const { desk, post } = await setup(async (task) => {
      running++;
      most = Math.max(most, running);
      await gate;
      running--;
      return task.times.map(() => Buffer.from('x'));
    }, 50);
    const first = post('1');
    await new Promise((r) => setTimeout(r, 10));
    expect(desk.busy).toBe(true);
    const second = await post('2');
    expect(second.status).toBe(503);
    open();
    expect((await first).status).toBe(200);
    expect(most).toBe(1);
    expect(desk.busy).toBe(false);
  });
});
