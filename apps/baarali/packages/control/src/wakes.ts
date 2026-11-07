import type { Instances } from './instances.js';
import type { ControlStore, InstanceSchedule } from './store.js';

// Scheduled wakes (decided 07/11/2026, roadmap phase 6, the phone agent's
// ground: docs/baarali/AGENT_TELEPHONE_SPEC.md §3 A). Fly suspends an
// instance nobody talks to, and a suspended instance runs nothing: the
// morning routine announced in the README ran only if the app was open.
// The instance now says, before it sleeps, when its next routine is due
// (PUT /v1/instance/schedule); the control plane wakes it a little before,
// and keeps it awake while it says it is at work, since Fly counts only
// inbound requests and an agent's own calls out do not hold it up.

/** Woken this early: Fly resumes a machine in seconds, and a cron routine fires within 2 minutes of its time (core schedule/utils.ts GRACE_MS). */
export const WAKE_LEAD_MS = 60_000;
/** A publication saying « at work » holds the machine this long; the instance repeats it every minute while it works. */
export const BUSY_HOLD_MS = 3 * 60_000;
/** The sweep's pace (main.ts): well inside the lead and Fly's idle window. */
export const SWEEP_MS = 30_000;
/** Per sweep, so a crowd of 8 a.m. routines never trips Fly's rate limit. */
const WAKES_PER_SWEEP = 20;
const PING_TIMEOUT_MS = 15_000;
/** Further than this is a mistake, not a plan (a year and a month). */
const HORIZON_MS = 400 * 24 * 3600_000;
const REASON = /^[a-z][a-z0-9_-]{0,39}$/;

export interface WakesDeps {
  store: ControlStore;
  instances: Pick<Instances, 'wake' | 'target'>;
  fetch: typeof fetch;
  now: () => number;
}

/** What an instance sends; dates in ISO 8601 with their offset. */
export interface SchedulePublication {
  nextDueAt: string | null;
  reason?: string | null;
  busy?: boolean;
}

export type ParsedSchedule = { ok: true; schedule: InstanceSchedule } | { ok: false; message: string };

/** Checks a publication and turns it into the stored row. A due in the past is kept: it is woken at once. */
export function parsePublication(accountId: string, body: unknown, now: number): ParsedSchedule {
  if (!body || typeof body !== 'object') return { ok: false, message: 'a JSON object is expected' };
  const { nextDueAt, reason, busy } = body as Record<string, unknown>;
  let due: number | null = null;
  if (nextDueAt !== null && nextDueAt !== undefined) {
    // An offset is required: a local time without one would be read in the control plane's zone.
    if (typeof nextDueAt !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(nextDueAt)) return { ok: false, message: 'nextDueAt: an ISO 8601 date with its offset' };
    due = Date.parse(nextDueAt);
    if (Number.isNaN(due)) return { ok: false, message: 'nextDueAt: not a date' };
    if (due > now + HORIZON_MS) return { ok: false, message: 'nextDueAt: too far ahead' };
  }
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || !REASON.test(reason))) {
    return { ok: false, message: 'reason: a short lowercase word' };
  }
  if (busy !== undefined && typeof busy !== 'boolean') return { ok: false, message: 'busy: true or false' };
  return {
    ok: true,
    schedule: {
      accountId,
      nextDueAt: due,
      reason: due === null ? null : ((reason as string | null | undefined) ?? null),
      busyUntil: busy ? now + BUSY_HOLD_MS : null,
      updatedAt: now,
    },
  };
}

/**
 * One pass: wakes every instance due within the lead, and pings every one at
 * work so Fly's proxy sees it used. A due is cleared once woken; the instance
 * publishes its next one when its routine is done. Returns how many it reached.
 */
export async function sweepWakes(deps: WakesDeps): Promise<{ woken: number; held: number; failed: number }> {
  const now = deps.now();
  const rows = await deps.store.schedulesToWake(now + WAKE_LEAD_MS, now, WAKES_PER_SWEEP);
  let woken = 0;
  let held = 0;
  let failed = 0;
  for (const row of rows) {
    const due = row.nextDueAt !== null && row.nextDueAt <= now + WAKE_LEAD_MS;
    const record = await deps.store.instance(row.accountId);
    if (!record) {
      // No machine any more: nothing to wake, and nothing to try again.
      if (due) await deps.store.clearDue(row.accountId, row.nextDueAt!);
      continue;
    }
    try {
      // Asking Fly first starts a stopped machine and moves an outdated one
      // (instances.check); the request itself is what Fly's proxy counts as use.
      await deps.instances.wake(record);
      const target = deps.instances.target(record);
      const res = await deps.fetch(`http://${target.host}:${target.port}/health`, {
        headers: { ...target.headers, authorization: `Bearer ${target.key}` },
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`health ${res.status}`);
      if (due) {
        await deps.store.clearDue(row.accountId, row.nextDueAt!);
        woken++;
      } else held++;
    } catch (err) {
      // Left due: the next sweep tries again, until the instance answers
      // or publishes a new date.
      failed++;
      console.error(`[wakes] ${row.accountId} (${row.reason ?? 'busy'}) not reached`, err);
    }
  }
  return { woken, held, failed };
}
