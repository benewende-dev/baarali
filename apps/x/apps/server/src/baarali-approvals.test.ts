import { describe, expect, it } from 'vitest';
import { APPROVAL_CATEGORY, approvalNotifications, describe as describeAction, watchApprovals } from './baarali-approvals.js';

const suspended = (pending: Array<{ toolCallId: string; toolName: string; request: unknown }>) => ({
  type: 'turn_suspended' as const,
  turnId: 'turn_1',
  pendingPermissions: pending,
});

describe('approvals on the phone (BAARALI)', () => {
  it('says what is asked, in a few words', () => {
    expect(describeAction({ toolCallId: 'a', toolName: 'composio-execute', request: { kind: 'composio', toolkitSlug: 'GMAIL', toolSlug: 'GMAIL_SEND_EMAIL' } })).toBe('Gmail, send email');
    expect(describeAction({ toolCallId: 'a', toolName: 'executeCommand', request: { command: 'rm -rf build' } })).toBe('la commande « rm -rf build »');
    expect(describeAction({ toolCallId: 'a', toolName: 'mcp', request: { kind: 'mcp', serverName: 's', toolName: 'create_invoice' } })).toBe('create invoice');
    expect(describeAction({ toolCallId: 'a', toolName: 'write-file', request: null })).toBe('write file');
  });

  it('gives each pending action its buttons and the ids to answer it', () => {
    const [n] = approvalNotifications(suspended([{ toolCallId: 'tc_9', toolName: 'x', request: { kind: 'composio', toolkitSlug: 'gmail', toolSlug: 'GMAIL_SEND_EMAIL' } }]), 'ses_1');
    expect(n.input).toEqual({
      title: 'Votre accord est demandé',
      message: 'Baarali attend votre accord pour : Gmail, send email.',
      link: 'rowboat://open?type=chat&sessionId=ses_1',
    });
    expect(n.extra).toEqual({ categoryId: APPROVAL_CATEGORY, data: { kind: 'approval', turnId: 'turn_1', toolCallId: 'tc_9', sessionId: 'ses_1' } });
  });

  it('announces each action once, only when asked for, and ignores other events', () => {
    let listener: (e: { turnId: string; sessionId: string | null; event?: { type: string; [k: string]: unknown } }) => void = () => {};
    const sent: string[] = [];
    let enabled = true;
    watchApprovals({
      subscribeAll: (l) => ((listener = l), () => {}),
      send: async (_input, extra) => (sent.push(extra.data!.toolCallId), 1),
      enabled: () => enabled,
    });
    const two = suspended([{ toolCallId: 'a', toolName: 't', request: {} }, { toolCallId: 'b', toolName: 't', request: {} }]);
    listener({ turnId: 'turn_1', sessionId: null, event: two });
    // Answered « a »: the turn suspends again with « b » alone.
    listener({ turnId: 'turn_1', sessionId: null, event: suspended([{ toolCallId: 'b', toolName: 't', request: {} }]) });
    listener({ turnId: 'turn_1', sessionId: null, event: { type: 'text_delta' } });
    enabled = false;
    listener({ turnId: 'turn_2', sessionId: null, event: { ...suspended([{ toolCallId: 'c', toolName: 't', request: {} }]), turnId: 'turn_2' } });
    expect(sent).toEqual(['a', 'b']);
  });
});
