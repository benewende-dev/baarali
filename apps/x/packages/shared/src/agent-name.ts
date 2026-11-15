// BAARALI(14/11/2026): the person's first agent gets its name from them
// (the founder: at sign-up the person gives their own name; once signed in,
// the agent asks what they want to call it). The copilot alone reads it:
// the baarasseurs share the Agent Notes, so it has its own file.

/** The copilot's name, in the workspace (core registry.ts reads it). */
export const AGENT_NAME_FILE = 'config/baarali-agent.json';
/** The notes the agent reads on the person at every turn (core workspace-context.ts). */
export const USER_NOTES_FILE = 'knowledge/Agent Notes/user.md';

/** A name typed by the person, cleaned; empty when nothing usable is left. */
export function cleanAgentName(raw: string): string {
  return raw.replace(/[\r\n<>`"*#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** The file's name, or null (no file, unreadable, or empty). */
export function parseAgentName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const name = (JSON.parse(raw) as { name?: unknown }).name;
    return typeof name === 'string' && cleanAgentName(name) ? cleanAgentName(name) : null;
  } catch {
    return null;
  }
}

export function agentNameFile(name: string): string {
  return `${JSON.stringify({ version: 1, name: cleanAgentName(name) }, null, 2)}\n`;
}

/** The copilot's prompt part about its name. */
export function agentNameInstructions(name: string | null): string {
  if (name) {
    return `# Your name\nThe user named you ${name}. Introduce yourself and sign as ${name}: Baarali is the app, not you. If they ask you to change your name, call \`copilot-set-name\`.`;
  }
  return [
    '# Your name',
    'The user has not named you yet. When they signed in, the app showed your greeting: « I am your first agent. What would you like to call me? ».',
    'If their message gives you a name (even one word, like « Awa »), first call `copilot-set-name` with it, then thank them in one short sentence using your new name and ask what you can do for them.',
    'If they talk about something else, help them, then ask once, briefly, what they would like to call you.',
  ].join('\n');
}

// What the person told at sign-up, in the same block the computer's
// onboarding writes (renderer baarali-onboarding/model.ts profileBlock).
const START = '<!-- baarali:profile -->';
const END = '<!-- /baarali:profile -->';

export type SignUpProfile = { name?: string; activity?: string; lang?: string };

/** The person's notes with what they told at sign-up first; the rest kept. */
export function withSignUpProfile(existing: string, profile: SignUpProfile): string {
  const at = existing.indexOf(START);
  const end = at >= 0 ? existing.indexOf(END, at) : -1;
  const rest = (at >= 0 && end >= 0 ? existing.slice(0, at) + existing.slice(end + END.length) : existing).trim();
  const name = cleanAgentName(profile.name ?? '');
  const activity = cleanAgentName(profile.activity ?? '');
  const lines = [name && `- First name: ${name}`, activity && `- Activity: ${activity}`].filter(Boolean);
  if (!lines.length) return rest ? `${rest}\n` : '';
  lines.push(`- Language of the app: ${profile.lang === 'fr' ? 'French' : 'English'}`);
  const block = [START, '## Told at sign-up', ...lines, END].join('\n');
  return rest ? `${block}\n\n${rest}\n` : `${block}\n`;
}
