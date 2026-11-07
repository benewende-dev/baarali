import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPhonePush, phoneMessages, phoneRegistrations } from './baarali-phone-push.js';

function workDir(phones: Record<string, { token: string; level: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-push-'));
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config', 'phone_push.json'), JSON.stringify({ version: 1, phones }));
  return dir;
}

describe('phone push (BAARALI)', () => {
  it('reads the phones that want push, and none from a missing file', () => {
    const dir = workDir({ a: { token: 'ExponentPushToken[a]', level: 'dms' }, b: { token: 'ExponentPushToken[b]', level: 'off' } });
    expect(phoneRegistrations(dir).map((r) => r.token)).toEqual(['ExponentPushToken[a]']);
    expect(phoneRegistrations(path.join(dir, 'nope'))).toEqual([]);
  });

  it('keeps ambient notifications quiet while an app shows them, never a permission request', () => {
    const phones = [{ token: 't', level: 'all' as const }];
    expect(phoneMessages({ message: 'Done', onlyWhenBackground: true }, phones, true)).toEqual([]);
    expect(phoneMessages({ message: 'Done', onlyWhenBackground: true }, phones, false)).toHaveLength(1);
    expect(phoneMessages({ title: 'Permission needed', message: 'Review to continue.', link: 'rowboat://open?type=chat&runId=r1' }, phones, true)).toEqual([
      { to: 't', title: 'Permission needed', body: 'Review to continue.', sound: 'default', priority: 'high', data: { link: 'rowboat://open?type=chat&runId=r1', kind: 'agent' } },
    ]);
  });

  it('names Baarali when the agent gives no title, and keeps long words short', () => {
    const [m] = phoneMessages({ message: 'x'.repeat(500) }, [{ token: 't', level: 'dms' }], false);
    expect(m.title).toBe('Baarali');
    expect(m.body).toHaveLength(240);
  });

  it('sends to Expo in one request, and survives Expo being down', async () => {
    const dir = workDir({ a: { token: 'ta', level: 'dms' }, b: { token: 'tb', level: 'mentions' } });
    const bodies: unknown[] = [];
    const push = createPhonePush({
      workDir: dir,
      clientConnected: () => false,
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(push.hasPhones()).toBe(true);
    expect(await push.send({ message: 'Votre point du matin est prêt.' })).toBe(2);
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as Array<{ to: string }>).map((m) => m.to)).toEqual(['ta', 'tb']);

    const down = createPhonePush({ workDir: dir, clientConnected: () => false, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(await down.send({ message: 'Hello' })).toBe(2);
  });
});
