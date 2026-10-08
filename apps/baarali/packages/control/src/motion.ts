import { randomUUID } from 'node:crypto';
import type { Account, ControlStore, MotionRender, MotionSplit, Plan } from './store.js';

// Studio Motion exports (decided 08/10/2026): the instance sends a motion
// project, the render service (packages/render, baarali-render) turns it
// into a video. Each plan includes minutes of export every month; beyond
// them, an export costs media credits. Charged before it renders, given back
// in full (minutes and credits) if it fails. The project is streamed through,
// never held here: the control plane runs on 256 MB.

export const RENDER_FORMATS = ['mp4', 'mp4-light', 'gif', 'webm'] as const;
export type RenderFormat = (typeof RENDER_FORMATS)[number];

/** Minutes of export a month, by plan; a plan not named here takes its category's. */
export const RENDER_MINUTES_BY_PLAN: Record<string, number> = { semaine: 10, 'pro-200': 300 };
export const RENDER_MINUTES_BY_CATEGORY: Record<Plan['category'], number> = { free: 2, starter: 30, pro: 120 };

/**
 * Beyond the plan: 3 credits a minute. A minute costs us about a cent of
 * render machine (measured 08/10/2026: 10 s of 1080×1920 in 24 s of one
 * Chrome); the rest keeps the margin and the idle machine paid.
 */
export const RENDER_CREDITS_PER_MINUTE = 3;
export const MAX_RENDER_SECONDS = 300;
/** As the render service: 150 MB of files, a third more in base64. */
export const MAX_UPLOAD_BYTES = Math.ceil(150 * 1024 * 1024 * 1.4);

export function renderMinutes(plan: Pick<Plan, 'id' | 'category'> | null): number {
  if (!plan) return 0;
  return RENDER_MINUTES_BY_PLAN[plan.id] ?? RENDER_MINUTES_BY_CATEGORY[plan.category] ?? 0;
}

/** Seconds counted for an export: whole seconds, twice at 60 images a second. */
export function billedSeconds(seconds: number, fps: number): number {
  return Math.ceil(seconds) * (fps === 60 ? 2 : 1);
}

/** The month the minutes belong to starts on the 1st, UTC. */
export function monthStart(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
export function nextMonthStart(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export function splitFor(seconds: number, allowanceSeconds: number): MotionSplit {
  return (used) => {
    const included = Math.max(0, Math.min(seconds, allowanceSeconds - used));
    return { included, credits: Math.ceil(((seconds - included) * RENDER_CREDITS_PER_MINUTE) / 60) };
  };
}

export interface MotionDeps {
  store: ControlStore;
  fetch: typeof fetch;
  now: () => number;
  /** The render service over Flycast; unset: exports answer 503. */
  render?: { url: string; secret: string };
}

function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

async function allowanceOf(deps: MotionDeps, account: Account) {
  const plan = await deps.store.plan(account.planId);
  const total = renderMinutes(plan) * 60;
  const at = deps.now();
  const used = await deps.store.motionUsedSeconds(account.id, monthStart(at));
  return { total_seconds: total, used_seconds: Math.min(used, total), resets_at: new Date(nextMonthStart(at)).toISOString() };
}

export async function motionAllowance(deps: MotionDeps, account: Account): Promise<Response> {
  return Response.json({
    ...(await allowanceOf(deps, account)),
    credits_per_minute: RENDER_CREDITS_PER_MINUTE,
    balance: await deps.store.mediaBalance(account.id),
  });
}

const view = (r: MotionRender, extra: Record<string, unknown> = {}) => ({
  id: r.id,
  status: r.status,
  format: r.format,
  fps: r.fps,
  seconds: r.seconds,
  included_seconds: r.included,
  credits: r.credits,
  error: r.error,
  ...extra,
});

function renderHeaders(deps: MotionDeps, machine: string | null): Record<string, string> {
  return { authorization: `Bearer ${deps.render!.secret}`, ...(machine ? { 'fly-force-instance-id': machine } : {}) };
}

/** Gives back the minutes and the credits of a failed export, once. */
async function fail(deps: MotionDeps, r: MotionRender, message: string): Promise<MotionRender> {
  const next: MotionRender = { ...r, status: 'failed', error: message };
  if (!r.refunded) {
    if (r.credits > 0) {
      await deps.store.applyMediaEntry({ accountId: r.accountId, at: deps.now(), kind: 'refund', credits: r.credits, reference: r.chargeRef });
    }
    next.refunded = true;
  }
  await deps.store.saveMotionRender(next);
  return next;
}

/**
 * POST /v1/motion/renders?format=mp4&fps=30&seconds=10, the body the
 * project as JSON ({files: [{path, data}]}). `seconds` is the composition's
 * data-duration as the instance read it; the render service reads it again
 * and an export that lied is refused and refunded.
 */
export async function createRender(deps: MotionDeps, account: Account, req: Request): Promise<Response> {
  if (!deps.render) return error(503, 'render_unavailable', 'Video export is not configured');
  const q = new URL(req.url).searchParams;
  const format = q.get('format') ?? 'mp4';
  if (!RENDER_FORMATS.includes(format as RenderFormat)) return error(400, 'invalid_request', `format is one of ${RENDER_FORMATS.join(', ')}`);
  const fps = Number(q.get('fps') ?? '30');
  if (fps !== 30 && fps !== 60) return error(400, 'invalid_request', 'fps is 30 or 60');
  const seconds = Number(q.get('seconds'));
  if (!Number.isFinite(seconds) || seconds <= 0) return error(400, 'invalid_request', 'seconds is the composition duration');
  if (seconds > MAX_RENDER_SECONDS) return error(400, 'too_long', `An export is ${MAX_RENDER_SECONDS} s at most`);
  const length = Number(req.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return error(411, 'length_required', 'Send the project with its content-length');
  if (length > MAX_UPLOAD_BYTES) return error(413, 'too_large', 'The project is over 150 MB');
  if (!req.body) return error(400, 'invalid_request', 'The project is missing');

  const billed = billedSeconds(seconds, fps);
  const allowance = await allowanceOf(deps, account);
  const at = deps.now();
  const id = `mr_${randomUUID().replace(/-/g, '')}`;
  const reserved = await deps.store.reserveMotionRender(
    { id, accountId: account.id, at, format, fps, seconds: billed, chargeRef: `motion:${id}`, status: 'rendering', machine: null, refunded: false, error: null },
    monthStart(at),
    splitFor(billed, allowance.total_seconds),
  );
  if (!reserved.ok) {
    return error(402, 'insufficient_media_credits', 'The minutes of the plan are used up and the credits do not cover this export', {
      cost: reserved.credits,
      balance: await deps.store.mediaBalance(account.id),
      allowance,
    });
  }
  let render = reserved.render;

  let res: Response;
  try {
    res = await deps.fetch(`${deps.render.url}/jobs/new?${new URLSearchParams({ id, format, fps: String(fps) })}`, {
      method: 'POST',
      headers: { ...renderHeaders(deps, null), 'content-type': 'application/json', 'content-length': String(length) },
      body: req.body,
      duplex: 'half',
    } as RequestInit);
  } catch (err) {
    console.error('[motion] render service', err);
    await fail(deps, render, 'The render service is unreachable');
    return error(502, 'render_unavailable', 'The render service is unreachable; nothing was charged');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; machine?: string | null; seconds?: number };
  if (res.status !== 202) {
    const message = res.status === 400 && body.error ? body.error : 'The render service refused the export';
    await fail(deps, render, message);
    return error(res.status === 400 ? 400 : 502, res.status === 400 ? 'invalid_project' : 'render_unavailable', `${message}; nothing was charged`);
  }
  if (typeof body.seconds !== 'number' || billedSeconds(body.seconds, fps) !== billed) {
    await fail(deps, render, 'The duration sent is not the composition’s');
    return error(400, 'invalid_project', 'seconds must be the composition’s data-duration; nothing was charged');
  }
  render = { ...render, machine: typeof body.machine === 'string' ? body.machine : null };
  await deps.store.saveMotionRender(render);
  return Response.json(
    view(render, { progress: 0, allowance: await allowanceOf(deps, account), balance: await deps.store.mediaBalance(account.id) }),
    { status: 202 },
  );
}

export async function getRender(deps: MotionDeps, account: Account, id: string): Promise<Response> {
  let render = await deps.store.motionRender(id);
  // Someone else's export does not exist, as far as this account knows.
  if (!render || render.accountId !== account.id) return error(404, 'not_found', 'No such export');
  if (render.status !== 'rendering' || !deps.render) return Response.json(view(render, { progress: render.status === 'done' ? 1 : 0 }));

  let job: { status?: string; progress?: number; error?: string | null; bytes?: number | null };
  try {
    const res = await deps.fetch(`${deps.render.url}/jobs/${encodeURIComponent(id)}`, { headers: renderHeaders(deps, render.machine) });
    if (res.status === 404) {
      // The machine restarted and lost it.
      render = await fail(deps, render, 'The export was lost; render it again');
      return Response.json(view(render, { progress: 0 }));
    }
    if (!res.ok) return Response.json(view(render, { progress: 0 }));
    job = (await res.json()) as typeof job;
  } catch {
    // Still running as far as we know: the next poll asks again.
    return Response.json(view(render, { progress: 0 }));
  }
  if (job.status === 'failed') {
    render = await fail(deps, render, job.error ?? 'The render failed');
    return Response.json(view(render, { progress: 0 }));
  }
  if (job.status === 'done') {
    render = { ...render, status: 'done' };
    await deps.store.saveMotionRender(render);
    return Response.json(view(render, { progress: 1, bytes: job.bytes ?? null }));
  }
  return Response.json(view(render, { progress: typeof job.progress === 'number' ? job.progress : 0, queued: job.status === 'queued' }));
}

/** The file, streamed from the render machine; kept there two hours. */
export async function renderFile(deps: MotionDeps, account: Account, id: string): Promise<Response> {
  const render = await deps.store.motionRender(id);
  if (!render || render.accountId !== account.id || render.status !== 'done' || !deps.render) return error(404, 'not_found', 'No such export');
  let res: Response;
  try {
    res = await deps.fetch(`${deps.render.url}/jobs/${encodeURIComponent(id)}/file`, { headers: renderHeaders(deps, render.machine) });
  } catch {
    return error(502, 'render_unavailable', 'The render service is unreachable');
  }
  if (!res.ok || !res.body) return error(410, 'expired', 'The file is no longer kept; render it again');
  const headers: Record<string, string> = { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' };
  const size = res.headers.get('content-length');
  if (size) headers['content-length'] = size;
  return new Response(res.body, { headers });
}
