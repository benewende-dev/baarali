import * as Notifications from 'expo-notifications';

import type { RpcClient } from '@x/client';

// BAARALI(07/11/2026): answer the agent from the notification
// (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 C). The instance sends one
// notification per action waiting for a yes, in the `baarali-approval`
// category (apps/server baarali-approvals.ts); its buttons answer it over
// `sessions:respondToPermission`. « Approve » asks the phone to be unlocked
// (iOS authenticationRequired): a yes from a locked phone in someone
// else's hand is no yes.
//
// Each button opens the app: a button that answers in the background needs a
// background task Expo runs only while the app lives, and a lost answer would
// leave the agent waiting with the person believing it done.

export const APPROVAL_CATEGORY = 'baarali-approval';
export const APPROVE = 'approve';
export const DENY = 'deny';
export const VIEW = 'view';

export async function registerApprovalCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(APPROVAL_CATEGORY, [
    { identifier: APPROVE, buttonTitle: 'Approve', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: DENY, buttonTitle: 'Deny', options: { opensAppToForeground: true, isDestructive: true } },
    { identifier: VIEW, buttonTitle: 'View', options: { opensAppToForeground: true } },
  ]);
}

export interface ApprovalData {
  kind: 'approval';
  turnId: string;
  toolCallId: string;
  sessionId?: string;
}

export function approvalData(data: unknown): ApprovalData | null {
  const d = data as Partial<ApprovalData> | null | undefined;
  return d?.kind === 'approval' && typeof d.turnId === 'string' && typeof d.toolCallId === 'string' ? (d as ApprovalData) : null;
}

/** What a tap means: answer the agent, or open where it leads. */
export type Answer = { kind: 'decide'; decision: 'allow' | 'deny'; data: ApprovalData } | { kind: 'open'; sessionId: string | null } | { kind: 'none' };

export function answerOf(actionIdentifier: string, data: unknown): Answer {
  const approval = approvalData(data);
  if (approval && actionIdentifier === APPROVE) return { kind: 'decide', decision: 'allow', data: approval };
  if (approval && actionIdentifier === DENY) return { kind: 'decide', decision: 'deny', data: approval };
  const d = data as { kind?: string; sessionId?: string; link?: string } | null | undefined;
  if (approval) return { kind: 'open', sessionId: approval.sessionId ?? null };
  if (d?.kind === 'agent') {
    const fromLink = typeof d.link === 'string' ? /[?&]sessionId=([^&]+)/.exec(d.link)?.[1] : undefined;
    return { kind: 'open', sessionId: fromLink ? decodeURIComponent(fromLink) : null };
  }
  return { kind: 'none' };
}

/** Sends the person's decision. False when the agent is out of reach or the action was already settled. */
export async function decide(rpc: RpcClient, data: ApprovalData, decision: 'allow' | 'deny'): Promise<boolean> {
  try {
    await rpc.call('sessions:respondToPermission', { turnId: data.turnId, toolCallId: data.toolCallId, decision });
    return true;
  } catch {
    return false;
  }
}
