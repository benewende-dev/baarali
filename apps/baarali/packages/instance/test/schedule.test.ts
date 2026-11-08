// Local times are the machine's: the instances run in UTC on Fly.
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import { nextCron, nextWork, taskDue, type AgentSchedules, type TaskSummary } from '../src/schedule.js';
import { SchedulePublisher } from '../src/schedule-publisher.js';

const at = (iso: string) => new Date(iso);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

describe('nextCron', () => {
  it('reads the routines the agent writes', () => {
    const now = at('2026-11-07T07:30:00Z'); // a Saturday
    expect(iso(nextCron('0 8 * * *', now))).toBe('2026-11-07T08:00:00.000Z');
    expect(iso(nextCron('0 8 * * 1-5', now))).toBe('2026-11-09T08:00:00.000Z');
    expect(iso(nextCron('0 9 * * MON', now))).toBe('2026-11-09T09:00:00.000Z');
    expect(iso(nextCron('*/15 * * * *', now))).toBe('2026-11-07T07:45:00.000Z');
    expect(iso(nextCron('30 7 * * *', now))).toBe('2026-11-08T07:30:00.000Z');
    expect(iso(nextCron('0 0 1 jan *', now))).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(nextCron('0 12 29 2 *', now))).toBe('2028-02-29T12:00:00.000Z');
    expect(iso(nextCron('0 8 * * 7', now))).toBe('2026-11-08T08:00:00.000Z');
  });

  it('matches either day field when both are set, as cron does', () => {
    // The 15th, or any Monday.
    expect(iso(nextCron('0 8 15 * 1', at('2026-11-07T09:00:00Z')))).toBe('2026-11-09T08:00:00.000Z');
    expect(iso(nextCron('0 8 15 * 1', at('2026-11-10T09:00:00Z')))).toBe('2026-11-15T08:00:00.000Z');
  });

  it('refuses what it cannot read', () => {
    expect(() => nextCron('0 8 * *', new Date())).toThrow();
    expect(() => nextCron('61 8 * * *', new Date())).toThrow();
    expect(() => nextCron('0 8 * * fun', new Date())).toThrow();
  });
});

const task = (t: Partial<TaskSummary>): TaskSummary => ({ slug: 'brief', active: true, ...t });

describe('taskDue', () => {
  it('waits for the next time of a routine that already ran', () => {
    const t = task({ triggers: { cronExpr: '0 8 * * *' }, lastRunAt: '2026-11-07T08:00:30Z' });
    expect(iso(taskDue(t, at('2026-11-07T12:00:00Z')))).toBe('2026-11-08T08:00:00.000Z');
  });

  it('is due at once within the grace of a missed time, and not after', () => {
    const t = task({ triggers: { cronExpr: '0 8 * * *' }, lastRunAt: '2026-11-06T08:00:30Z' });
    expect(iso(taskDue(t, at('2026-11-07T08:01:00Z')))).toBe('2026-11-07T08:01:00.000Z');
    expect(iso(taskDue(t, at('2026-11-07T08:10:00Z')))).toBe('2026-11-08T08:00:00.000Z');
  });

  it('is due at once when it never ran, as the scheduler runs it', () => {
    expect(iso(taskDue(task({ triggers: { cronExpr: '0 8 * * *' } }), at('2026-11-07T12:00:00Z')))).toBe('2026-11-07T12:00:00.000Z');
  });

  it('opens a window at its start, once a day', () => {
    const w = { windows: [{ startTime: '07:00', endTime: '09:00' }] };
    expect(iso(taskDue(task({ triggers: w }), at('2026-11-07T05:00:00Z')))).toBe('2026-11-07T07:00:00.000Z');
    expect(iso(taskDue(task({ triggers: w, lastRunAt: '2026-11-06T07:10:00Z' }), at('2026-11-07T08:00:00Z')))).toBe('2026-11-07T08:00:00.000Z');
    expect(iso(taskDue(task({ triggers: w, lastRunAt: '2026-11-07T07:10:00Z' }), at('2026-11-07T08:00:00Z')))).toBe('2026-11-08T07:00:00.000Z');
    expect(iso(taskDue(task({ triggers: w, lastRunAt: '2026-11-06T07:10:00Z' }), at('2026-11-07T10:00:00Z')))).toBe('2026-11-08T07:00:00.000Z');
  });

  it('leaves paused routines, manual ones and unreadable ones alone', () => {
    expect(taskDue(task({ active: false, triggers: { cronExpr: '0 8 * * *' } }), new Date())).toBeNull();
    expect(taskDue(task({}), new Date())).toBeNull();
    expect(taskDue(task({ triggers: { cronExpr: 'never', }, lastRunAt: '2026-11-06T08:00:00Z' }), new Date())).toBeNull();
  });
});

describe('nextWork', () => {
  const now = at('2026-11-07T06:00:00Z');
  const agents = (status = 'scheduled', nextRunAt: string | null = '2026-11-07T07:00:00'): AgentSchedules => ({
    config: { agents: { morning: { schedule: { type: 'cron' }, enabled: true } } },
    state: { agents: { morning: { status, nextRunAt, startedAt: status === 'running' ? '2026-11-07T05:55:00' : null } } },
  });

  it('takes the earliest of the routines and the scheduled agents', () => {
    const tasks = [task({ triggers: { cronExpr: '0 8 * * *' }, lastRunAt: '2026-11-06T08:00:30Z' })];
    expect(nextWork(tasks, agents(), now)).toEqual({ dueAt: at('2026-11-07T07:00:00Z'), reason: 'agent', busy: false });
    expect(nextWork(tasks, null, now)).toEqual({ dueAt: at('2026-11-07T08:00:00Z'), reason: 'routine', busy: false });
    expect(nextWork([], null, now)).toEqual({ dueAt: null, reason: null, busy: false });
  });

  it('is at work while a routine or an agent runs, and not after its time is up', () => {
    expect(nextWork([], agents('running'), now).busy).toBe(true);
    const running = task({ triggers: { cronExpr: '0 8 * * *' }, lastRunAt: '2026-11-06T08:00:30Z', lastAttemptAt: '2026-11-07T05:58:00Z' });
    expect(nextWork([running], null, now).busy).toBe(true);
    expect(nextWork([running], null, at('2026-11-07T06:10:00Z')).busy).toBe(false);
  });
});

describe('SchedulePublisher', () => {
  function publisher(tasks: TaskSummary[], fail = false) {
    const sent: unknown[] = [];
    let clock = at('2026-11-07T06:00:00Z');
    const p = new SchedulePublisher({
      rpc: async (channel) => {
        if (fail) throw new Error('starting');
        if (channel === 'bg-task:list') return { items: tasks };
        return { agents: {} };
      },
      publish: async (body) => void sent.push(body),
      now: () => clock,
    });
    return { p, sent, tick: (ms: number) => void (clock = new Date(clock.getTime() + ms)) };
  }

  it('publishes a change, stays quiet otherwise, and repeats every ten minutes', async () => {
    const { p, sent, tick } = publisher([task({ triggers: { cronExpr: '0 8 * * *' }, lastRunAt: '2026-11-06T08:00:30Z' })]);
    await p.tick();
    expect(sent).toEqual([{ nextDueAt: '2026-11-07T08:00:00.000Z', reason: 'routine', busy: false }]);
    tick(60_000);
    await p.tick();
    expect(sent).toHaveLength(1);
    tick(10 * 60_000);
    await p.tick();
    expect(sent).toHaveLength(2);
  });

  it('waits for the server without publishing', async () => {
    const { p, sent } = publisher([], true);
    expect(await p.tick()).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe('ensureMorningBrief', () => {
  it('seeds the brief once, and never again once deleted', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { ensureMorningBrief, BRIEF_NAME, BRIEF_WINDOW } = await import('../src/morning-brief.js');
    const dir = mkdtempSync(join(tmpdir(), 'brief-'));
    const calls: Array<{ channel: string; args: unknown }> = [];
    const rpc = async (channel: string, args: unknown) => {
      calls.push({ channel, args });
      return { success: true, slug: 'point-du-matin' };
    };
    expect(await ensureMorningBrief(dir, rpc)).toBe(true);
    expect(await ensureMorningBrief(dir, rpc)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ channel: 'bg-task:create', args: { name: BRIEF_NAME, triggers: { windows: [BRIEF_WINDOW] } } });
    expect((calls[0].args as { instructions: string }).instructions).toContain('notify-user');
  });

  it('tries again later when the server refuses', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { ensureMorningBrief } = await import('../src/morning-brief.js');
    const dir = mkdtempSync(join(tmpdir(), 'brief-'));
    await expect(ensureMorningBrief(dir, async () => ({ success: false, error: 'busy' }))).rejects.toThrow(/busy/);
    expect(await ensureMorningBrief(dir, async () => ({ success: true }))).toBe(true);
  });
});
