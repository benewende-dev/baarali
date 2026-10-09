import { admit, budgetsForWeek, charge, creditsForCost, initialState, open } from './quota.js';
import { OPENROUTER_BASE } from './llm-proxy.js';
import { MAX_UPLOAD_BYTES } from './motion.js';
import type { Account, ControlStore } from './store.js';

// The agent's preview (decided 09/10/2026): it writes its motion design
// blind, and most of the models it runs on read no image. The render service
// takes a few stills of the composition, a vision model reviews them as an
// art director would, and the agent gets the stills and the review in words.
// The review is charged to the usage quota at its real cost, as any model
// call; the stills cost a few seconds of the render machine, bounded by
// REVIEWS_PER_HOUR.

/**
 * Chosen 09/10/2026 on the same five frames: GLM 5.3 Flash found the real
 * defects (a word cut off, a panel over a card) in 6 s for 0.0005 $; Qwen
 * 3.8 Flash saw a little more but took 55 s, past the agent's tool limit.
 */
export const REVIEW_MODEL = 'z-ai/glm-5.3-flash';
export const REVIEWS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const MAX_BRIEF = 600;

export const REVIEW_PROMPT = `You are the art director of a motion design studio. You review still frames of a video before the client sees it. The frames come from an HTML composition rendered in a browser: every defect you name will be fixed in its HTML/CSS.

For each frame, name only real, visible defects, each with where it is in the frame:
- text cut off by the frame edge, by a container or by another element; text overflowing its box; a word broken across lines badly;
- elements overlapping when they should not, or a half-transparent layer covering content;
- text too small to read on a phone (under 2.5 % of the frame height for body text), or too little contrast with what is behind it;
- an empty or almost empty frame where something should be on screen;
- misalignment: elements that almost line up but do not, uneven margins, content not centred when it should be;
- a pointer or highlight not on the thing it points at;
- too much on screen at once: more than one idea, more than about 12 words of text;
- anything that looks unfinished, placeholder or broken (missing image, empty icon boxes, default font, raw code).
Frames caught in the middle of a transition may show things half-moved: only flag them when the state itself looks wrong, not merely in motion.

Answer in this form, in English, with no praise and no preamble:
Frame <time>: OK — or one line per defect: "<defect> (<where>) → <how to fix, in CSS terms>".
Then a last line "Verdict: ready" or "Verdict: fix first", with the single most important fix.`;

export interface ReviewDeps {
  store: ControlStore;
  fetch: typeof fetch;
  now: () => number;
  /** The render service over Flycast; unset: previews answer 503. */
  render?: { url: string; secret: string };
  openRouterKey: string;
  publicUrl: string;
  appName: string;
  model?: string;
  upstreamBase?: string;
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** Previews per account in the last hour, in this process: enough to stop a loop. */
const recent = new Map<string, number[]>();

export function underHourlyLimit(accountId: string, now: number, limit = REVIEWS_PER_HOUR): boolean {
  const kept = (recent.get(accountId) ?? []).filter((t) => now - t < HOUR_MS);
  if (kept.length >= limit) {
    recent.set(accountId, kept);
    return false;
  }
  recent.set(accountId, [...kept, now]);
  return true;
}

type Still = { t: number; data: string };

/**
 * POST /v1/motion/review?times=1.5,6,12&brief=…, the body the project as
 * for an export ({files: [{path, data}]}). Answers {stills, review, model}:
 * review is null when the vision model failed, the stills are still given.
 */
export async function reviewMotion(deps: ReviewDeps, account: Account, req: Request): Promise<Response> {
  if (!deps.render) return error(503, 'preview_unavailable', 'Preview is not configured');
  const q = new URL(req.url).searchParams;
  const times = q.get('times') ?? '';
  if (!/^[\d.,]{1,80}$/.test(times)) return error(400, 'invalid_request', 'times is a list of seconds, e.g. 1.5,6,12');
  const brief = (q.get('brief') ?? '').slice(0, MAX_BRIEF);
  const length = Number(req.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return error(411, 'length_required', 'Send the project with its content-length');
  if (length > MAX_UPLOAD_BYTES) return error(413, 'too_large', 'The project is over 150 MB');
  if (!req.body) return error(400, 'invalid_request', 'The project is missing');

  const plan = await deps.store.plan(account.planId);
  if (!plan) return error(403, 'no_plan', 'Account has no active plan');
  const before = (await deps.store.quotaState(account.id)) ?? initialState(account.createdAt);
  const admission = admit(before, budgetsForWeek(plan.weekCredits), deps.now());
  if (!admission.ok) return error(429, 'quota_reached', `Usage limit reached for this ${admission.window}`);
  if (!underHourlyLimit(account.id, deps.now())) return error(429, 'too_many_previews', `At most ${REVIEWS_PER_HOUR} previews an hour`);

  let stills: Still[];
  try {
    const res = await deps.fetch(`${deps.render.url}/stills?${new URLSearchParams({ times })}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deps.render.secret}`, 'content-type': 'application/json', 'content-length': String(length) },
      body: req.body,
      duplex: 'half',
    } as RequestInit);
    const body = (await res.json().catch(() => ({}))) as { stills?: Still[]; error?: string };
    if (res.status === 400) return error(400, 'invalid_project', body.error ?? 'The project cannot be previewed');
    if (res.status === 503) return error(503, 'preview_busy', body.error ?? 'The preview machine is busy; try again in a minute');
    if (!res.ok || !Array.isArray(body.stills)) return error(502, 'preview_failed', 'The stills could not be taken');
    stills = body.stills;
  } catch (err) {
    console.error('[motion] stills', err);
    return error(502, 'preview_unavailable', 'The render service is unreachable');
  }

  await deps.store.saveQuotaState(account.id, open(before, deps.now()));
  const model = deps.model ?? REVIEW_MODEL;
  let review: string | null = null;
  let credits = 0;
  let status = 502;
  try {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: brief ? `What the video is meant to be: ${brief}` : 'A motion design video.' },
    ];
    for (const s of stills) {
      content.push({ type: 'text', text: `Frame at ${s.t} s:` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${s.data}` } });
    }
    const res = await deps.fetch(`${deps.upstreamBase ?? OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.openRouterKey}`,
        'content-type': 'application/json',
        'http-referer': deps.publicUrl,
        'x-title': deps.appName,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: REVIEW_PROMPT }, { role: 'user', content }],
        max_tokens: 1500,
        reasoning: { effort: 'low' },
        usage: { include: true },
      }),
    });
    status = res.status;
    const data = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
    if (res.ok) {
      credits = creditsForCost(data.usage?.cost).credits;
      const text = data.choices?.[0]?.message?.content;
      review = typeof text === 'string' && text.trim() ? text.trim() : null;
    }
  } catch (err) {
    console.error('[motion] review', err);
  } finally {
    if (credits > 0) {
      const state = (await deps.store.quotaState(account.id)) ?? initialState(account.createdAt);
      await deps.store.saveQuotaState(account.id, charge(state, credits, deps.now()));
    }
    await deps.store.appendUsage({
      accountId: account.id, at: deps.now(), path: '/motion/review', model, requestedModel: null,
      status, credits, estimated: false, useCase: 'motion', agentName: null,
    });
  }
  return Response.json({ stills, review, model });
}
