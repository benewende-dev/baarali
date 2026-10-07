import { describe, expect, it, vi } from 'vitest';

vi.mock('../analytics/posthog.js', () => ({ capture: vi.fn() }));
import type { ServerFrame } from '@rowboat/spaces-protocol';
import { asksBaarasseur } from './baarasseur-members.js';
import { buildInvocationMessage } from './topic-agent.js';

// BAARALI(07/10/2026): what wakes a baarasseur in a group, and how its turn is headed.

const notify = (over: Partial<Extract<ServerFrame, { kind: 'notify' }>>): ServerFrame => ({
    kind: 'notify',
    spaceId: 'S1',
    messageId: 'M1',
    reason: 'mention',
    author: { memberId: 'P1', actingMode: 'direct' },
    title: 'Awa mentioned you · Chantier',
    body: '@Fatou classe la facture',
    at: '2026-10-07T10:00:00.000Z',
    ...over,
});

describe('asksBaarasseur', () => {
    it('answers to its name and to a direct message', () => {
        expect(asksBaarasseur(notify({}))).toBe(true);
        expect(asksBaarasseur(notify({ reason: 'dm' }))).toBe(true);
    });

    it('stays quiet on @here and on replies in a thread it follows (no ping-pong between agents)', () => {
        expect(asksBaarasseur(notify({ reason: 'here' }))).toBe(false);
        expect(asksBaarasseur(notify({ reason: 'reply' }))).toBe(false);
    });

    it('is not summoned by a person’s own agent speaking for them', () => {
        expect(asksBaarasseur(notify({ author: { memberId: 'P1', actingMode: 'agent', agentName: 'Rowboat' } }))).toBe(false);
    });

    it('ignores every other frame', () => {
        expect(asksBaarasseur({ kind: 'ping', at: '2026-10-07T10:00:00.000Z' })).toBe(false);
    });
});

describe('buildInvocationMessage, as a baarasseur', () => {
    it('heads the turn with its own name', () => {
        const msg = buildInvocationMessage(
            {
                orgId: 'org-1', spaceId: 'S1', threadRootId: 'R1', threadLabel: 'facture', spaceName: 'Chantier',
                messageId: 'M1', body: '@Fatou classe la facture',
                actAs: { baarasseurId: 'fatou', memberId: 'A1', name: 'Fatou' },
            },
            null,
        );
        expect(msg.split('\n')[0]).toBe('[@Fatou in "Chantier" · spaceId S1 · thread R1 · message M1]');
    });
});
