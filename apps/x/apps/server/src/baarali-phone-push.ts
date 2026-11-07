import fs from 'node:fs';
import path from 'node:path';
import type { NotifyInput } from '@x/core/dist/application/notification/service.js';

// BAARALI(07/11/2026): the agent writes first, on the phone
// (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 B). In the cloud the server's
// notifications reached only an app open at that moment (the capability
// broker): with the phone in a pocket, a permission request or a routine's
// « notify-user » went nowhere. The phones paired with this instance already
// register their Expo push token here (core spaces/phone-push.ts, RPC
// `phone:push:register`); this sends them the same notification, the way
// Harbor sends its own (apps/harbor/packages/server/src/push.ts).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo takes 100 messages per request. */
const CHUNK = 100;
const TITLE_MAX = 120;
const BODY_MAX = 240;

type Level = 'off' | 'mentions' | 'dms' | 'all';

interface Registration {
  token: string;
  level: Level;
}

export interface PhonePushDeps {
  /** Where core keeps the phones' registrations (config/phone_push.json). */
  workDir: string;
  fetch: typeof fetch;
  /** An app showing the notification itself is connected (the broker). */
  clientConnected: () => boolean;
}

/** What a phone gets: the notification's words, and where a tap leads. */
export interface PhoneMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  data: { link?: string; kind: 'agent' };
}

export function phoneRegistrations(workDir: string): Registration[] {
  try {
    const file = path.join(workDir, 'config', 'phone_push.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { phones?: Record<string, Registration> };
    // `off` is the phone's own « no push » setting; every other level wants
    // what its own agent says to it, as a DM would be (Harbor notify.ts).
    return Object.values(parsed.phones ?? {}).filter((r) => typeof r.token === 'string' && r.level !== 'off');
  } catch {
    return [];
  }
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The messages to send, or none: ambient ones stay quiet while an app shows them already. */
export function phoneMessages(input: NotifyInput, registrations: Registration[], clientConnected: boolean): PhoneMessage[] {
  if (input.onlyWhenBackground && clientConnected) return [];
  const title = cut(input.title?.trim() || 'Baarali', TITLE_MAX);
  const body = cut(input.message.trim(), BODY_MAX);
  if (!body) return [];
  return registrations.map((r) => ({
    to: r.token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    data: { ...(input.link ? { link: input.link } : {}), kind: 'agent' },
  }));
}

export function createPhonePush(deps: PhonePushDeps) {
  return {
    /** Some phone would receive it: the server may offer notifications even with no app connected. */
    hasPhones: () => phoneRegistrations(deps.workDir).length > 0,
    async send(input: NotifyInput): Promise<number> {
      const messages = phoneMessages(input, phoneRegistrations(deps.workDir), deps.clientConnected());
      for (let i = 0; i < messages.length; i += CHUNK) {
        try {
          const res = await deps.fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(messages.slice(i, i + CHUNK)),
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) console.error(`[phone-push] Expo answered ${res.status}`);
        } catch (err) {
          // A notification lost is not a run lost: the chat still holds it.
          console.error('[phone-push] not sent', err);
        }
      }
      return messages.length;
    },
  };
}
