import fs from 'node:fs';
import path from 'node:path';
import type { ServerFrame } from '@rowboat/spaces-protocol';
import { WorkDir } from '../config/config.js';
import { findBaarasseur } from '../baarasseurs/repo.js';
import { SpacesClient } from './client.js';
import { SpacesLive } from './live.js';
import { getClient, getOrg, listOrgs, type DerivedMcpServer } from './orgs.js';

// BAARALI(07/10/2026): a baarasseur in a work group, as a member in its own
// right (founder's call, mockup artboard 18; harbor CONTRACT.md « An agent
// member has an owner and its own keys »). Ticked in a group from the phone
// or the computer, it is added to the org once as an agent the person owns;
// its key stays here, in the instance, and never passes through a tool.
// With that key the instance listens for it: a message that names it (or a
// direct message to it) starts its own session on the thread, with its
// persona, and it answers with the same key, so the group sees its name.
//
// Not yet: a mention made while the instance sleeps is not caught up on
// waking (the agent's live socket only hears what happens while it is open).

const FILE = path.join(WorkDir, 'config', 'spaces_baarasseurs.json');

export interface EnrolledBaarasseur {
  /** The local org record (orgs.ts `id`). */
  orgId: string;
  baarasseurId: string;
  /** Its id on the org, the one groups list. */
  memberId: string;
  name: string;
  keyId: string;
  /** The rbk_ key: here only, never in a tool's input or output. */
  secret: string;
}

interface StoreFile {
  version: 1;
  agents: EnrolledBaarasseur[];
  /** The thread sessions a baarasseur answers in: sessionId → its memberId. */
  sessions: Record<string, string>;
}

let cache: StoreFile | null = null;

function load(): StoreFile {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<StoreFile>;
    cache = { version: 1, agents: raw.agents ?? [], sessions: raw.sessions ?? {} };
  } catch {
    cache = { version: 1, agents: [], sessions: {} };
  }
  return cache;
}

// Whole, through a temp file, readable by this process only: it holds keys.
function save(): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

export function enrolledFor(orgId: string, baarasseurId: string): EnrolledBaarasseur | undefined {
  return load().agents.find((a) => a.orgId === orgId && a.baarasseurId === baarasseurId);
}

export function enrolledByMember(memberId: string): EnrolledBaarasseur | undefined {
  return load().agents.find((a) => a.memberId === memberId);
}

/** The org a phone names by its address (its own org ids are not the instance's). */
export function orgIdForAddress(address: string): string | null {
  const bare = address.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return listOrgs().find((o) => o.address === bare || o.baseUrl.replace(/^https?:\/\//, '') === bare)?.id ?? null;
}

/**
 * Makes the baarasseur a member of the org (once), and starts listening for
 * it. Returns its member id, for the group's addMembers.
 */
export async function enrollBaarasseur(orgId: string, baarasseurId: string): Promise<{ memberId: string }> {
  const known = enrolledFor(orgId, baarasseurId);
  if (known) return { memberId: known.memberId };
  const b = await findBaarasseur(baarasseurId);
  if (!b) throw new Error(`no baarasseur ${baarasseurId}`);
  if (!getOrg(orgId)) throw new Error(`unknown org ${orgId}`);
  const { agent, key } = await getClient(orgId).addAgent(b.name);
  const entry: EnrolledBaarasseur = { orgId, baarasseurId, memberId: agent.id, name: b.name, keyId: key.id, secret: key.secret };
  load().agents.push(entry);
  save();
  listen(entry);
  return { memberId: agent.id };
}

// --- answering as itself -----------------------------------------------------

/** The MCP server a baarasseur's tools go through: the org's agent face, with its key. */
export function baarasseurMcpServerName(entry: Pick<EnrolledBaarasseur, 'memberId'>): string {
  return `spaces-agent-${entry.memberId}`;
}

/** Its servers, merged with the person's (orgs.ts spacesMcpServers). */
export function baarasseurMcpServers(): Record<string, DerivedMcpServer> {
  const out: Record<string, DerivedMcpServer> = {};
  for (const a of load().agents) {
    const org = getOrg(a.orgId);
    if (!org) continue;
    out[baarasseurMcpServerName(a)] = {
      url: `${org.baseUrl}/mcp`,
      headers: { authorization: `Bearer ${a.secret}` },
    };
  }
  return out;
}

/** Remembers that a thread session is this baarasseur's (topic-agent.ts). */
export function noteBaarasseurSession(sessionId: string, memberId: string): void {
  const file = load();
  if (file.sessions[sessionId] === memberId) return;
  file.sessions[sessionId] = memberId;
  save();
}

/**
 * Who acts in a session's spaces tools: the baarasseur that answers there, on
 * its own org, else null (the person's own agent, as before).
 */
export function actingBaarasseur(sessionId: string | null | undefined, orgId: string): EnrolledBaarasseur | null {
  if (!sessionId) return null;
  const memberId = load().sessions[sessionId];
  const entry = memberId ? enrolledByMember(memberId) : undefined;
  return entry && entry.orgId === orgId ? entry : null;
}

// --- listening ---------------------------------------------------------------

const sockets = new Map<string, SpacesLive>();
/** Agents seen per org: a message from an agent never wakes another (no ping-pong). */
const agentMembers = new Map<string, Set<string>>();

async function isAgent(entry: EnrolledBaarasseur, client: SpacesClient, memberId: string): Promise<boolean> {
  if (load().agents.some((a) => a.memberId === memberId)) return true;
  let known = agentMembers.get(entry.orgId);
  if (!known?.has(memberId)) {
    const roster = await client.listOrgMembers().catch(() => []);
    known = new Set(roster.filter((m) => m.kind === 'agent').map((m) => m.id));
    agentMembers.set(entry.orgId, known);
  }
  return known.has(memberId);
}

/** What a frame asks of the baarasseur: only to be named, or written to directly. */
export function asksBaarasseur(frame: ServerFrame): frame is Extract<ServerFrame, { kind: 'notify' }> {
  if (frame.kind !== 'notify') return false;
  if (frame.reason !== 'mention' && frame.reason !== 'dm') return false;
  // A person's own agent speaks for them: it does not summon the others.
  return frame.author.actingMode === 'direct';
}

function listen(entry: EnrolledBaarasseur): void {
  if (sockets.has(entry.memberId)) return;
  const org = getOrg(entry.orgId);
  if (!org) return;
  const client = new SpacesClient({ baseUrl: org.baseUrl, token: entry.secret });
  const live = new SpacesLive({ baseUrl: org.baseUrl, token: entry.secret });
  live.onMemberFrame((frame) => {
    if (!asksBaarasseur(frame)) return;
    void answer(entry, client, frame).catch((err) => console.error('[spaces:baarasseur] answer failed:', err));
  });
  sockets.set(entry.memberId, live);
}

async function answer(entry: EnrolledBaarasseur, client: SpacesClient, frame: Extract<ServerFrame, { kind: 'notify' }>): Promise<void> {
  if (await isAgent(entry, client, frame.author.memberId)) return;
  const [message, spaces] = await Promise.all([
    client.getMessage(frame.spaceId, frame.messageId).catch(() => null),
    client.listSpaces({ includeDirect: true }).catch(() => []),
  ]);
  const space = spaces.find((s) => s.id === frame.spaceId);
  const body = message?.body ?? frame.body;
  const { invokeTopicAgent } = await import('./topic-agent.js');
  await invokeTopicAgent({
    orgId: entry.orgId,
    spaceId: frame.spaceId,
    threadRootId: frame.threadRootId ?? frame.messageId,
    threadLabel: body.split('\n')[0] || entry.name,
    spaceName: space?.name ?? frame.title,
    messageId: frame.messageId,
    body,
    actAs: { baarasseurId: entry.baarasseurId, memberId: entry.memberId, name: entry.name },
  });
}

/** Every enrolled baarasseur listens. Idempotent; hosts call it at boot. */
export function startBaarasseurListeners(): void {
  for (const entry of load().agents) listen(entry);
}

/** Test seam. */
export function resetBaarasseurMembersForTests(): void {
  for (const live of sockets.values()) live.close();
  sockets.clear();
  agentMembers.clear();
  cache = null;
}
