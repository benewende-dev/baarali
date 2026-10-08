import { randomUUID } from 'node:crypto';
import type { AutoMessages } from './auto-messages.js';
import {
  commissionFor,
  DAY_MS,
  DEFAULT_RULES,
  normalizeCode,
  rateOf,
  REDEEM_WINDOW_MS,
  tierOf,
  type Commission,
  type Gift,
  type Partner,
  type PaymentFacts,
  type Payout,
  type PayoutMethod,
  type ProgramRules,
  type Tier,
} from './partners.js';
import type { Account, ControlStore } from './store.js';

// The partner programme at work (partners.ts holds its rules): a click on a
// link, a person signing up through it or typing its code, the plan offered
// to them and its end, each payment's commission and its payout.

export interface ProgramDeps {
  store: ControlStore;
  now: () => number;
  /** Tells the person their offered plan ends; unset: nothing is sent. */
  auto?: AutoMessages;
}

/** A partner as the console and their own space see them. */
export interface PartnerSummary {
  partner: Partner;
  clicks: number;
  signups: number;
  paying: number;
  tier: Tier;
  rate: number;
  /** Earned, past the hold, not paid. */
  payableXof: number;
  /** Earned, still in the hold. */
  pendingXof: number;
  paidXof: number;
  /** The commissions `payableXof` adds up, for the payout. */
  payableIds: string[];
}

export type AttachResult =
  | { ok: true; partner: Partner; gift: Gift | null }
  | { ok: false; reason: 'unknown' | 'paused' | 'own' | 'already' | 'late' };

/** Before the gift ends, the person is told: this long before. */
export const GIFT_NOTICE_MS = 3 * DAY_MS;
const GIFT_SWEEP_MS = 5 * 60_000;

export class PartnerProgram {
  private lastSweep = 0;

  constructor(private readonly deps: ProgramDeps) {}

  async rules(): Promise<ProgramRules> {
    return (await this.deps.store.programRules()) ?? DEFAULT_RULES;
  }

  /** A click on `?p=CODE`: counted, and the partner returned so the site sets its cookie. */
  async click(rawCode: unknown): Promise<Partner | null> {
    const code = normalizeCode(rawCode);
    const partner = code ? await this.deps.store.partnerByCode(code) : null;
    if (!partner) return null;
    await this.deps.store.countPartnerClick(partner.id, new Date(this.deps.now()).toISOString().slice(0, 10));
    return partner;
  }

  /** A person signs up with the link's cookie, or types a code soon after. */
  async attach(account: Account, rawCode: unknown, via: 'link' | 'code'): Promise<AttachResult> {
    const now = this.deps.now();
    const code = normalizeCode(rawCode);
    const partner = code ? await this.deps.store.partnerByCode(code) : null;
    if (!partner) return { ok: false, reason: 'unknown' };
    if (partner.status !== 'active') return { ok: false, reason: 'paused' };
    if (partner.accountId === account.id) return { ok: false, reason: 'own' };
    if (via === 'code' && now - account.createdAt > REDEEM_WINDOW_MS) return { ok: false, reason: 'late' };
    if (!(await this.deps.store.addReferral({ accountId: account.id, partnerId: partner.id, at: now, via }))) return { ok: false, reason: 'already' };
    return { ok: true, partner, gift: await this.offer(account, partner) };
  }

  /** The gift goes to someone on the free plan only: a paying client keeps what they pay for. */
  private async offer(account: Account, partner: Partner): Promise<Gift | null> {
    const rules = await this.rules();
    if (!rules.giftPlanId) return null;
    const [current, gifted] = await Promise.all([this.deps.store.plan(account.planId), this.deps.store.plan(rules.giftPlanId)]);
    if (!gifted || (current && current.category !== 'free')) return null;
    const now = this.deps.now();
    const gift: Gift = {
      id: `gft_${randomUUID()}`,
      accountId: account.id,
      planId: gifted.id,
      previousPlanId: account.planId,
      startsAt: now,
      endsAt: now + rules.giftDays * DAY_MS,
      reason: `Partenaire ${partner.code}`,
      endedAt: null,
    };
    await this.deps.store.addGift(gift);
    await this.deps.store.setPlan(account.id, gifted.id);
    return gift;
  }

  async openGiftOf(accountId: string): Promise<Gift | null> {
    return (await this.deps.store.openGifts()).find((g) => g.accountId === accountId) ?? null;
  }

  /**
   * Ends what is due: the account goes back to its plan, unless the plan was
   * changed meanwhile (a payment, the console), which then stands. Three days
   * before, the person is told.
   */
  async sweep(force = false): Promise<void> {
    const now = this.deps.now();
    if (!force && now - this.lastSweep < GIFT_SWEEP_MS) return;
    this.lastSweep = now;
    for (const gift of await this.deps.store.openGifts()) {
      const account = await this.deps.store.account(gift.accountId);
      if (gift.endsAt <= now) {
        if (!(await this.deps.store.endGift(gift.id, now))) continue;
        if (account?.planId === gift.planId) await this.deps.store.setPlan(gift.accountId, gift.previousPlanId);
      } else if (gift.endsAt - now <= GIFT_NOTICE_MS && account?.planId === gift.planId && this.deps.auto) {
        const [plan, back] = await Promise.all([this.deps.store.plan(gift.planId), this.deps.store.plan(gift.previousPlanId)]);
        await this.deps.auto.giftEnding(account, gift, plan?.displayName ?? gift.planId, back?.displayName ?? gift.previousPlanId);
      }
    }
  }

  /**
   * A payment came in: the partner who brought the person earns their share.
   * Called by the payment notification once payments open; a payment
   * notified twice earns once.
   */
  async payment(facts: PaymentFacts): Promise<Commission | null> {
    const referral = await this.deps.store.referralOf(facts.accountId);
    if (!referral) return null;
    const partner = (await this.deps.store.partners()).find((p) => p.id === referral.partnerId);
    if (!partner) return null;
    const earned = await this.deps.store.commissions(partner.id);
    const clients = new Set(earned.map((c) => c.accountId));
    const commission = commissionFor(await this.rules(), partner, referral, facts, { count: clients.size, includes: clients.has(facts.accountId) });
    if (!commission) return null;
    return (await this.deps.store.addCommission(commission)) ? commission : null;
  }

  async summaries(): Promise<PartnerSummary[]> {
    const now = this.deps.now();
    const [rules, partners, figures, commissions] = await Promise.all([
      this.rules(),
      this.deps.store.partners(),
      this.deps.store.partnerFigures(),
      this.deps.store.commissions(),
    ]);
    return partners.map((partner) => {
      const own = commissions.filter((c) => c.partnerId === partner.id);
      const paying = new Set(own.map((c) => c.accountId)).size;
      const tier = tierOf(rules, paying);
      const payable = own.filter((c) => c.payoutId === null && c.payableAt <= now);
      const sum = (list: Commission[]) => list.reduce((s, c) => s + c.commissionXof, 0);
      return {
        partner,
        clicks: figures[partner.id]?.clicks ?? 0,
        signups: figures[partner.id]?.signups ?? 0,
        paying,
        tier,
        rate: rateOf(rules, tier),
        payableXof: sum(payable),
        pendingXof: sum(own.filter((c) => c.payoutId === null && c.payableAt > now)),
        paidXof: sum(own.filter((c) => c.payoutId !== null)),
        payableIds: payable.map((c) => c.id),
      };
    });
  }

  /**
   * Pays what is payable to the number the partner gave. Refused under the
   * threshold, without a number, or when nothing is due.
   */
  async payout(partnerId: string, reference: string, by: string): Promise<{ ok: true; payout: Payout } | { ok: false; message: string }> {
    const rules = await this.rules();
    const summary = (await this.summaries()).find((s) => s.partner.id === partnerId);
    if (!summary) return { ok: false, message: 'Partenaire introuvable.' };
    const { partner } = summary;
    if (!partner.payoutMethod || !partner.payoutNumber) return { ok: false, message: 'Ce partenaire n’a pas encore donné son numéro de mobile money.' };
    if (summary.payableXof <= 0) return { ok: false, message: 'Rien à payer pour l’instant.' };
    if (summary.payableXof < rules.payoutMinXof) return { ok: false, message: `Sous le seuil de ${rules.payoutMinXof} F CFA.` };
    const ref = reference.trim();
    if (!ref || ref.length > 64) return { ok: false, message: 'Le numéro de transaction du mobile money est attendu.' };
    const payout: Payout = {
      id: `pay_${randomUUID()}`,
      partnerId,
      amountXof: summary.payableXof,
      method: partner.payoutMethod as PayoutMethod,
      number: partner.payoutNumber,
      reference: ref,
      at: this.deps.now(),
      by,
    };
    const paid = await this.deps.store.payCommissions(payout, summary.payableIds);
    return paid ? { ok: true, payout } : { ok: false, message: 'Déjà payé.' };
  }
}
