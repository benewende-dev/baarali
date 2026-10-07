import { spaces as shared } from '@x/shared';
import type { Member } from '@rowboat/spaces-protocol';

import type { useConnection } from '@/lib/connection';

// BAARALI(07/10/2026): mentions typed on the phone. The phone's composer has
// no @ menu: « @Fatou » arrives as plain text, which the org reads as words,
// so nobody is told and no agent wakes. Before sending, each « @Name » of a
// member of the space becomes the protocol's token (mentions.ts), and
// « @rowboat » the assistant's; then a message that calls the person's own
// agent asks the instance to answer, as the desktop's composer does
// (renderer lib/spaces-rowboat.ts).

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The body with « @Name » turned into mention tokens. Longest names first: « @Awa Diallo » before « @Awa ». */
export function tokenizeMentions(body: string, members: Iterable<Member>): string {
  let out = body.replace(/(^|[\s(])@rowboat\b/gi, (_, lead: string) => `${lead}${shared.mentionToken({ kind: 'rowboat' })}`);
  const named = [...members].filter((m) => m.displayName.trim()).sort((a, b) => b.displayName.length - a.displayName.length);
  for (const m of named) {
    // No \p{…} classes: Hermes may not have them. Latin letters, accented ones included.
    const re = new RegExp(`(^|[\\s(])@${escape(m.displayName.trim())}(?![\\w\\u00C0-\\u024F])`, 'gi');
    out = out.replace(re, (_, lead: string) => `${lead}${shared.mentionToken({ kind: 'member', id: m.id, label: m.displayName })}`);
  }
  return out;
}

type Rpc = NonNullable<ReturnType<typeof useConnection>['rpc']>;

const orgIds = new Map<string, string>();

/** The instance's own id for the org at this address (its ids are not the phone's). */
export async function instanceOrgId(rpc: Rpc, address: string): Promise<string | null> {
  const known = orgIds.get(address);
  if (known) return known;
  const { orgs } = (await rpc.call('spaces:listOrgs', null)) as { orgs: { id: string; address: string }[] };
  const org = orgs.find((o) => o.address === address);
  if (org) orgIds.set(address, org.id);
  return org?.id ?? null;
}

/** A posted message that calls @rowboat: the person's own agent answers in its thread. */
export async function askRowboatIfCalled(
  rpc: Rpc | null | undefined,
  input: { address: string; spaceId: string; spaceName: string; messageId: string; threadRootId: string; body: string },
): Promise<void> {
  if (!rpc || !shared.addressesRowboat(input.body)) return;
  const orgId = await instanceOrgId(rpc, input.address);
  if (!orgId) return;
  await rpc.call('spaces:invokeRowboat', {
    orgId,
    spaceId: input.spaceId,
    threadRootId: input.threadRootId,
    threadLabel: shared.mentionsAsText(input.body, new Map()).split('\n')[0]?.slice(0, 100) || input.spaceName,
    spaceName: input.spaceName,
    messageId: input.messageId,
    body: input.body,
  });
}
