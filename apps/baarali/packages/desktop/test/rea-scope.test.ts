import { describe, expect, it, vi } from 'vitest';
import { reaConnection, reaScopeKey, withReaScope } from '../assets/rea-scope.js';

describe('REA investigation isolation', () => {
  it('keeps each chat identity across awaits and follow-up turns', async () => {
    const result = await Promise.all(['chat-a', 'chat-b'].map(sessionId => withReaScope({ sessionId, runId: 'first' }, async () => {
      await Promise.resolve();
      return reaScopeKey('baarali-rea');
    })));
    expect(result).toEqual(['baarali-rea:chat-a', 'baarali-rea:chat-b']);
    expect(withReaScope({ sessionId: 'chat-a', runId: 'second' }, () => reaScopeKey('baarali-rea'))).toBe(result[0]);
    expect(reaScopeKey('baarali-rea')).toBe('baarali-rea');
    expect(withReaScope({ runId: 'headless' }, () => reaScopeKey('other'))).toBe('other');
  });

  it('shares a concurrent connection attempt and releases failed attempts', async () => {
    let finish!: (value: string) => void;
    const connect = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const first = reaConnection('baarali-rea:one', [], connect);
    const second = reaConnection('baarali-rea:one', [], connect);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
    finish('client');
    expect(await Promise.all([first, second])).toEqual(['client', 'client']);
    await expect(reaConnection('baarali-rea:failed', [], async () => { throw Error('failed'); })).rejects.toThrow('failed');
    expect(await reaConnection('baarali-rea:failed', [], async () => 'recovered')).toBe('recovered');
  });

  it('bounds retained REA connections without blocking reuse or unrelated servers', async () => {
    const active = ['baarali-rea:a', 'baarali-rea:b'];
    await expect(reaConnection('baarali-rea:c', active, async () => 'new')).rejects.toThrow('already open');
    expect(await reaConnection('baarali-rea:a', active, async () => 'existing')).toBe('existing');
    expect(await reaConnection('other', active, async () => 'other')).toBe('other');
  });
});
