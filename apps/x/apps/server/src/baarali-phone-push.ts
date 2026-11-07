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

// Quiet hours (07/11/2026, spec §3 B): set on the phone, kept here in
// config/baarali-phone.json with the phone's time zone (the machine runs in
// UTC). Nothing is held back: inside them a notification arrives without
// sound or light (iOS « passive »), waiting in the notification centre.
const PREFS_FILE = 'baarali-phone.json';

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
  now?: () => Date;
}

/** What a phone gets: the notification's words, and where a tap leads. */
export interface PhoneMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  priority: 'high' | 'normal';
  interruptionLevel?: 'passive';
  /** The phone's action buttons for it (baarali-approvals.ts registers `baarali-approval`). */
  categoryId?: string;
  data: Record<string, string>;
}

/** What a sender adds beyond the notification's words. */
export interface PhoneExtra {
  categoryId?: string;
  data?: Record<string, string>;
}

export interface PhonePrefs {
  /** 24 h HH:MM, the phone's local time; `start` after `end` spans midnight. */
  quiet: { start: string; end: string } | null;
  /** IANA, as the phone reports it (Intl). */
  timeZone: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function phonePrefs(workDir: string): PhonePrefs | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(workDir, 'config', PREFS_FILE), 'utf8')) as Partial<PhonePrefs>;
    const quiet = raw.quiet && HHMM.test(raw.quiet.start) && HHMM.test(raw.quiet.end) ? { start: raw.quiet.start, end: raw.quiet.end } : null;
    const timeZone = typeof raw.timeZone === 'string' ? raw.timeZone : 'UTC';
    new Intl.DateTimeFormat('en', { timeZone }); // throws on a zone the runtime does not know
    return { quiet, timeZone };
  } catch {
    return null;
  }
}

/** Inside the quiet hours, in the phone's own time zone. */
export function isQuiet(prefs: PhonePrefs | null, now: Date): boolean {
  if (!prefs?.quiet) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const hhmm = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
  const { start, end } = prefs.quiet;
  if (start === end) return false;
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
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
export function phoneMessages(input: NotifyInput, registrations: Registration[], clientConnected: boolean, quiet = false, extra: PhoneExtra = {}): PhoneMessage[] {
  if (input.onlyWhenBackground && clientConnected) return [];
  const title = cut(input.title?.trim() || 'Baarali', TITLE_MAX);
  const body = cut(input.message.trim(), BODY_MAX);
  if (!body) return [];
  return registrations.map((r) => ({
    to: r.token,
    title,
    body,
    ...(quiet ? { priority: 'normal' as const, interruptionLevel: 'passive' as const } : { sound: 'default' as const, priority: 'high' as const }),
    ...(extra.categoryId ? { categoryId: extra.categoryId } : {}),
    data: { kind: 'agent', ...(input.link ? { link: input.link } : {}), ...extra.data },
  }));
}

export function createPhonePush(deps: PhonePushDeps) {
  return {
    /** Some phone would receive it: the server may offer notifications even with no app connected. */
    hasPhones: () => phoneRegistrations(deps.workDir).length > 0,
    async send(input: NotifyInput, extra?: PhoneExtra): Promise<number> {
      const quiet = isQuiet(phonePrefs(deps.workDir), deps.now?.() ?? new Date());
      const messages = phoneMessages(input, phoneRegistrations(deps.workDir), deps.clientConnected(), quiet, extra);
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
