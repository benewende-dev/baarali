import type { NotifyInput } from '@x/core/dist/application/notification/service.js';
import type { PhoneExtra } from './baarali-phone-push.js';

// BAARALI(07/11/2026): approve from the phone (docs/baarali/
// AGENT_TELEPHONE_SPEC.md §3 C). The turn runtime suspends a turn that needs
// a person's yes (`turn_suspended`, its pending permissions) but tells no
// one: the legacy engine notified, the sessions runtime does not. This
// watches the process-wide turn bus and sends each pending action to the
// paired phones with « Approve » and « Deny » buttons; the phone answers
// over `sessions:respondToPermission`.
//
// No approvals table of our own (the spec's §3 C first draft): a decision
// names its tool call, and a tool call's input is fixed once the model
// wrote it, so a yes always covers exactly what was shown. A changed draft
// is a new tool call, asking anew.

/** The phone registers this category with its buttons (mobile lib/baarali-approvals.ts). */
export const APPROVAL_CATEGORY = 'baarali-approval';
/** Tool calls already announced: a turn suspends again with what is still pending. */
const REMEMBERED = 500;

// The phone shows these words as they are (iOS draws the banner, no
// translation layer runs there): French first, as the app (spec §3 F).
const WORDS = {
  title: 'Votre accord est demandé',
  body: (what: string) => `Baarali attend votre accord pour : ${what}.`,
};

interface PendingPermission {
  toolCallId: string;
  toolName: string;
  request: unknown;
}

interface SuspendedEvent {
  type: 'turn_suspended';
  turnId: string;
  pendingPermissions: PendingPermission[];
}

interface BusEvent {
  turnId: string;
  sessionId: string | null;
  event?: { type: string };
}

const words = (slug: string) => slug.replace(/[_-]+/g, ' ').trim().toLowerCase();

/** What the action is, in a few words: the checker's request when it says, else the tool's name. */
export function describe(p: PendingPermission): string {
  const r = (p.request && typeof p.request === 'object' ? p.request : {}) as Record<string, unknown>;
  if (r.kind === 'composio' && typeof r.toolkitSlug === 'string' && typeof r.toolSlug === 'string') {
    const app = r.toolkitSlug.charAt(0).toUpperCase() + r.toolkitSlug.slice(1).toLowerCase();
    const action = words(r.toolSlug.replace(new RegExp(`^${r.toolkitSlug}_`, 'i'), ''));
    return `${app}, ${action}`;
  }
  if (typeof r.command === 'string') return `la commande « ${r.command.slice(0, 80)} »`;
  if (r.kind === 'mcp' && typeof r.toolName === 'string') return words(r.toolName);
  return words(p.toolName);
}

/** One notification per pending action. */
export function approvalNotifications(event: SuspendedEvent, sessionId: string | null): Array<{ input: NotifyInput; extra: PhoneExtra }> {
  return event.pendingPermissions.map((p) => ({
    input: {
      title: WORDS.title,
      message: WORDS.body(describe(p)),
      link: sessionId ? `rowboat://open?type=chat&sessionId=${encodeURIComponent(sessionId)}` : 'rowboat://open?type=chat',
    },
    extra: {
      categoryId: APPROVAL_CATEGORY,
      data: { kind: 'approval', turnId: event.turnId, toolCallId: p.toolCallId, ...(sessionId ? { sessionId } : {}) },
    },
  }));
}

export interface ApprovalWatchDeps {
  subscribeAll: (listener: (event: BusEvent) => void) => () => void;
  send: (input: NotifyInput, extra: PhoneExtra) => Promise<number>;
  /** The person's « agent permission » switch (notifications settings). */
  enabled: () => boolean;
}

export function watchApprovals(deps: ApprovalWatchDeps): () => void {
  const seen = new Set<string>();
  return deps.subscribeAll((bus) => {
    const event = bus.event as SuspendedEvent | undefined;
    if (event?.type !== 'turn_suspended' || !event.pendingPermissions?.length) return;
    if (!deps.enabled()) return;
    for (const n of approvalNotifications(event, bus.sessionId)) {
      const key = `${event.turnId}:${n.extra.data?.toolCallId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > REMEMBERED) seen.delete(seen.values().next().value as string);
      void deps.send(n.input, n.extra);
    }
  });
}
