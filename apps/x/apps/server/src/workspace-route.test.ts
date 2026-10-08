import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspaceRoutes, parseRange } from './workspace-route.js';

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-route-'));
  await fs.mkdir(path.join(root, 'Projects'));
  await fs.writeFile(path.join(root, 'Projects/clip.mp4'), '0123456789');
  const app = createWorkspaceRoutes((rel) => {
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('outside');
    return abs;
  });
  return (p: string, headers: Record<string, string> = {}) => app.request(p, { headers });
}

describe('GET /workspace', () => {
  it('serves the whole file and says it takes ranges', async () => {
    const get = await setup();
    const res = await get('/workspace/Projects/clip.mp4');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('0123456789');
  });

  it('serves a range, so a video player can seek to the index at the end', async () => {
    const get = await setup();
    const res = await get('/workspace/Projects/clip.mp4', { range: 'bytes=2-4' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(res.headers.get('content-length')).toBe('3');
    expect(await res.text()).toBe('234');
    expect(await (await get('/workspace/Projects/clip.mp4', { range: 'bytes=-3' })).text()).toBe('789');
    expect(await (await get('/workspace/Projects/clip.mp4', { range: 'bytes=8-' })).text()).toBe('89');
    const bad = await get('/workspace/Projects/clip.mp4', { range: 'bytes=20-' });
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe('bytes */10');
  });

  it('keeps out what is not a file of the workspace', async () => {
    const get = await setup();
    expect((await get('/workspace/Projects')).status).toBe(404);
    expect((await get('/workspace/..%2F..%2Fetc%2Fpasswd')).status).toBe(403);
  });

  it('reads the range header strictly', () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange('bytes=0-1', 10)).toEqual({ start: 0, end: 1 });
    expect(parseRange('bytes=5-100', 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange('bytes=-', 10)).toBe('invalid');
    expect(parseRange('items=0-1', 10)).toBe('invalid');
    expect(parseRange('bytes=4-2', 10)).toBe('invalid');
  });
});
