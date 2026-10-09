import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { lintProject } from '@hyperframes/lint';
import { captureFrameToBuffer, closeCaptureSession, createCaptureSession, createFileServer, createRenderJob, executeRenderJob, initializeSession } from '@hyperframes/producer';
import { RefusedError, type Renderer } from './queue.js';
import { usesGsap } from './project.js';
import { STILL_SIDE, type Stiller } from './stills.js';

/**
 * Capture browsers per render (RENDER_WORKERS). Measured 08/10/2026 on
 * performance-4x: left to itself the producer kept 1 (its contention rule:
 * 4 cores ÷ 2.5 cores a browser ÷ 1.15 slow-capture factor), 183 s for 10 s
 * of video; PRODUCER_MAX_WORKERS is only a ceiling. Unset: the producer decides.
 */
export function captureWorkers(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const n = Number(env.RENDER_WORKERS);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : undefined;
}

// The real renderer: HyperFrames' lint, then its producer (Chrome captures
// each frame, FFmpeg encodes, the <audio> clips are mixed in). The light
// MP4 and the GIF are made from a draft MP4 by FFmpeg: smaller files for a
// WhatsApp status or a message, at a fraction of the capture's cost.

const run = promisify(execFile);

/** The short side to 720 px, the long one in proportion (even, for H.264). */
const SHORT_SIDE_720 = "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'";
/** A GIF's long side to 720 px, 15 images a second, one palette for the whole clip. */
const GIF_FILTER =
  "fps=15,scale='if(gt(iw,ih),720,-2)':'if(gt(iw,ih),-2,720)':flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";

export function hyperframesRenderer(opts: { ffmpeg: string }): Renderer {
  const ffmpeg = (args: string[]) => run(opts.ffmpeg, ['-v', 'error', '-y', ...args], { maxBuffer: 4 * 1024 * 1024 });

  return async (task, progress) => {
    const html = await fs.readFile(path.join(task.dir, 'index.html'), 'utf8');
    if (usesGsap(html)) {
      throw new RefusedError('GSAP is not allowed: animate with the Web Animations API (the hf() helper of the template), CSS animations or anime.js.');
    }
    const lint = await lintProject(task.dir);
    if (lint.totalErrors > 0) {
      const errors = lint.results.flatMap((r) => r.result.findings.filter((f) => f.severity === 'error').map((f) => ({ ...f, file: f.file ?? r.file })));
      throw new RefusedError(
        `The composition has ${lint.totalErrors} error(s) to fix before it can render:\n${errors
          .slice(0, 8)
          .map((f) => `- ${f.file}${f.line ? `:${f.line}` : ''} ${f.code}: ${f.message}${f.fixHint ? ` (${f.fixHint})` : ''}`)
          .join('\n')}`,
      );
    }

    const direct = task.format === 'mp4' || task.format === 'webm';
    const target = direct ? task.out : path.join(path.dirname(task.out), 'master.mp4');
    const job = createRenderJob({
      fps: task.format === 'gif' ? 24 : task.fps,
      quality: direct ? 'standard' : 'draft',
      format: task.format === 'webm' ? 'webm' : 'mp4',
      ...(captureWorkers() ? { workers: captureWorkers() } : {}),
    });
    // The producer reports 0 to 100; the encode of a derived format is the last tenth.
    await executeRenderJob(job, task.dir, target, (j) => progress((j.progress > 1 ? j.progress / 100 : j.progress) * (direct ? 1 : 0.9)));
    if (direct) return;
    try {
      if (task.format === 'mp4-light') {
        await ffmpeg(['-i', target, '-vf', SHORT_SIDE_720, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', task.out]);
      } else {
        await ffmpeg(['-i', target, '-filter_complex', GIF_FILTER, '-loop', '0', task.out]);
      }
    } finally {
      await fs.rm(target, { force: true });
    }
  };
}

/**
 * The agent's preview stills (stills.ts): the same page and capture as an
 * export, scaled down in the browser to STILL_SIDE, JPEG.
 */
export function hyperframesStills(): Stiller {
  return async ({ dir, times, width, height }) => {
    const fps = { num: 30, den: 1 };
    const server = await createFileServer({ projectDir: dir, fps });
    try {
      const session = await createCaptureSession(server.url, path.join(dir, '.frames'), {
        width,
        height,
        fps,
        format: 'jpeg',
        quality: 80,
        deviceScaleFactor: Math.min(1, STILL_SIDE / Math.max(width, height)),
      });
      try {
        await initializeSession(session);
        const out: Buffer[] = [];
        for (const t of times) out.push((await captureFrameToBuffer(session, Math.round(t * 30), t)).buffer);
        return out;
      } finally {
        await closeCaptureSession(session);
      }
    } finally {
      server.close();
    }
  };
}
