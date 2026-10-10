import fs from 'node:fs/promises';
import path from 'node:path';
import { bleedOf, MAX_PAGES, printOf } from './poster.js';
import { checkProject, writeProject } from './project.js';

// Still frames of a composition (decided 09/10/2026): the agent's preview.
// It writes its motion design blind; a few frames, read back by a vision
// model on the control plane, let it see what it made and fix it before the
// person does. Taken one request at a time per machine, beside the exports:
// one more browser, for a few seconds.

export const MAX_STILLS = 6;
/** The long side of a still: enough for a vision model to read the text, small enough to send. */
export const STILL_SIDE = 960;
/** A request waits this long for the previous one to finish, then is refused. */
export const STILLS_WAIT_MS = 60_000;

export interface StillsTask {
  /** The project folder, index.html at its root. */
  dir: string;
  times: number[];
  width: number;
  height: number;
}

/** JPEG stills of the composition at the given times, in their order. */
export type Stiller = (task: StillsTask) => Promise<Buffer[]>;

/** A poster (poster.ts): one page per time; on paper, `print` gives the trim and the bleed in mm. */
export interface PosterTask extends StillsTask {
  print: { trim: [number, number]; bleed: number } | null;
  title: string;
}

/** The PNGs, in the order of the times, and on paper the printer's PDF. */
export type Posterer = (task: PosterTask) => Promise<{ pngs: Buffer[]; pdf: Buffer | null }>;

export type PosterResult =
  | { ok: true; pngs: Array<{ t: number; data: string }>; pdf: string | null }
  | { ok: false; status: 400 | 503; message: string };

export type StillsResult =
  | { ok: true; stills: Array<{ t: number; data: string }> }
  | { ok: false; status: 400 | 503; message: string };

/** The root's data-width and data-height, or null. */
export function compositionSize(html: string): { width: number; height: number } | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0];
  if (!root) return null;
  const width = Number(/\bdata-width\s*=\s*["']?(\d+)/i.exec(root)?.[1]);
  const height = Number(/\bdata-height\s*=\s*["']?(\d+)/i.exec(root)?.[1]);
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? { width, height } : null;
}

/** The times asked for, inside the composition, rounded to the frame, without repeats. */
export function stillTimes(raw: string | undefined, seconds: number): number[] | null {
  if (!raw) return null;
  const last = Math.max(0, seconds - 1 / 30);
  const times = raw
    .split(',')
    .map(Number)
    .filter((t) => Number.isFinite(t))
    .map((t) => Math.round(Math.min(last, Math.max(0, t)) * 30) / 30);
  const unique = [...new Set(times)].slice(0, MAX_STILLS);
  return unique.length > 0 ? unique : null;
}

export class StillsDesk {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly deps: { root: string; stiller: Stiller; poster?: Posterer; waitMs?: number }) {}

  /** A request is waiting or being served: the machine must not stop. */
  get busy(): boolean {
    return this.pending > 0;
  }

  async take(files: unknown, rawTimes: string | undefined): Promise<StillsResult> {
    const project = checkProject(files);
    if (!project.ok) return { ok: false, status: 400, message: project.message };
    const html = project.files.find((f) => f.path === 'index.html')!.bytes.toString('utf8');
    const size = compositionSize(html);
    if (!size) return { ok: false, status: 400, message: 'index.html has no root with data-width and data-height' };
    const times = stillTimes(rawTimes, project.seconds);
    if (!times) return { ok: false, status: 400, message: `times is a list of up to ${MAX_STILLS} seconds, e.g. 1.5,4,8` };
    const r = await this.turn(project.files, (dir) => this.deps.stiller({ dir, times, ...size }));
    return r.ok ? { ok: true, stills: r.value.map((b, i) => ({ t: times[i], data: b.toString('base64') })) } : r;
  }

  /** A poster: PNGs, and the printer's PDF when the root is on paper (data-print-mm). */
  async poster(files: unknown, rawTimes: string | undefined, title = ''): Promise<PosterResult> {
    if (!this.deps.poster) return { ok: false, status: 503, message: 'Posters are not available' };
    const project = checkProject(files);
    if (!project.ok) return { ok: false, status: 400, message: project.message };
    const html = project.files.find((f) => f.path === 'index.html')!.bytes.toString('utf8');
    const size = compositionSize(html);
    if (!size) return { ok: false, status: 400, message: 'index.html has no root with data-width and data-height' };
    const times = stillTimes(rawTimes, project.seconds)?.slice(0, MAX_PAGES);
    if (!times) return { ok: false, status: 400, message: `times is a list of up to ${MAX_PAGES} seconds, one page each` };
    const trim = printOf(html);
    const bleed = trim ? bleedOf(size.width, size.height, trim) : null;
    if (trim && bleed === null) return { ok: false, status: 400, message: 'data-print-mm does not match the page: data-width and data-height are the trim plus the bleed, at 96 px an inch' };
    const poster = this.deps.poster;
    const r = await this.turn(project.files, (dir) => poster({ dir, times, ...size, print: trim ? { trim, bleed: bleed! } : null, title: title.slice(0, 120) }));
    if (!r.ok) return r;
    return { ok: true, pngs: r.value.pngs.map((b, i) => ({ t: times[i], data: b.toString('base64') })), pdf: r.value.pdf?.toString('base64') ?? null };
  }

  /** One request at a time on this machine: the project written out, the work done, the folder gone. */
  private async turn<T>(files: Array<{ path: string; bytes: Buffer }>, work: (dir: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; status: 503; message: string }> {
    this.pending++;
    try {
      const previous = this.tail;
      let release!: () => void;
      const mine = new Promise<void>((r) => (release = r));
      this.tail = previous.then(() => mine);
      const waited = await Promise.race([
        previous.then(() => true, () => true),
        new Promise<false>((r) => setTimeout(() => r(false), this.deps.waitMs ?? STILLS_WAIT_MS).unref()),
      ]);
      if (!waited) {
        // Our turn is given up: the next one must not wait for it.
        release();
        return { ok: false, status: 503, message: 'The preview machine is busy; try again in a minute' };
      }
      const dir = await fs.mkdtemp(path.join(this.deps.root, 'stills-'));
      try {
        await writeProject(dir, files);
        return { ok: true, value: await work(dir) };
      } finally {
        release();
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } finally {
      this.pending--;
    }
  }
}
