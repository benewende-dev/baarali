import fs from 'node:fs/promises';
import path from 'node:path';

// A motion project as the control plane relays it from an instance: the
// folder's files, base64. Everything a composition needs travels with it
// (motion-mcp.ts copies the logo and the media into assets/), so the page
// renders from this folder alone.

export const OUTPUT_FORMATS = ['mp4', 'mp4-light', 'gif', 'webm'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const MAX_FILES = 200;
export const MAX_PROJECT_BYTES = 150 * 1024 * 1024;
/** Five minutes: longer is a film, not a motion design. */
export const MAX_SECONDS = 300;

export interface ProjectFile {
  path: string;
  /** base64 */
  data: string;
}

export type ProjectCheck = { ok: true; files: Array<{ path: string; bytes: Buffer }>; seconds: number } | { ok: false; message: string };

/** The root's data-duration, in seconds, or null when the root has none. */
export function compositionSeconds(html: string): number | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0];
  const value = root ? /\bdata-duration\s*=\s*["']?([\d.]+)/i.exec(root)?.[1] : undefined;
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Plain relative paths only: no parent, no absolute, no hidden trick. */
export function safePath(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.length > 200 || p.includes('\0') || p.includes('\\')) return null;
  const normal = path.posix.normalize(p);
  if (normal.startsWith('/') || normal === '.' || normal.startsWith('../') || normal.split('/').some((s) => s === '..' || s === '')) return null;
  return normal;
}

export function checkProject(raw: unknown): ProjectCheck {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: 'files must be a non-empty list' };
  if (raw.length > MAX_FILES) return { ok: false, message: `At most ${MAX_FILES} files` };
  const files: Array<{ path: string; bytes: Buffer }> = [];
  const seen = new Set<string>();
  let total = 0;
  for (const f of raw as Array<Partial<ProjectFile>>) {
    const p = safePath(f?.path);
    if (!p) return { ok: false, message: `Bad file path: ${String(f?.path).slice(0, 80)}` };
    if (seen.has(p)) return { ok: false, message: `Twice the same file: ${p}` };
    if (typeof f.data !== 'string') return { ok: false, message: `No data for ${p}` };
    const bytes = Buffer.from(f.data, 'base64');
    total += bytes.length;
    if (total > MAX_PROJECT_BYTES) return { ok: false, message: `The project is over ${MAX_PROJECT_BYTES / 1024 / 1024} MB` };
    seen.add(p);
    files.push({ path: p, bytes });
  }
  const index = files.find((f) => f.path === 'index.html');
  if (!index) return { ok: false, message: 'The project has no index.html' };
  const seconds = compositionSeconds(index.bytes.toString('utf8'));
  if (seconds === null) return { ok: false, message: 'index.html has no root with data-composition-id and data-duration' };
  if (seconds > MAX_SECONDS) return { ok: false, message: `Longer than ${MAX_SECONDS} s` };
  return { ok: true, files, seconds };
}

export async function writeProject(dir: string, files: Array<{ path: string; bytes: Buffer }>): Promise<void> {
  for (const f of files) {
    const target = path.join(dir, f.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, f.bytes);
  }
}

/**
 * Our own rule on top of HyperFrames' lint: never GSAP, whose licence
 * forbids no-code animation builders (decided 08/10/2026). The templates use
 * the Web Animations API; an agent's edit must not bring GSAP back.
 */
export function usesGsap(html: string): boolean {
  return /<script[^>]+src=["'][^"']*gsap/i.test(html) || /\bgsap\s*\.\s*(to|from|fromTo|timeline|set|registerPlugin)\s*\(/.test(html);
}
