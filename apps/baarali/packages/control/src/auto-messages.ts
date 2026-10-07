import { randomUUID } from 'node:crypto';
import { AUTO_AUTHOR, INACTIVE_MS, noticeEmail, type DispatchDeps, type Notice, type NoticeTarget } from './notifications.js';
import { WEEK_MS, type QuotaWindow } from './quota.js';
import type { Account } from './store.js';

// Automatic messages (console mockup validated 07/10/2026): they leave on
// their own when the situation arrives, each switched on or off from the
// console. They travel like a notification for one person, so the bell, the
// inbox, the email and its opt-out work the same; each leaves once per
// period (claimAutoMessage). The gifted plan's end waits for the gifts.

export const AUTO_KINDS = ['limit', 'media_low', 'inactive', 'welcome'] as const;
export type AutoKind = (typeof AUTO_KINDS)[number];

/** As in the mockup: on, except the email to the inactive. */
export const AUTO_DEFAULTS: Record<AutoKind, boolean> = { limit: true, media_low: true, inactive: false, welcome: true };

/** Below this many media credits, the person is told, once a week at most. */
export const MEDIA_LOW = 20;
/** A new account is welcomed within this time; older ones were here before the message. */
export const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;
const SETTINGS_TTL_MS = 60_000;

interface AutoText {
  title: string;
  body: string;
  button: string | null;
  target: NoticeTarget;
  app: boolean;
  email: boolean;
}

/** « 2 h 15 », « 40 min », « 3 jours »: the wait, as read when it arrives. */
export function waitWords(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  const days = Math.round(minutes / (24 * 60));
  return days > 1 ? `${days} jours` : '1 jour';
}

export function limitText(window: QuotaWindow, wait: number): AutoText {
  const week = window === 'week';
  return {
    title: week ? 'Limite de la semaine atteinte' : 'Limite de session atteinte',
    body: week
      ? `Vous avez utilisé tout votre budget de la semaine. Il revient dans ${waitWords(wait)}. Un forfait supérieur vous donne plus de marge.`
      : `Vous avez utilisé tout le budget de cette session de 5 heures. La suivante s’ouvre dans ${waitWords(wait)}. Un forfait supérieur vous donne plus de marge.`,
    button: 'Voir les forfaits',
    target: 'plans',
    app: true,
    email: false,
  };
}

export function mediaLowText(balance: number): AutoText {
  return {
    title: balance > 0 ? 'Crédits médias presque épuisés' : 'Crédits médias épuisés',
    body:
      balance > 0
        ? `Il vous reste ${balance} crédit${balance > 1 ? 's' : ''} médias pour les images, les vidéos et les sons. Rechargez pour continuer sans interruption.`
        : 'Vous n’avez plus de crédits médias pour les images, les vidéos et les sons. Rechargez pour continuer à créer.',
    button: 'Recharger',
    target: 'plans',
    app: true,
    email: false,
  };
}

export const INACTIVE_TEXT: AutoText = {
  title: 'Nous avons gardé votre place',
  body: 'Vos discussions, vos fichiers et vos agents vous attendent dans Baarali, tels que vous les avez laissés.\n\nReprenez quand vous voulez : une question suffit.',
  button: 'Ouvrir Baarali',
  target: 'chat',
  app: false,
  email: true,
};

export const WELCOME_TEXT: AutoText = {
  title: 'Bienvenue sur Baarali',
  body: 'Votre espace est prêt. Posez une question, déposez un fichier ou demandez une image : Baarali s’en occupe.\n\nVos messages de Baarali arrivent ici, dans la cloche.',
  button: 'Commencer',
  target: 'chat',
  app: true,
  email: true,
};

export class AutoMessages {
  private cached: { at: number; value: Record<AutoKind, boolean> } | null = null;
  private lastSweep = 0;

  constructor(private readonly deps: DispatchDeps) {}

  async settings(): Promise<Record<AutoKind, boolean>> {
    const now = this.deps.now();
    if (this.cached && now - this.cached.at < SETTINGS_TTL_MS) return this.cached.value;
    const value = { ...AUTO_DEFAULTS, ...(await this.deps.store.autoMessageSettings()) };
    this.cached = { at: now, value };
    return value;
  }

  async set(kind: AutoKind, enabled: boolean): Promise<void> {
    await this.deps.store.setAutoMessage(kind, enabled, this.deps.now());
    this.cached = null;
  }

  /** Sends one message to one person, unless switched off or already sent for this period. */
  async send(kind: AutoKind, account: Account, period: string, text: AutoText): Promise<boolean> {
    if (account.suspendedAt || !(await this.settings())[kind]) return false;
    const mailable = Boolean(text.email && this.deps.mailer && this.deps.links && account.email && !account.emailOptOutAt);
    if (!text.app && !mailable) return false;
    const now = this.deps.now();
    if (!(await this.deps.store.claimAutoMessage(kind, account.id, period, now))) return false;
    const notice: Notice = {
      id: randomUUID(),
      ...text,
      link: null,
      audience: 'account',
      accountId: account.id,
      email: mailable,
      sendAt: now,
      createdAt: now,
      createdBy: `${AUTO_AUTHOR}${kind}`,
      sentAt: null,
      cancelledAt: null,
      test: false,
    };
    await this.deps.store.saveNotification(notice);
    await this.deps.store.claimNotification(notice.id, now);
    await this.deps.store.deliverNotification(notice.id, [account.id], now);
    if (mailable) {
      const { accepted } = await this.deps.mailer!.send([noticeEmail(notice, account.email!, this.deps.links!, account.id)]);
      if (accepted.length) await this.deps.store.markEmailed(notice.id, [account.id], this.deps.now());
    }
    return true;
  }

  /** The proxy refused a call: once per session or week, the person learns when it comes back. */
  limitReached(account: Account, window: QuotaWindow, resetsAt: number): Promise<boolean> {
    return this.send('limit', account, `${window}:${resetsAt}`, limitText(window, resetsAt - this.deps.now()));
  }

  /** After a media charge: below MEDIA_LOW, once a week at most. */
  mediaSpent(account: Account, balance: number): Promise<boolean> {
    if (balance >= MEDIA_LOW) return Promise.resolve(false);
    return this.send('media_low', account, `week:${Math.floor(this.deps.now() / WEEK_MS)}`, mediaLowText(balance));
  }

  /** Welcome and the inactive: read from the account list, once an hour at most. */
  async sweep(force = false): Promise<void> {
    const now = this.deps.now();
    if (!force && now - this.lastSweep < SWEEP_MS) return;
    this.lastSweep = now;
    const on = await this.settings();
    if (!on.welcome && !on.inactive) return;
    for (const s of await this.deps.store.listAccounts(now)) {
      if (on.welcome && s.account.createdAt > now - WELCOME_WINDOW_MS) {
        await this.send('welcome', s.account, 'once', WELCOME_TEXT);
      } else if (on.inactive && (s.lastActiveAt ?? s.account.createdAt) < now - INACTIVE_MS) {
        await this.send('inactive', s.account, 'once', INACTIVE_TEXT);
      }
    }
  }
}
