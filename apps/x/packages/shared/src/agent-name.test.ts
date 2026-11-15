import { describe, expect, it } from 'vitest';
import { agentNameFile, agentNameInstructions, cleanAgentName, parseAgentName, withSignUpProfile } from './agent-name.js';

describe('the first agent name', () => {
  it('round-trips through its file', () => {
    expect(parseAgentName(agentNameFile('  Awa\n'))).toBe('Awa');
    expect(parseAgentName(null)).toBeNull();
    expect(parseAgentName('{oops')).toBeNull();
    expect(parseAgentName('{"name":"  "}')).toBeNull();
  });
  it('tells the copilot its name, or to ask for it', () => {
    expect(agentNameInstructions('Awa')).toContain('The user named you Awa.');
    expect(agentNameInstructions(null)).toContain('copilot-set-name');
  });
  it('keeps a name on one short line', () => {
    expect(cleanAgentName('  Max\n<b>  ')).toBe('Max b');
    expect(cleanAgentName('x'.repeat(80))).toHaveLength(40);
  });
});

describe('what the person told at sign-up', () => {
  it('goes first, replaces an earlier block, and keeps the other notes', () => {
    const once = withSignUpProfile('- Likes short answers.\n', { name: 'Ben', activity: 'Commerçant', lang: 'fr' });
    expect(once).toContain('- First name: Ben');
    expect(once).toContain('- Activity: Commerçant');
    expect(once.trim().endsWith('- Likes short answers.')).toBe(true);
    const twice = withSignUpProfile(once, { name: 'Benewende', lang: 'fr' });
    expect(twice).not.toContain('Commerçant');
    expect(twice.match(/baarali:profile -->/g)).toHaveLength(2);
  });
});
