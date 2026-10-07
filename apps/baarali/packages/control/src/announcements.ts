import type { Plan } from './store.js';

// Announcements (decided 07/10/2026, console mockup validated the same day):
// one banner at the top of the Chat, on the Mac and the phone, written in the
// admin console. One is visible at a time: publishing ends the one before.
// The person may close it; it then stays closed for their account, on every
// device. The apps read it with the account's own token (GET /v1/announcement).

/** Where the banner's button leads: a screen of the app, or a web page. */
export const ANNOUNCEMENT_TARGETS = ['none', 'plans', 'usage', 'voice', 'link'] as const;
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number];

/** Who sees it, by the kind of plan. */
export const ANNOUNCEMENT_AUDIENCES = ['all', 'free', 'paid'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** Blue for news, orange for something that matters (an outage, a price change). */
export const ANNOUNCEMENT_TONES = ['info', 'important'] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

export interface Announcement {
  id: string;
  text: string;
  /** The button's words; null: no button. */
  button: string | null;
  target: AnnouncementTarget;
  /** Only with `target: 'link'`: an https address. */
  link: string | null;
  audience: AnnouncementAudience;
  tone: AnnouncementTone;
  startsAt: number;
  endsAt: number;
  createdAt: number;
  /** The admin who published it. */
  createdBy: string;
  /** Set when withdrawn, or replaced by the next one. */
  removedAt: number | null;
}

export const ANNOUNCEMENT_EVENTS = ['view', 'click', 'dismiss'] as const;
export type AnnouncementEvent = (typeof ANNOUNCEMENT_EVENTS)[number];

/** Each person counts once per kind: a banner seen on two devices is one view. */
export type AnnouncementStats = Record<AnnouncementEvent, number>;

/** A banner is read in a glance: longer belongs in a notification. */
export const MAX_TEXT = 160;
export const MAX_BUTTON = 24;
/** Long enough for a promotion, short enough that a forgotten banner goes away. */
export const MAX_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** A date from the console: a timestamp or an ISO string; undefined when absent. */
function dateOf(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const t = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** An https address only: a banner must never open anything else. */
function httpsLink(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export type DraftResult =
  | { ok: true; draft: Omit<Announcement, 'id' | 'createdAt' | 'createdBy' | 'removedAt'> }
  | { ok: false; message: string };

/** The console's form, checked. Starts now when no start is given. */
export function parseDraft(body: Record<string, unknown>, now: number): DraftResult {
  const text = typeof body.text === 'string' ? body.text.trim().replace(/\s+/g, ' ') : '';
  if (!text) return { ok: false, message: 'Le texte est vide.' };
  if (text.length > MAX_TEXT) return { ok: false, message: `Le texte dépasse ${MAX_TEXT} caractères.` };

  const target = body.target === undefined ? 'none' : body.target;
  if (!oneOf(ANNOUNCEMENT_TARGETS, target)) return { ok: false, message: 'Destination inconnue.' };
  const buttonWords = typeof body.button === 'string' ? body.button.trim() : '';
  if (buttonWords.length > MAX_BUTTON) return { ok: false, message: `Le bouton dépasse ${MAX_BUTTON} caractères.` };
  const link = target === 'link' ? httpsLink(body.link) : null;
  if (target === 'link' && !link) return { ok: false, message: 'Le lien doit commencer par https://' };
  // A button needs somewhere to go, and a destination needs a button.
  const button = target === 'none' ? null : buttonWords || null;
  if (target !== 'none' && !button) return { ok: false, message: 'Donne des mots au bouton.' };

  const audience = body.audience === undefined ? 'all' : body.audience;
  if (!oneOf(ANNOUNCEMENT_AUDIENCES, audience)) return { ok: false, message: 'Public inconnu.' };
  const tone = body.tone === undefined ? 'info' : body.tone;
  if (!oneOf(ANNOUNCEMENT_TONES, tone)) return { ok: false, message: 'Couleur inconnue.' };

  const start = dateOf(body.startsAt);
  const end = dateOf(body.endsAt);
  if (start === null || end === null || end === undefined) return { ok: false, message: 'Les dates ne sont pas lisibles.' };
  const startsAt = start ?? now;
  if (end <= Math.max(startsAt, now)) return { ok: false, message: 'La fin doit venir après le début, et après maintenant.' };
  if (end - startsAt > MAX_DAYS * DAY_MS) return { ok: false, message: `Une annonce dure ${MAX_DAYS} jours au plus.` };

  return { ok: true, draft: { text, button, target, link, audience, tone, startsAt, endsAt: end } };
}

/** On screen now: published, not withdrawn, within its dates. */
export const isLive = (a: Announcement, now: number) => a.removedAt === null && a.startsAt <= now && now < a.endsAt;

const reaches = (a: Announcement, plan: Plan | null) =>
  a.audience === 'all' || (a.audience === 'free') === (!plan || plan.category === 'free');

/**
 * The banner one account sees: the newest live one meant for its plan,
 * unless the person closed it.
 */
export function bannerFor(list: Announcement[], plan: Plan | null, dismissed: (id: string) => boolean, now: number): Announcement | null {
  const live = list.filter((a) => isLive(a, now) && reaches(a, plan)).sort((a, b) => b.createdAt - a.createdAt);
  const top = live[0];
  return top && !dismissed(top.id) ? top : null;
}

/** What an app is told: the words and where the button leads, nothing of the console's. */
export function publicBanner(a: Announcement) {
  return { id: a.id, text: a.text, button: a.button, target: a.target, link: a.link, tone: a.tone, endsAt: new Date(a.endsAt).toISOString() };
}
