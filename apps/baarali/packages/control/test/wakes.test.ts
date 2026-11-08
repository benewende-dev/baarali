import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { InstanceTarget } from '../src/instances.js';
import { MemoryStore, hashToken, type Account, type InstanceRecord, type Plan } from '../src/store.js';
import { BUSY_HOLD_MS, WAKE_LEAD_MS, parsePublication, sweepWakes } from '../src/wakes.js';

const T0 = Date.UTC(2026, 10, 7, 6, 0, 0);
const PLAN: Plan = { id: 'essentiel', category: 'starter', displayName: 'Essentiel', weekCredits: 100, monthlyPrices: [], models: null };
const ME: Account = { id: 'acc_me', email: 'me@example.test', planId: 'essentiel', createdAt: T0 };
const RECORD: InstanceRecord = { accountId: ME.id, app: 'baarali-instances', machineId: 'm1', volumeId: 'vol_1', image: 'img:1', managed: true, keys: 2 };
const TARGET: InstanceTarget = { host: 'baarali-instances.flycast', port: 80, headers: { 'fly-force-instance-id': 'm1' }, key: 'server-key' };

function setup(health = 200) {
  const store = new MemoryStore(new Map([[hashToken('instance-token'), ME]]), [PLAN]);
  let clock = T0;
  const woken: string[] = [];
  const pings: Array<{ url: string; headers: Record<string, string> }> = [];
  const deps = {
    store,
    now: () => clock,
    instances: {
      wake: async (r: InstanceRecord) => void woken.push(r.accountId),
      target: () => TARGET,
    },
    fetch: (async (url: string, init: RequestInit) => {
      pings.push({ url: String(url), headers: init.headers as Record<string, string> });
      return new Response('ok', { status: health });
    }) as unknown as typeof fetch,
  };
  return { store, deps, woken, pings, tick: (ms: number) => void (clock += ms) };
}

describe('parsePublication', () => {
  it('reads a due with its offset, and a busy instance', () => {
    const p = parsePublication(ME.id, { nextDueAt: '2026-11-08T08:00:00+00:00', reason: 'routine', busy: true }, T0);
    expect(p).toEqual({
      ok: true,
      schedule: { accountId: ME.id, nextDueAt: Date.UTC(2026, 10, 8, 8), reason: 'routine', busyUntil: T0 + BUSY_HOLD_MS, updatedAt: T0 },
    });
  });

  it('refuses a local time without its offset, a date too far, and odd words', () => {
    expect(parsePublication(ME.id, { nextDueAt: '2026-11-08T08:00:00' }, T0)).toMatchObject({ ok: false });
    expect(parsePublication(ME.id, { nextDueAt: '2028-01-01T00:00:00Z' }, T0)).toMatchObject({ ok: false });
    expect(parsePublication(ME.id, { nextDueAt: null, reason: 'DROP TABLE' }, T0)).toMatchObject({ ok: false });
    expect(parsePublication(ME.id, { nextDueAt: null, busy: 'yes' }, T0)).toMatchObject({ ok: false });
    expect(parsePublication(ME.id, 'nope', T0)).toMatchObject({ ok: false });
  });

  it('keeps nothing due when there is nothing planned', () => {
    expect(parsePublication(ME.id, { nextDueAt: null, reason: 'routine' }, T0)).toMatchObject({ ok: true, schedule: { nextDueAt: null, reason: null, busyUntil: null } });
  });
});

describe('sweepWakes', () => {
  it('wakes an instance a minute before its routine, once', async () => {
    const { store, deps, woken, pings, tick } = setup();
    await store.saveInstance(RECORD);
    await store.saveSchedule({ accountId: ME.id, nextDueAt: T0 + 10 * 60_000, reason: 'routine', busyUntil: null, updatedAt: T0 });

    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 0, failed: 0 });
    tick(10 * 60_000 - WAKE_LEAD_MS);
    expect(await sweepWakes(deps)).toEqual({ woken: 1, held: 0, failed: 0 });
    expect(woken).toEqual([ME.id]);
    expect(pings).toEqual([{ url: 'http://baarali-instances.flycast:80/health', headers: { 'fly-force-instance-id': 'm1', authorization: 'Bearer server-key' } }]);
    expect((await store.schedule(ME.id))?.nextDueAt).toBeNull();
    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 0, failed: 0 });
  });

  it('keeps an instance at work awake until it stops saying so', async () => {
    const { store, deps, pings, tick } = setup();
    await store.saveInstance(RECORD);
    await store.saveSchedule({ accountId: ME.id, nextDueAt: null, reason: null, busyUntil: T0 + BUSY_HOLD_MS, updatedAt: T0 });
    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 1, failed: 0 });
    tick(BUSY_HOLD_MS);
    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 0, failed: 0 });
    expect(pings).toHaveLength(1);
  });

  it('tries again at the next sweep when the instance does not answer', async () => {
    const { store, deps } = setup(503);
    await store.saveInstance(RECORD);
    await store.saveSchedule({ accountId: ME.id, nextDueAt: T0, reason: 'routine', busyUntil: null, updatedAt: T0 });
    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 0, failed: 1 });
    expect((await store.schedule(ME.id))?.nextDueAt).toBe(T0);
  });

  it('forgets a due whose instance is gone', async () => {
    const { store, deps, woken } = setup();
    await store.saveSchedule({ accountId: ME.id, nextDueAt: T0, reason: 'routine', busyUntil: null, updatedAt: T0 });
    expect(await sweepWakes(deps)).toEqual({ woken: 0, held: 0, failed: 0 });
    expect(woken).toEqual([]);
    expect((await store.schedule(ME.id))?.nextDueAt).toBeNull();
  });
});

describe('PUT /v1/instance/schedule', () => {
  function app() {
    const { store } = setup();
    let clock = T0;
    const control = createApp({
      store,
      openRouterKey: 'k',
      publicUrl: 'https://control.example.test',
      appName: 'Baarali',
      mediaPacks: [],
      now: () => clock,
      fetch: globalThis.fetch,
    });
    const put = (body: unknown, token: string | null = 'instance-token') =>
      control.request('/v1/instance/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    return { store, put, tick: (ms: number) => void (clock += ms) };
  }

  it('keeps what the instance says, replaced at each publication', async () => {
    const { store, put } = app();
    expect((await put({ nextDueAt: '2026-11-08T08:00:00Z', reason: 'routine', busy: true })).status).toBe(200);
    expect(await store.schedule(ME.id)).toEqual({ accountId: ME.id, nextDueAt: Date.UTC(2026, 10, 8, 8), reason: 'routine', busyUntil: T0 + BUSY_HOLD_MS, updatedAt: T0 });
    expect((await put({ nextDueAt: null })).status).toBe(200);
    expect(await store.schedule(ME.id)).toMatchObject({ nextDueAt: null, busyUntil: null });
  });

  it('opens to the instance token only, and refuses a bad body', async () => {
    const { put } = app();
    expect((await put({ nextDueAt: null }, null)).status).toBe(401);
    expect((await put({ nextDueAt: null }, 'someone-else')).status).toBe(401);
    const bad = await put({ nextDueAt: 'tomorrow' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });
});
