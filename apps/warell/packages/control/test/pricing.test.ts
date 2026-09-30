import { describe, expect, it } from 'vitest';
import { CREDITS_PER_DOLLAR } from '@x/shared/dist/billing.js';
import { ASSUMPTIONS, OFFERS } from '../src/catalog.js';
import {
  WEEKS_PER_MONTH,
  marginAtFullUsage,
  monthlyModelBudgetUsd,
  netUsd,
  weekCredits,
  type Offer,
} from '../src/pricing.js';

// The guarantee decided on 30/09/2026 (architecture §3.5): whatever the plan
// and the currency, a person who uses the quota to the last credit every
// week still leaves at least 55 % of net revenue after model costs.
describe('plan catalog guarantee', () => {
  for (const offer of OFFERS) {
    for (const price of offer.monthlyPrices) {
      it(`${offer.id} in ${price.currency} keeps at least 55 % at full usage`, () => {
        expect(marginAtFullUsage(price, offer, ASSUMPTIONS)).toBeGreaterThanOrEqual(ASSUMPTIONS.minMarginRate - 1e-9);
      });
    }
  }

  it('prices every offer in the same currencies', () => {
    const currencies = OFFERS.map((o) => o.monthlyPrices.map((p) => p.currency).sort().join(','));
    expect(new Set(currencies).size).toBe(1);
  });

  it('gives a pricier plan a larger budget', () => {
    const [low, high] = [...OFFERS].sort((a, b) => weekCredits(a, ASSUMPTIONS) - weekCredits(b, ASSUMPTIONS));
    expect(netUsd(high.monthlyPrices[0], ASSUMPTIONS)).toBeGreaterThan(netUsd(low.monthlyPrices[0], ASSUMPTIONS));
  });
});

describe('pricing arithmetic', () => {
  const a = { ...ASSUMPTIONS, usdPerUnit: { USD: 1, EUR: 1.2 } };
  const offer: Offer = { id: 'x', category: 'starter', displayName: 'X', monthlyPrices: [
    { amount: 10000, currency: 'USD' },
    { amount: 10000, currency: 'EUR' },
  ] };

  it('applies the payment fee to every price and the FX buffer to non-dollar prices', () => {
    expect(netUsd({ amount: 10000, currency: 'USD' }, a)).toBeCloseTo(100 * 0.95);
    expect(netUsd({ amount: 10000, currency: 'EUR' }, a)).toBeCloseTo(100 * 1.2 * 0.95 * 0.95);
  });

  it('reads CFA francs without minor units', () => {
    const cfa = { ...ASSUMPTIONS, usdPerUnit: { XOF: 0.002 } };
    expect(netUsd({ amount: 32000, currency: 'XOF' }, cfa)).toBeCloseTo(32000 * 0.002 * 0.95 * 0.95);
  });

  it('takes the budget from the least favorable currency, net of the OpenRouter fee', () => {
    expect(monthlyModelBudgetUsd(offer, a)).toBeCloseTo((95 * 0.45) / 1.055);
  });

  it('spreads the month over 52/12 weeks', () => {
    expect(weekCredits(offer, a)).toBe(Math.floor(((95 * 0.45) / 1.055 / WEEKS_PER_MONTH) * CREDITS_PER_DOLLAR));
  });

  it('refuses an unknown currency instead of guessing', () => {
    expect(() => netUsd({ amount: 100, currency: 'NGN' }, a)).toThrow(/NGN/);
  });
});
