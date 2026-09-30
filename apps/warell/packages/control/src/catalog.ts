import type { Offer, PricingAssumptions } from './pricing.js';

// The plans and what their budget rests on (architecture §3.5 "Les
// forfaits", decided 30/09/2026). Prices are the owner's; each one is fixed
// per currency, excluding taxes. Adding a currency = one price per offer and
// one rate below.

const EUR_USD = 1 / 0.88067; // ECB reference, 30/09/2026
const EUR_PER_CFA = 1 / 655.957; // fixed parity of XOF and XAF to the euro

export const ASSUMPTIONS: PricingAssumptions = {
  usdPerUnit: { USD: 1, EUR: EUR_USD, XOF: EUR_USD * EUR_PER_CFA, XAF: EUR_USD * EUR_PER_CFA },
  fxBufferRate: 0.05,
  // Reserve for the worst rail. To check against LigdiCash's written answer
  // on its fees (providers doc §8) before the first real payment.
  paymentFeeRate: 0.05,
  // OpenRouter charges 5.5 % on credit purchases.
  providerFeeRate: 0.055,
  minMarginRate: 0.55,
};

export const OFFERS: Offer[] = [
  {
    id: 'essentiel',
    category: 'starter',
    displayName: 'Essentiel',
    monthlyPrices: [
      { amount: 4900, currency: 'EUR' },
      { amount: 5500, currency: 'USD' },
      { amount: 32000, currency: 'XOF' },
      { amount: 32000, currency: 'XAF' },
    ],
  },
  {
    id: 'pro',
    category: 'pro',
    displayName: 'Pro',
    monthlyPrices: [
      { amount: 15000, currency: 'EUR' },
      { amount: 16900, currency: 'USD' },
      { amount: 98000, currency: 'XOF' },
      { amount: 98000, currency: 'XAF' },
    ],
  },
];
