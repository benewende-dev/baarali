import fs from 'node:fs/promises';
import path from 'node:path';
import { checkProject, OUTPUT_FORMATS, writeProject, type OutputFormat } from './project.js';

// The render queue (Studio Motion step 2, decided 08/10/2026). One machine
// renders `concurrency` jobs at a time, Chrome being the costly part; the
// others wait their turn. A finished file waits `ttlMs` for the control
// plane to fetch it, then goes: the instance keeps its own copy.

export type JobStatus = 'queued' | 'rendering' | 'done' | 'failed';

export interface RenderTask {
  /** The project folder, index.html at its root. */
  dir: string;
  /** Where the file goes. */
  out: string;
  format: OutputFormat;
  fps: 30 | 60;
}

/** Renders one task; reports progress from 0 to 1. A RefusedError says why the composition cannot render. */
export type Renderer = (task: RenderTask, progress: (share: number) => void) => Promise<void>;

/** The composition itself is at fault: told to the agent as it is, so it fixes the file. */
export class RefusedError extends Error {}

export interface Job {
  id: string;
  format: OutputFormat;
  fps: 30 | 60;
  seconds: number;
  status: JobStatus;
  progress: number;
  error: string | null;
  bytes: number | null;
  createdAt: number;
  finishedAt: number | null;
}

export const EXTENSIONS: Record<OutputFormat, string> = { mp4: 'mp4', 'mp4-light': 'mp4', gif: 'gif', webm: 'webm' };
export const CONTENT_TYPES: Record<OutputFormat, string> = { mp4: 'video/mp4', 'mp4-light': 'video/mp4', gif: 'image/gif', webm: 'video/webm' };

export interface QueueDeps {
  root: string;
  renderer: Renderer;
  concurrency: number;
  ttlMs: number;
  now: () => number;
}

export type Submitted = { ok: true; job: Job } | { ok: false; status: 400 | 409; message: string };

const ID = /^[A-Za-z0-9_-]{8,64}$/;

export class RenderQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly waiting: string[] = [];
  private running = 0;

  constructor(private readonly deps: QueueDeps) {}

  private dirOf(id: string) {
    return path.join(this.deps.root, id);
  }

  fileOf(job: Job): string {
    return path.join(this.dirOf(job.id), `out.${EXTENSIONS[job.format]}`);
  }

  get(id: string): Job | null {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async submit(body: unknown): Promise<Submitted> {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (typeof b.id !== 'string' || !ID.test(b.id)) return { ok: false, status: 400, message: 'id must be 8 to 64 letters, digits, - or _' };
    // The control plane retries with the same id: the job is not rendered twice.
    if (this.jobs.has(b.id)) return { ok: false, status: 409, message: 'This job already exists' };
    if (!OUTPUT_FORMATS.includes(b.format as OutputFormat)) return { ok: false, status: 400, message: `format is one of ${OUTPUT_FORMATS.join(', ')}` };
    const fps = b.fps === undefined ? 30 : b.fps;
    if (fps !== 30 && fps !== 60) return { ok: false, status: 400, message: 'fps is 30 or 60' };
    const project = checkProject(b.files);
    if (!project.ok) return { ok: false, status: 400, message: project.message };

    const job: Job = {
      id: b.id,
      format: b.format as OutputFormat,
      fps,
      seconds: project.seconds,
      status: 'queued',
      progress: 0,
      error: null,
      bytes: null,
      createdAt: this.deps.now(),
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    await writeProject(path.join(this.dirOf(job.id), 'project'), project.files);
    this.waiting.push(job.id);
    this.pump();
    return { ok: true, job: { ...job } };
  }

  private pump() {
    while (this.running < this.deps.concurrency && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      this.running++;
      void this.run(id).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'rendering';
    let outcome: { bytes: number } | { error: string };
    try {
      await this.deps.renderer(
        { dir: path.join(this.dirOf(id), 'project'), out: this.fileOf(job), format: job.format, fps: job.fps },
        (share) => {
          job.progress = Math.max(job.progress, Math.min(0.99, Math.max(0, share)));
        },
      );
      outcome = { bytes: (await fs.stat(this.fileOf(job))).size };
    } catch (err) {
      // Our own failures stay in our logs: the person is told it failed, not how.
      outcome = { error: err instanceof RefusedError ? err.message : 'The render failed' };
      if (!(err instanceof RefusedError)) console.error(`[render] ${id}`, err);
    }
    // The sources go before the job says it is finished: once it does, only its file is left.
    await fs.rm(path.join(this.dirOf(id), 'project'), { recursive: true, force: true }).catch(() => {});
    job.finishedAt = this.deps.now();
    if ('bytes' in outcome) {
      job.bytes = outcome.bytes;
      job.progress = 1;
      job.status = 'done';
    } else {
      job.error = outcome.error;
      job.status = 'failed';
    }
  }

  /** Forgets the jobs finished more than ttlMs ago, with their files. */
  async sweep(): Promise<number> {
    const limit = this.deps.now() - this.deps.ttlMs;
    let removed = 0;
    for (const job of [...this.jobs.values()]) {
      if (job.finishedAt !== null && job.finishedAt < limit) {
        this.jobs.delete(job.id);
        await fs.rm(this.dirOf(job.id), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }

  /** Busy machines must not be stopped: the queue says when it is idle. */
  get busy(): boolean {
    return this.running > 0 || this.waiting.length > 0;
  }
}
