import { nextWork, type AgentSchedules, type NextWork, type TaskSummary } from './schedule.js';

// The instance's side of scheduled wakes (07/11/2026, schedule.ts): every
// minute, read the routines from rowboat-server on the loopback, and tell
// the control plane what changed. Said again every ten minutes anyway, and
// every minute while a routine runs: « at work » holds the machine up for
// three minutes only (control wakes.ts BUSY_HOLD_MS).

export const PUBLISH_EVERY_MS = 60_000;
/** Repeated unchanged this often: a control plane that restarted in memory learns it again. */
const REPEAT_MS = 10 * 60_000;

export interface PublisherDeps {
  /** POST /rpc/<channel> on the local rowboat-server. */
  rpc: (channel: string, args: unknown) => Promise<unknown>;
  /** PUT /v1/instance/schedule on the control plane. */
  publish: (body: { nextDueAt: string | null; reason: string | null; busy: boolean }) => Promise<void>;
  now: () => Date;
}

export class SchedulePublisher {
  private last: string | null = null;
  private lastAt = 0;

  constructor(private readonly deps: PublisherDeps) {}

  /** Reads; publishes if worth it. Returns what was read, or null while the server is not up. */
  async tick(): Promise<NextWork | null> {
    let tasks: TaskSummary[];
    let agents: AgentSchedules | null;
    try {
      tasks = ((await this.deps.rpc('bg-task:list', { limit: 10_000 })) as { items: TaskSummary[] }).items;
      const [config, state] = await Promise.all([this.deps.rpc('agent-schedule:getConfig', null), this.deps.rpc('agent-schedule:getState', null)]);
      agents = { config, state } as AgentSchedules;
    } catch {
      // Still starting, or restarting: the next minute reads again.
      return null;
    }
    const now = this.deps.now();
    const work = nextWork(tasks, agents, now);
    const body = { nextDueAt: work.dueAt ? work.dueAt.toISOString() : null, reason: work.reason, busy: work.busy };
    const said = JSON.stringify(body);
    if (said !== this.last || work.busy || now.getTime() - this.lastAt >= REPEAT_MS) {
      try {
        await this.deps.publish(body);
        this.last = said;
        this.lastAt = now.getTime();
      } catch (err) {
        console.error('[schedule] not published; trying again in a minute', err);
      }
    }
    return work;
  }
}

/** The real wiring: rowboat-server on the loopback with its key, the control plane with the instance token. */
export function startSchedulePublisher(opts: { serverUrl: string; serverKey: () => string | null; controlUrl: string; instanceToken: string }) {
  const publisher = new SchedulePublisher({
    rpc: async (channel, args) => {
      const key = opts.serverKey();
      if (!key) throw new Error('no server key yet');
      const res = await fetch(`${opts.serverUrl}/rpc/${channel}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`rpc ${channel}: ${res.status}`);
      return res.json();
    },
    publish: async (body) => {
      const res = await fetch(`${opts.controlUrl.replace(/\/+$/, '')}/v1/instance/schedule`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.instanceToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`schedule: ${res.status}`);
    },
    now: () => new Date(),
  });
  const timer = setInterval(() => void publisher.tick(), PUBLISH_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
