// The partner programme (decided 07/10/2026, mockup validated the same day):
// creators and influencers of the sub-region share their link or their code;
// each person who signs up through it is theirs, and every payment that
// person makes in the next 12 months earns the partner a share. The share
// grows with the number of paying clients (base, silver, gold). Payable after
// a hold, by mobile money, once above a threshold. The person who came gets a
// gift: a plan offered for a few days.
//
// Everything here is pure: the store and the clock come in, decisions go out.

export const PARTNER_STATUSES = ['active', 'paused'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PAYOUT_METHODS = ['orange', 'wave', 'moov', 'mtn'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_WORDS: Record<PayoutMethod, string> = { orange: 'Orange Money', wave: 'Wave', moov: 'Moov Money', mtn: 'MTN MoMo' };

export interface Partner {
  id: string;
  name: string;
  /** Upper case letters and digits; the link is `?p=CODE`. */
  code: string;
  /** Where they speak: « TikTok », « YouTube »… */
  network: string | null;
  city: string | null;
  /** Their own Baarali account, which opens their partner space; null until linked. */
  accountId: string | null;
  /** Their email: a sign-in with it, proved, links their account (partner-routes.ts). */
  email: string | null;
  /** Paused: the link still works for the visitor, but earns nothing until checked. */
  status: PartnerStatus;
  createdAt: number;
  createdBy: string;
  payoutMethod: PayoutMethod | null;
  payoutNumber: string | null;
}

/** One person brought by a partner. Set once: the first partner keeps them. */
export interface Referral {
  accountId: string;
  partnerId: string;
  at: number;
  via: 'link' | 'code';
}

/** A plan offered for a time; the account goes back to `previousPlanId` at `endsAt`. */
export interface Gift {
  id: string;
  accountId: string;
  planId: string;
  previousPlanId: string;
  startsAt: number;
  endsAt: number;
  /** In words, for the console: « Partenaire AWATECH ». */
  reason: string;
  endedAt: number | null;
}

/** A partner's share of one payment. Its id is the payment's reference: counted once. */
export interface Commission {
  id: string;
  partnerId: string;
  accountId: string;
  paidAt: number;
  /** What the person paid, excluding taxes, in CFA francs. */
  amountXof: number;
  rate: number;
  commissionXof: number;
  payableAt: number;
  payoutId: string | null;
}

export interface Payout {
  id: string;
  partnerId: string;
  amountXof: number;
  method: PayoutMethod;
  number: string;
  /** The mobile money transaction number. */
  reference: string;
  at: number;
  by: string;
}

/** A creator who applied from the public page; the console accepts or sets it aside. */
export interface PartnerApplication {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  network: string;
  profile: string;
  /** xs < 5 000, s < 50 000, m < 500 000, l above (partner-page.ts). */
  audience: string;
  city: string | null;
  message: string | null;
  createdAt: number;
  status: 'new' | 'accepted' | 'declined';
  decidedAt: number | null;
  decidedBy: string | null;
}

export interface ProgramRules {
  baseRate: number;
  silverRate: number;
  /** Paying clients from which the silver rate applies. */
  silverFrom: number;
  goldRate: number;
  goldFrom: number;
  /** A person's payments count this many months after they signed up. */
  months: number;
  /** A commission becomes payable this long after the payment: refunds and fraud come first. */
  holdDays: number;
  payoutMinXof: number;
  /** The gift to the person who came; null: none. */
  giftPlanId: string | null;
  giftDays: number;
  /** How long the link remembers the visitor. */
  cookieDays: number;
}

export const DEFAULT_RULES: ProgramRules = {
  baseRate: 0.2,
  silverRate: 0.25,
  silverFrom: 10,
  goldRate: 0.3,
  goldFrom: 50,
  months: 12,
  holdDays: 30,
  payoutMinXof: 10_000,
  giftPlanId: 'essentiel',
  giftDays: 7,
  cookieDays: 60,
};

/**
 * Above this, a client who spends their whole quota costs more than they
 * bring: the plans keep 55 % of their price in the worst case (catalog.ts).
 */
export const MAX_RATE = 0.4;
/** A code typed in the app counts only this soon after signing up. */
export const REDEEM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const REF_COOKIE = 'baarali_ref';

/** CFA francs are pegged to the euro (catalog.ts). */
const CFA_PER_EUR = 655.957;

export type Tier = 'base' | 'silver' | 'gold';
export const TIER_WORDS: Record<Tier, string> = { base: 'Base', silver: 'Argent', gold: 'Or' };

export function tierOf(rules: ProgramRules, paying: number): Tier {
  if (paying >= rules.goldFrom) return 'gold';
  if (paying >= rules.silverFrom) return 'silver';
  return 'base';
}

export function rateOf(rules: ProgramRules, tier: Tier): number {
  return tier === 'gold' ? rules.goldRate : tier === 'silver' ? rules.silverRate : rules.baseRate;
}

/** « awa-tech » → « AWATECH »; null when nothing usable is left. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(code) ? code : null;
}

/** A payment's amount in CFA francs: minor units for the euro, francs for XOF and XAF. */
export function toXof(amount: number, currency: string): number | null {
  if (currency === 'XOF' || currency === 'XAF') return Math.round(amount);
  if (currency === 'EUR') return Math.round((amount / 100) * CFA_PER_EUR);
  return null;
}

export function addMonths(at: number, months: number): number {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

export interface PaymentFacts {
  /** The payment's own reference: a second notification of it earns nothing. */
  reference: string;
  accountId: string;
  /** Excluding taxes, in minor units for the euro. */
  amount: number;
  currency: string;
  at: number;
}

/**
 * The partner's share of one payment, or null when it earns nothing: no
 * partner, a paused one, their own payment, or past the months that count.
 * `paying`: the partner's paying clients before this payment.
 */
export function commissionFor(
  rules: ProgramRules,
  partner: Partner,
  referral: Referral,
  payment: PaymentFacts,
  paying: { count: number; includes: boolean },
): Commission | null {
  if (partner.status !== 'active' || partner.id !== referral.partnerId) return null;
  if (partner.accountId === payment.accountId) return null;
  if (payment.at < referral.at || payment.at >= addMonths(referral.at, rules.months)) return null;
  const amountXof = toXof(payment.amount, payment.currency);
  if (amountXof === null || amountXof <= 0) return null;
  const rate = rateOf(rules, tierOf(rules, paying.count + (paying.includes ? 0 : 1)));
  return {
    id: payment.reference,
    partnerId: partner.id,
    accountId: payment.accountId,
    paidAt: payment.at,
    amountXof,
    rate,
    commissionXof: Math.round(amountXof * rate),
    payableAt: payment.at + rules.holdDays * DAY_MS,
    payoutId: null,
  };
}

export type RulesResult = { ok: true; rules: ProgramRules } | { ok: false; message: string };

/** The console's form; rates come as percentages (20 for 20 %). */
export function parseRules(body: Record<string, unknown>, planIds: string[]): RulesResult {
  const num = (k: string) => (typeof body[k] === 'number' && Number.isFinite(body[k]) ? (body[k] as number) : NaN);
  const pct = (k: string) => num(k) / 100;
  const int = (k: string) => (Number.isInteger(num(k)) ? num(k) : NaN);
  const rules: ProgramRules = {
    baseRate: pct('basePct'),
    silverRate: pct('silverPct'),
    silverFrom: int('silverFrom'),
    goldRate: pct('goldPct'),
    goldFrom: int('goldFrom'),
    months: int('months'),
    holdDays: int('holdDays'),
    payoutMinXof: int('payoutMinXof'),
    giftPlanId: body.giftPlanId === null || body.giftPlanId === '' ? null : typeof body.giftPlanId === 'string' ? body.giftPlanId : '?',
    giftDays: int('giftDays'),
    cookieDays: int('cookieDays'),
  };
  const rates = [rules.baseRate, rules.silverRate, rules.goldRate];
  if (rates.some((r) => !(r > 0))) return { ok: false, message: 'Chaque commission doit être un pourcentage positif.' };
  if (rates.some((r) => r > MAX_RATE)) {
    return { ok: false, message: `${MAX_RATE * 100} % au plus : au-delà, un client qui consomme tout son quota coûte plus qu’il ne rapporte.` };
  }
  if (!(rules.baseRate <= rules.silverRate && rules.silverRate <= rules.goldRate)) return { ok: false, message: 'Les paliers montent : Base ≤ Argent ≤ Or.' };
  if (!(rules.silverFrom >= 1 && rules.silverFrom < rules.goldFrom)) return { ok: false, message: 'Le palier Or demande plus de clients que l’Argent.' };
  if (!(rules.months >= 1 && rules.months <= 36)) return { ok: false, message: 'La durée va de 1 à 36 mois.' };
  if (!(rules.holdDays >= 0 && rules.holdDays <= 90)) return { ok: false, message: 'Le délai va de 0 à 90 jours.' };
  if (!(rules.payoutMinXof >= 0)) return { ok: false, message: 'Le seuil de paiement est un montant en F CFA.' };
  if (!(rules.cookieDays >= 1 && rules.cookieDays <= 365)) return { ok: false, message: 'Le lien se souvient de 1 à 365 jours.' };
  if (rules.giftPlanId !== null) {
    if (!planIds.includes(rules.giftPlanId)) return { ok: false, message: 'Forfait offert inconnu.' };
    if (!(rules.giftDays >= 1 && rules.giftDays <= 30)) return { ok: false, message: 'Le forfait est offert de 1 à 30 jours.' };
  } else if (!Number.isInteger(rules.giftDays)) {
    rules.giftDays = DEFAULT_RULES.giftDays;
  }
  return { ok: true, rules };
}

/** `https://app.baarali.com` → `baarali.com`: the link is clicked on the site, the sign-up happens on the app. */
export function cookieDomain(publicUrl: string): string | null {
  const host = new URL(publicUrl).hostname;
  if (host === 'localhost' || /^[\d.]+$/.test(host)) return null;
  const labels = host.split('.');
  return labels.length > 2 ? labels.slice(1).join('.') : host;
}

export function refCookie(code: string, rules: ProgramRules, publicUrl: string): string {
  const domain = cookieDomain(publicUrl);
  const secure = publicUrl.startsWith('https:') ? '; Secure' : '';
  return `${REF_COOKIE}=${code}; Max-Age=${rules.cookieDays * 86_400}; Path=/; SameSite=Lax; HttpOnly${secure}${domain ? `; Domain=${domain}` : ''}`;
}

export function refFromCookie(header: string | null | undefined): string | null {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${REF_COOKIE}=([A-Za-z0-9]+)`));
  return match ? normalizeCode(match[1]) : null;
}

/** « 14 octobre », in UTC like the rest of the console. */
export function dayWords(at: number): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(at);
}
