import { describe, expect, it } from 'vitest';
import { isReaCleanup, selectReaServers } from '../assets/rea-config.js';

describe('REA connection passed to Code agents', () => {
  it('allows cleanup after an entitlement ends without allowing snapshot writes or other tools', () => {
    expect(isReaCleanup('baarali-rea', 'close_binary', {})).toBe(true);
    expect(isReaCleanup('baarali-rea', 'close_binary', { snapshot_path: '/data/config/bad' })).toBe(false);
    expect(isReaCleanup('baarali-rea', 'open_binary', {})).toBe(false);
    expect(isReaCleanup('other', 'close_binary', {})).toBe(false);
  });
  it('converts the managed stdio entry to ACP without forwarding other connections', () => {
    const server = { type: 'stdio', command: '/opt/rea/node', args: ['launcher.js'], env: { JAVA_HOME: '/java' } };
    const selected = selectReaServers({ 'baarali-rea': server, other: { command: 'private', env: { TOKEN: 'secret' } } });
    expect(selected).toEqual([{ name: 'baarali-rea', command: '/opt/rea/node', args: ['launcher.js'], env: [{ name: 'JAVA_HOME', value: '/java' }] }]);
    selected[0].args.push('unwanted');
    expect(server.args).toEqual(['launcher.js']);
  });

  it('keeps Code free of invalid or absent optional server definitions', () => {
    for (const server of [null, [], {}, { url: 'https://remote.test' }, { command: 'node', type: 'http' }, { command: 'node', args: ['x', 1] }, { command: 'node', env: { X: 1 } }]) {
      expect(selectReaServers({ 'baarali-rea': server })).toEqual([]);
    }
    expect(selectReaServers({})).toEqual([]);
    expect(selectReaServers({ 'baarali-rea': { command: 'node' } })).toEqual([{ name: 'baarali-rea', command: 'node', args: [], env: [] }]);
  });
});
