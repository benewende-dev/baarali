import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';

// GET /workspace/{rel-path} — the network twin of the Electron app://workspace
// protocol (apps/main/src/main.ts): serves note attachments/media to paired
// clients. Same traversal guard, authenticated like every other route.

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

/**
 * `bytes=a-b`, `bytes=a-` or `bytes=-n` within a file of `size` bytes; null
 * when absent, 'invalid' when it cannot be served (416). One range only: a
 * player never asks for more.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export function createWorkspaceRoutes(resolveWorkspacePath: (relPath: string) => string): Hono {
  const app = new Hono();

  app.get('/workspace/*', async (c) => {
    const relPath = decodeURIComponent(c.req.path.replace(/^\/workspace\/+/, ''));
    if (!relPath) return c.text('Not Found', 404);

    let absPath: string;
    try {
      absPath = resolveWorkspacePath(relPath);
    } catch {
      return c.text('Forbidden', 403);
    }

    try {
      // resolveWorkspacePath guards `..` traversal but not a symlink inside
      // the workspace pointing out of it — realpath both sides and require
      // containment before touching the file.
      const realRoot = await fs.realpath(resolveWorkspacePath(''));
      const realTarget = await fs.realpath(absPath);
      if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
        return c.text('Forbidden', 403);
      }
      const stats = await fs.stat(realTarget);
      if (!stats.isFile()) return c.text('Not Found', 404);
      const type = CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? 'application/octet-stream';
      // Byte ranges (08/10/2026): a video player seeks with them, and an MP4
      // whose index sits at the end of the file does not play without them.
      const range = parseRange(c.req.header('range'), stats.size);
      if (range === 'invalid') {
        return c.body(null, 416, { 'Content-Range': `bytes */${stats.size}`, 'Accept-Ranges': 'bytes' });
      }
      const { start, end } = range ?? { start: 0, end: stats.size - 1 };
      const length = stats.size === 0 ? 0 : end - start + 1;
      const body = length === 0 ? null : (Readable.toWeb(createReadStream(realTarget, { start, end })) as ReadableStream<Uint8Array>);
      return new Response(body, {
        status: range ? 206 : 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(length),
          'Accept-Ranges': 'bytes',
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stats.size}` } : {}),
        },
      });
    } catch {
      return c.text('Not Found', 404);
    }
  });

  return app;
}
