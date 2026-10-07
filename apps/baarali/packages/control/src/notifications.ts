import { createHmac, timingSafeEqual } from 'node:crypto';
import { advance, budgetsForWeek } from './quota.js';
import type { AccountSummary, ControlStore, Plan } from './store.js';

// Notifications (decided 07/10/2026, console mockup validated the same day):
// a message written in the admin console, for everyone, a group or one
// person; read in the app (the bell on the Mac, the inbox on the phone) and,
// when asked, by email. Sent now or at a set time. Who receives it is decided
// when it leaves: someone who joins later does not get it.

/** Where the message leads when tapped: a screen of the app, or a web page. */
export const NOTICE_TARGETS = ['none', 'chat', 'plans', 'usage', 'link'] as const;
export type NoticeTarget = (typeof NOTICE_TARGETS)[number];

/** Who receives it. `account`: one person, by their email. */
export const NOTICE_AUDIENCES = ['all', 'free', 'paid', 'limit', 'inactive', 'account'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export interface Notice {
  id: string;
  title: string;
  body: string;
  /** The button's words; null: the message itself leads to the target. */
  button: string | null;
  target: NoticeTarget;
  /** Only with `target: 'link'`: an https address. */
  link: string | null;
  audience: NoticeAudience;
  /** Only with `audience: 'account'`. */
  accountId: string | null;
  /** Read in the app (bell, inbox). */
  app: boolean;
  /** Sent by email too, to those who did not opt out. */
  email: boolean;
  sendAt: number;
  createdAt: number;
  /** The admin who wrote it. */
  createdBy: string;
  /** When it left; null until then. */
  sentAt: number | null;
  cancelledAt: number | null;
  /** « M'envoyer un test »: to the admin alone, kept out of the figures. */
  test: boolean;
}

/** One person's copy of a message. */
export interface Delivery {
  noticeId: string;
  accountId: string;
  deliveredAt: number;
  emailedAt: number | null;
  readAt: number | null;
  clickedAt: number | null;
}

export const NOTICE_EVENTS = ['read', 'click'] as const;
export type NoticeEvent = (typeof NOTICE_EVENTS)[number];

export interface NoticeStats {
  delivered: number;
  emailed: number;
  read: number;
  clicked: number;
}

export const MAX_TITLE = 60;
export const MAX_BODY = 500;
export const MAX_BUTTON = 24;
/** Far enough for a launch, near enough that a forgotten one is noticed. */
export const MAX_SCHEDULE_DAYS = 60;
/** Inactive: no model call for this long (mockup: « Inactifs depuis 14 jours »). */
export const INACTIVE_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function httpsLink(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export type NoticeDraft = Pick<Notice, 'title' | 'body' | 'button' | 'target' | 'link' | 'audience' | 'app' | 'email' | 'sendAt'> & {
  /** With `audience: 'account'`: the person's email, found by the console. */
  accountEmail: string | null;
};

export type NoticeDraftResult = { ok: true; draft: NoticeDraft } | { ok: false; message: string };

/** The console's form, checked. Leaves now when no time is given. */
export function parseNoticeDraft(body: Record<string, unknown>, now: number): NoticeDraftResult {
  const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/g, ' ') : '';
  if (!title) return { ok: false, message: 'Le titre est vide.' };
  if (title.length > MAX_TITLE) return { ok: false, message: `Le titre dépasse ${MAX_TITLE} caractères.` };
  // Line breaks are kept: a message may have two short paragraphs.
  const text = typeof body.body === 'string' ? body.body.trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : '';
  if (!text) return { ok: false, message: 'Le message est vide.' };
  if (text.length > MAX_BODY) return { ok: false, message: `Le message dépasse ${MAX_BODY} caractères.` };

  const target = body.target === undefined ? 'none' : body.target;
  if (!oneOf(NOTICE_TARGETS, target)) return { ok: false, message: 'Destination inconnue.' };
  const buttonWords = typeof body.button === 'string' ? body.button.trim() : '';
  if (buttonWords.length > MAX_BUTTON) return { ok: false, message: `Le bouton dépasse ${MAX_BUTTON} caractères.` };
  const link = target === 'link' ? httpsLink(body.link) : null;
  if (target === 'link' && !link) return { ok: false, message: 'Le lien doit commencer par https://' };
  // No destination, no button; a destination without a button is reached by tapping the message.
  const button = target === 'none' ? null : buttonWords || null;

  const audience = body.audience === undefined ? 'all' : body.audience;
  if (!oneOf(NOTICE_AUDIENCES, audience)) return { ok: false, message: 'Public inconnu.' };
  const accountEmail = audience === 'account' && typeof body.accountEmail === 'string' ? body.accountEmail.trim().toLowerCase() : '';
  if (audience === 'account' && !accountEmail) return { ok: false, message: 'Donne l’email du client.' };

  const app = body.app === undefined ? true : body.app === true;
  const email = body.email === true;
  if (!app && !email) return { ok: false, message: 'Choisis au moins un moyen d’envoi.' };

  let sendAt = now;
  if (body.sendAt !== undefined && body.sendAt !== null && body.sendAt !== '') {
    const t = typeof body.sendAt === 'number' ? body.sendAt : typeof body.sendAt === 'string' ? Date.parse(body.sendAt) : NaN;
    if (!Number.isFinite(t)) return { ok: false, message: 'L’heure d’envoi n’est pas lisible.' };
    if (t < now - 60_000) return { ok: false, message: 'L’heure d’envoi est déjà passée.' };
    if (t - now > MAX_SCHEDULE_DAYS * DAY_MS) return { ok: false, message: `Un envoi se programme ${MAX_SCHEDULE_DAYS} jours à l’avance au plus.` };
    sendAt = Math.max(t, now);
  }

  return { ok: true, draft: { title, body: text, button, target, link, audience, app, email, sendAt, accountEmail: accountEmail || null } };
}

/**
 * Who a message reaches when it leaves. Suspended accounts never; for
 * `limit`, those out of credits in their session or their week right now.
 */
export function audienceOf(
  notice: Pick<Notice, 'audience' | 'accountId'>,
  list: AccountSummary[],
  plans: Plan[],
  now: number,
): AccountSummary[] {
  const planOf = (id: string) => plans.find((p) => p.id === id) ?? null;
  const isFree = (s: AccountSummary) => (planOf(s.account.planId)?.category ?? 'free') === 'free';
  return list.filter((s) => {
    if (s.account.suspendedAt) return false;
    switch (notice.audience) {
      case 'all':
        return true;
      case 'free':
        return isFree(s);
      case 'paid':
        return !isFree(s);
      case 'inactive':
        return (s.lastActiveAt ?? s.account.createdAt) < now - INACTIVE_MS;
      case 'account':
        return s.account.id === notice.accountId;
      case 'limit': {
        if (!s.quota) return false;
        const state = advance(s.quota, now);
        const b = budgetsForWeek(planOf(s.account.planId)?.weekCredits ?? 0);
        return (b.weekCredits > 0 && state.weekUsed >= b.weekCredits) || (b.sessionCredits > 0 && state.sessionStart !== null && state.sessionUsed >= b.sessionCredits);
      }
    }
  });
}

/** Those an email can reach: an address, and no opt-out. */
export const emailable = (s: AccountSummary) => Boolean(s.account.email) && !s.account.emailOptOutAt;

/** What an app is told: the words and where it leads. */
export function publicNotice(n: Notice, d: Delivery) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    button: n.button,
    target: n.target,
    link: n.link,
    sentAt: new Date(n.sentAt ?? d.deliveredAt).toISOString(),
    read: d.readAt !== null,
  };
}

// --- Email links: a click, an open, an opt-out, each signed for one person. ---

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export class NoticeLinks {
  private readonly key: Buffer;
  constructor(secret: string, private readonly publicUrl: string) {
    // Its own key, derived: a link token never doubles as anything else.
    this.key = createHmac('sha256', secret).update('baarali-notice-links-v1').digest();
  }

  private sign(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('base64url').slice(0, 32);
  }

  token(noticeId: string, accountId: string): string {
    const payload = b64(`${noticeId}\n${accountId}`);
    return `${payload}.${this.sign(payload)}`;
  }

  /** The message and person a token names, or null when it was not ours. */
  read(token: string): { noticeId: string; accountId: string } | null {
    const [payload, mac] = token.split('.');
    if (!payload || !mac) return null;
    const want = Buffer.from(this.sign(payload));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const [noticeId, accountId] = Buffer.from(payload, 'base64url').toString().split('\n');
    return noticeId && accountId ? { noticeId, accountId } : null;
  }

  click(token: string) {
    return `${this.publicUrl}/n/c/${token}`;
  }
  open(token: string) {
    return `${this.publicUrl}/n/o/${token}`;
  }
  unsubscribe(token: string) {
    return `${this.publicUrl}/n/u/${token}`;
  }
}

/** Where an email's button leads: the web for what the web has, else the home page. */
export function emailTarget(n: Pick<Notice, 'target' | 'link'>, publicUrl: string, pricingPath: string): string {
  if (n.target === 'link' && n.link) return n.link;
  if (n.target === 'plans') return `${publicUrl}${pricingPath}`;
  return publicUrl;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/** One person's email: plain words, one button, the way out at the bottom. */
export function noticeEmail(n: Notice, to: string, links: NoticeLinks, accountId: string): Mail {
  const token = links.token(n.id, accountId);
  const unsubscribe = links.unsubscribe(token);
  const click = links.click(token);
  const paragraphs = n.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${esc(p).replace(/\n/g, '<br>')}</p>`);
  const button = n.button
    ? `<p style="margin:20px 0 4px"><a href="${esc(click)}" style="display:inline-block;background:#0062C4;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(n.button)}</a></p>`
    : '';
  const html = [
    '<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb"><tr><td style="padding:26px 28px">',
    '<div style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:8px;background:#0062C4;color:#fff;font-weight:700;font-size:16px;margin-bottom:16px">B</div>',
    `<h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#111827">${esc(n.title)}</h1>`,
    ...paragraphs,
    button,
    '</td></tr></table>',
    `<p style="margin:16px 0 0;font-size:12px;color:#6b7280">Baarali · <a href="${esc(unsubscribe)}" style="color:#6b7280">Ne plus recevoir ces emails</a></p>`,
    `<img src="${esc(links.open(token))}" width="1" height="1" alt="" style="display:block;border:0">`,
    '</td></tr></table></body></html>',
  ].join('');
  const text = [n.title, '', n.body, ...(n.button ? ['', `${n.button} : ${click}`] : []), '', `Ne plus recevoir ces emails : ${unsubscribe}`].join('\n');
  return {
    to,
    subject: n.title,
    text,
    html,
    // One-click opt-out from the mail app itself (RFC 8058).
    headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// --- Sending email: Resend's batch API, 100 per call. ---

export interface Mailer {
  /** The positions, in `mails`, of those the service accepted. */
  send(mails: Mail[]): Promise<{ accepted: number[] }>;
}

/** Resend, from the sign-in codes' address (codes.ts). */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(mails: Mail[]) {
    const accepted: number[] = [];
    for (let i = 0; i < mails.length; i += 100) {
      const chunk = mails.slice(i, i + 100);
      const res = await this.fetchFn('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(chunk.map((m) => ({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }))),
      });
      // Never the addresses in the log: the status says enough.
      if (res.ok) accepted.push(...chunk.map((_, j) => i + j));
      else console.error(`[notifications] Resend refused a batch: ${res.status}`);
    }
    return { accepted };
  }
}

/** Development: what would leave, kept here. */
export class MemoryMailer implements Mailer {
  readonly outbox: Mail[] = [];
  async send(mails: Mail[]) {
    this.outbox.push(...mails);
    return { accepted: mails.map((_, i) => i) };
  }
}

// --- Leaving: due messages go out once, even with two callers at a time. ---

export interface DispatchDeps {
  store: ControlStore;
  now: () => number;
  /** Unset: the email channel is off; such messages are read in the app only. */
  mailer?: Mailer;
  links?: NoticeLinks;
}

/** Sends one message now: its people get their copy, and their email if asked. */
export async function sendNotice(deps: DispatchDeps, n: Notice): Promise<{ delivered: number; emailed: number }> {
  const now = deps.now();
  if (!(await deps.store.claimNotification(n.id, now))) return { delivered: 0, emailed: 0 };
  const [list, plans] = await Promise.all([deps.store.listAccounts(now), deps.store.plans()]);
  const people = audienceOf(n, list, plans, now);
  await deps.store.deliverNotification(n.id, people.map((s) => s.account.id), now);
  let emailed = 0;
  if (n.email && deps.mailer && deps.links) {
    const to = people.filter(emailable);
    const mails = to.map((s) => noticeEmail(n, s.account.email!, deps.links!, s.account.id));
    const { accepted } = await deps.mailer.send(mails);
    // A refused batch leaves its people unmarked: « envoyés » stays true.
    await deps.store.markEmailed(n.id, accepted.map((i) => to[i].account.id), deps.now());
    emailed = accepted.length;
  }
  return { delivered: people.length, emailed };
}

/**
 * Sends what is due. The control plane sleeps when nobody uses it (fly.toml
 * auto_stop): this runs every minute while awake and on the first requests
 * after waking, so a scheduled message leaves at its time or soon after.
 */
export class NoticeDispatcher {
  private running: Promise<void> | null = null;
  private lastRun = 0;
  constructor(private readonly deps: DispatchDeps) {}

  /** At most once a minute unless forced; never twice at a time. */
  run(force = false): Promise<void> {
    if (this.running) return this.running;
    if (!force && this.deps.now() - this.lastRun < 60_000) return Promise.resolve();
    this.lastRun = this.deps.now();
    this.running = (async () => {
      try {
        const now = this.deps.now();
        for (const n of await this.deps.store.notifications(100)) {
          if (n.sentAt === null && n.cancelledAt === null && n.sendAt <= now) await sendNotice(this.deps, n);
        }
      } catch (err) {
        console.error('[notifications] dispatch failed', err);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }
}
