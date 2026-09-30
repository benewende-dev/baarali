import { CREDITS_PER_DOLLAR } from '@x/shared/dist/billing.js';

// From a plan's price to its model budget, with a guaranteed margin
// (architecture §3.5 "Les forfaits", decided 30/09/2026). The prices and the
// assumptions are data (catalog.ts); this file only computes, so a price or
// a fee changes without touching the rule.

/** ISO 4217 amount in minor units, never a float (mission §26, architecture §3.8). */
export interface Money {
  amount: number;
  currency: string;
}

/** Digits after the decimal point, per ISO 4217. The CFA francs have none. */
const MINOR_DIGITS: Record<string, number> = { EUR: 2, USD: 2, XOF: 0, XAF: 0 };

export function minorDigits(currency: string): number {
  const digits = MINOR_DIGITS[currency];
  if (digits === undefined) throw new Error(`Unknown currency ${currency}: add its ISO 4217 digits`);
  return digits;
}

export function toMajor(money: Money): number {
  return money.amount / 10 ** minorDigits(money.currency);
}

export interface PricingAssumptions {
  /** Market rate, dollars for one major unit, with its source and date. */
  usdPerUnit: Record<string, number>;
  /** Share of a non-dollar price lost if the rate turns against us. */
  fxBufferRate: number;
  /** Worst payment rail fee (card or mobile money), as a share of the price. */
  paymentFeeRate: number;
  /** OpenRouter's fee when buying credits: every model dollar costs this much more. */
  providerFeeRate: number;
  /** What must remain after model costs, as a share of net revenue. */
  minMarginRate: number;
}

export interface Offer {
  id: string;
  category: 'free' | 'starter' | 'pro';
  displayName: string;
  /** One fixed price per currency, excluding taxes, set by the owner. */
  monthlyPrices: Money[];
}

/** Revenue we keep from one monthly payment, in dollars, after fees and the FX buffer. */
export function netUsd(price: Money, a: PricingAssumptions): number {
  const rate = a.usdPerUnit[price.currency];
  if (rate === undefined) throw new Error(`No rate for ${price.currency}`);
  const fx = price.currency === 'USD' ? 1 : 1 - a.fxBufferRate;
  return toMajor(price) * rate * fx * (1 - a.paymentFeeRate);
}

/**
 * Model budget per month, in dollars of OpenRouter usage. Taken from the
 * least favorable currency, so every currency keeps the margin.
 */
export function monthlyModelBudgetUsd(offer: Offer, a: PricingAssumptions): number {
  if (offer.monthlyPrices.length === 0) throw new Error(`Offer ${offer.id} has no price`);
  const worstNet = Math.min(...offer.monthlyPrices.map((p) => netUsd(p, a)));
  return (worstNet * (1 - a.minMarginRate)) / (1 + a.providerFeeRate);
}

/** 52 weeks share 12 months: a full week of usage every week stays inside the month. */
export const WEEKS_PER_MONTH = 52 / 12;

export function weekCredits(offer: Offer, a: PricingAssumptions): number {
  return Math.floor((monthlyModelBudgetUsd(offer, a) / WEEKS_PER_MONTH) * CREDITS_PER_DOLLAR);
}

/** Margin left on one price when the quota is used to the last credit every week. */
export function marginAtFullUsage(price: Money, offer: Offer, a: PricingAssumptions): number {
  const net = netUsd(price, a);
  const modelCost = (weekCredits(offer, a) / CREDITS_PER_DOLLAR) * WEEKS_PER_MONTH * (1 + a.providerFeeRate);
  return (net - modelCost) / net;
}

/** The plans the control plane serves: each offer with its computed week budget. */
export function plansFrom(offers: Offer[], a: PricingAssumptions) {
  return offers.map((offer) => ({
    id: offer.id,
    category: offer.category,
    displayName: offer.displayName,
    weekCredits: weekCredits(offer, a),
    monthlyPrices: offer.monthlyPrices,
  }));
}
