// What the instance tells the control plane of its next work (scheduled
// wakes, decided 07/11/2026, roadmap phase 6): Fly suspends a machine
// nobody talks to, and a suspended machine runs no routine. Every minute
// the instance reads its routines from its own rowboat-server, works out the
// earliest one due, and whether one is running, and publishes it
// (control PUT /v1/instance/schedule, wakes.ts). Read, never changed: the
// upstream schedulers stay the ones that fire (core background-tasks,
// agent-schedule); on waking they catch up what is due by themselves.
//
// Times are the machine's local ones, as the upstream schedulers read them.
// The instance ships without dependencies (qr.ts), hence this small cron
// reader: five fields, lists, ranges, steps and names, as cron-parser reads
// the routines the agent writes.

/** A routine as `bg-task:list` lists it (@x/shared background-task.ts), the fields read here. */
export interface TaskSummary {
  slug: string;
  active: boolean;
  triggers?: { cronExpr?: string; windows?: Array<{ startTime: string; endTime: string }> };
  lastAttemptAt?: string;
  lastRunAt?: string;
}

/** `agent-schedule:getConfig` and `:getState` (@x/shared agent-schedule*.ts), the fields read here. */
export interface AgentSchedules {
  config: { agents: Record<string, { schedule: { type: 'cron' | 'window' | 'once'; runAt?: string }; enabled?: boolean }> };
  state: { agents: Record<string, { status: string; nextRunAt: string | null; startedAt: string | null }> };
}

export interface NextWork {
  /** The earliest routine due; null: nothing planned. */
  dueAt: Date | null;
  reason: 'routine' | 'agent' | null;
  /** A routine is running: the machine must stay up. */
  busy: boolean;
}

/** core schedule/utils.ts GRACE_MS: a cron routine missed by more is skipped, not run late. */
const GRACE_MS = 2 * 60_000;
/** core schedule/utils.ts RETRY_BACKOFF_MS: an attempt older than this without a result is over. */
const ATTEMPT_MS = 5 * 60_000;
/** core agent-schedule/runner.ts TIMEOUT_MS. */
const AGENT_RUN_MS = 30 * 60_000;
/** Four years: a 29 February routine still has a next date. */
const SEARCH_DAYS = 4 * 366;

const NAMES: Record<number, string[]> = {
  3: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  4: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};
const RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

interface Cron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  /** Both day fields restricted: a day matches either (cron's rule). */
  either: boolean;
}

function value(word: string, field: number): number {
  const names = NAMES[field];
  const named = names?.indexOf(word.toLowerCase()) ?? -1;
  if (named >= 0) return field === 3 ? named + 1 : named;
  if (!/^\d+$/.test(word)) throw new Error(`cron: ${word}`);
  return Number(word);
}

function parseField(text: string, field: number): { set: Set<number>; star: boolean } {
  const [lo, hi] = RANGES[field];
  const set = new Set<number>();
  let star = false;
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron: ${part}`);
    let from: number;
    let to: number;
    if (range === '*' || range === '?') {
      [from, to] = [lo, hi];
      if (stepText === undefined) star = true;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      [from, to] = [value(a, field), value(b, field)];
    } else {
      from = value(range, field);
      to = stepText === undefined ? from : hi;
    }
    if (from < lo || to > hi || from > to) throw new Error(`cron: ${part}`);
    for (let v = from; v <= to; v += step) set.add(field === 4 && v === 7 ? 0 : v);
  }
  return { set, star };
}

export function parseCron(expression: string): Cron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron: ${expression}`);
  const [minutes, hours, days, months, weekdays] = fields.map((f, i) => parseField(f, i));
  return { minutes: minutes.set, hours: hours.set, days: days.set, months: months.set, weekdays: weekdays.set, either: !days.star && !weekdays.star };
}

function dayMatches(cron: Cron, d: Date): boolean {
  if (!cron.months.has(d.getMonth() + 1)) return false;
  const byDate = cron.days.has(d.getDate());
  const byWeekday = cron.weekdays.has(d.getDay());
  return cron.either ? byDate || byWeekday : byDate && byWeekday;
}

/** The first occurrence strictly after `after`, to the minute; null when there is none. */
export function nextCron(expression: string, after: Date): Date | null {
  const cron = parseCron(expression);
  const start = new Date(after);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  for (let i = 0; i < SEARCH_DAYS; i++, day.setDate(day.getDate() + 1)) {
    if (!dayMatches(cron, day)) continue;
    const sameDay = i === 0;
    for (let h = sameDay ? start.getHours() : 0; h < 24; h++) {
      if (!cron.hours.has(h)) continue;
      for (let m = sameDay && h === start.getHours() ? start.getMinutes() : 0; m < 60; m++) {
        if (!cron.minutes.has(m)) continue;
        const at = new Date(day);
        at.setHours(h, m, 0, 0);
        // A local time skipped by a clock change lands elsewhere: not this one.
        if (at.getHours() === h && at.getMinutes() === m) return at;
      }
    }
  }
  return null;
}

/** The latest occurrence at or before `at`; null within the search. */
function previousCron(expression: string, at: Date): Date | null {
  // Walks back a day at a time: enough for routines that fire at least yearly.
  const from = new Date(at);
  for (let back = 1; back <= SEARCH_DAYS; back *= 2) {
    const probe = new Date(from);
    probe.setDate(probe.getDate() - back);
    let last: Date | null = null;
    for (let next = nextCron(expression, probe); next && next <= at; next = nextCron(expression, next)) last = next;
    if (last) return last;
  }
  return null;
}

function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

const time = (iso: string | undefined | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** When a routine is next due, by the upstream scheduler's own rules (core schedule/utils.ts). */
export function taskDue(task: TaskSummary, now: Date): Date | null {
  if (!task.active || !task.triggers) return null;
  const lastRun = time(task.lastRunAt);
  const dues: Date[] = [];
  const { cronExpr, windows } = task.triggers;
  if (cronExpr) {
    try {
      if (lastRun === null) dues.push(now);
      else {
        const prev = previousCron(cronExpr, now);
        if (prev && lastRun < prev.getTime() && now.getTime() <= prev.getTime() + GRACE_MS) dues.push(now);
        else {
          const next = nextCron(cronExpr, now);
          if (next) dues.push(next);
        }
      }
    } catch {
      // An expression the upstream scheduler cannot read either: it never fires.
    }
  }
  for (const w of windows ?? []) {
    const start = atTime(now, w.startTime);
    const end = atTime(now, w.endTime);
    end.setSeconds(59, 999);
    if (now < start) dues.push(start);
    else if (now <= end && (lastRun === null || lastRun <= start.getTime())) dues.push(now);
    else {
      const tomorrow = new Date(start);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dues.push(tomorrow);
    }
  }
  return dues.length ? new Date(Math.min(...dues.map((d) => d.getTime()))) : null;
}

/** The instance's next work: the earliest due across its routines, and whether one runs. */
export function nextWork(tasks: TaskSummary[], agents: AgentSchedules | null, now: Date): NextWork {
  let dueAt: Date | null = null;
  let reason: NextWork['reason'] = null;
  let busy = false;
  const consider = (at: Date | null, why: NonNullable<NextWork['reason']>) => {
    if (at && (!dueAt || at < dueAt)) {
      dueAt = at;
      reason = why;
    }
  };
  for (const task of tasks) {
    const attempt = time(task.lastAttemptAt);
    const run = time(task.lastRunAt);
    if (task.active && attempt !== null && (run === null || attempt > run) && now.getTime() - attempt < ATTEMPT_MS) busy = true;
    consider(taskDue(task, now), 'routine');
  }
  for (const [name, entry] of Object.entries(agents?.config.agents ?? {})) {
    if (entry.enabled === false) continue;
    const state = agents?.state.agents[name];
    if (state?.status === 'running') {
      const started = time(state.startedAt);
      if (started === null || now.getTime() - started < AGENT_RUN_MS) busy = true;
      continue;
    }
    if (entry.schedule.type === 'once') {
      if (state?.status !== 'triggered') consider(entry.schedule.runAt ? new Date(time(entry.schedule.runAt) ?? now.getTime()) : now, 'agent');
      continue;
    }
    // No state yet: the runner initializes it at its next tick, which runs it.
    const next = state?.nextRunAt ? time(state.nextRunAt) : now.getTime();
    if (next !== null) consider(new Date(next), 'agent');
  }
  return { dueAt, reason, busy };
}
