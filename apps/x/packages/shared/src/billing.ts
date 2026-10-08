import { z } from 'zod';

// Mirrors the backend's shared billing constant — credits are denominated so
// that 100M credits == $1 of usage.
export const CREDITS_PER_DOLLAR = 100_000_000;

export const BillingPlanCategorySchema = z.enum(['free', 'starter', 'pro']);
export type BillingPlanCategory = z.infer<typeof BillingPlanCategorySchema>;

export const BillingPlanIdSchema = z.string().min(1);
export type BillingPlanId = z.infer<typeof BillingPlanIdSchema>;

export const BillingCatalogPlanSchema = z.object({
  id: BillingPlanIdSchema,
  category: BillingPlanCategorySchema,
  displayName: z.string(),
  monthlyCredits: z.number(),
  dailyCredits: z.number(),
  monthlyPriceCents: z.number().nullable(),
  archived: z.boolean().optional(),
});
export type BillingCatalogPlan = z.infer<typeof BillingCatalogPlanSchema>;

export const BillingCatalogSchema = z.object({
  plans: z.array(BillingCatalogPlanSchema),
});
export type BillingCatalog = z.infer<typeof BillingCatalogSchema>;

export const BillingUsageBucketSchema = z.object({
  sanctionedCredits: z.number(),
  usedCredits: z.number(),
  availableCredits: z.number(),
  // When this window starts over (ISO). Baarali (02/10/2026): absent when
  // the window is not running yet — a session opens with its first message.
  resetsAt: z.string().optional(),
});
export type BillingUsageBucket = z.infer<typeof BillingUsageBucketSchema>;

// Bonus/promotional credits granted outside the plan buckets (credit store).
// Not sanctioned per period, so it carries a plain balance instead of a quota.
export const BillingStoreBucketSchema = z.object({
  availableCredits: z.number(),
});
export type BillingStoreBucket = z.infer<typeof BillingStoreBucketSchema>;

export const BillingInfoSchema = z.object({
  userEmail: z.string().nullable(),
  userId: z.string().nullable(),
  // BAARALI(03/10/2026): the admin console, for an admin's account only.
  adminUrl: z.string().nullable().optional(),
  subscriptionPlanId: BillingPlanIdSchema.nullable(),
  subscriptionStatus: z.string().nullable(),
  trialExpiresAt: z.string().nullable(),
  catalog: BillingCatalogSchema,
  monthly: BillingUsageBucketSchema,
  daily: BillingUsageBucketSchema.extend({
    usageDay: z.string(),
  }),
  store: BillingStoreBucketSchema,
});
export type BillingInfo = z.infer<typeof BillingInfoSchema>;

export function getBillingPlanData(
  catalog: BillingCatalog,
  planId: string | null | undefined,
): BillingCatalogPlan | null {
  if (!planId) return null;
  return catalog.plans.find((plan) => plan.id === planId) ?? null;
}

// The plans as Baarali's pricing page shows them, for the app to show the
// same in its own window (Baarali, 02/10/2026: the account lives in the
// app, the site is a showcase). Served by the control plane at /v1/plans,
// already worded and priced in the person's language: the app displays.
export const PlanOfferLevelSchema = z.object({
  /** The catalog plan id (BillingCatalogPlan.id). */
  id: z.string(),
  /** Short name of the level, when a plan has several (Pro: "×5", "×10"). */
  label: z.string().nullable(),
  /** The price, written, in each currency; null for a free plan. */
  price: z.object({ xof: z.string(), eur: z.string() }).nullable(),
  /** "par semaine", "par mois", "pour toujours". */
  per: z.string(),
  /** A line under the price, or null. */
  note: z.string().nullable(),
});
export type PlanOfferLevel = z.infer<typeof PlanOfferLevelSchema>;

export const PlanOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string(),
  for: z.string(),
  plus: z.string(),
  points: z.array(z.string()),
  /** The plan the page sets apart. */
  featured: z.boolean(),
  free: z.boolean(),
  levels: z.array(PlanOfferLevelSchema).min(1),
});
export type PlanOffer = z.infer<typeof PlanOfferSchema>;

export const PlanOffersSchema = z.object({
  lang: z.enum(['fr', 'en']),
  lead: z.string(),
  /** What a paid plan's button says while payment is not open. */
  soon: z.string(),
  /** Taxes and payment, under the plans. */
  foot: z.string(),
  plans: z.array(PlanOfferSchema),
});
export type PlanOffers = z.infer<typeof PlanOffersSchema>;

// Media credits as the usage page shows them (Baarali, 03/10/2026): the
// balance, what it went to, the packs on sale and what each model costs,
// from the control plane's /v1/media routes. Null when it serves none.
export const MediaHistoryEntrySchema = z.object({
  at: z.string(),
  kind: z.enum(['topup', 'charge', 'refund']),
  credits: z.number(),
  /** image, video, speech, music; null for a top-up. */
  media: z.string().nullable(),
  model: z.string().nullable(),
});
export type MediaHistoryEntry = z.infer<typeof MediaHistoryEntrySchema>;

export const MediaPackSchema = z.object({
  id: z.string(),
  credits: z.number(),
  /** In minor units: cents for EUR, francs for XOF. */
  prices: z.array(z.object({ amount: z.number(), currency: z.string() })),
});
export type MediaPack = z.infer<typeof MediaPackSchema>;

export const MediaCreditsSchema = z.object({
  balance: z.number(),
  history: z.array(MediaHistoryEntrySchema),
  packs: z.array(MediaPackSchema),
  costs: z.array(z.object({ kind: z.string(), name: z.string(), credits: z.number() })),
});
export type MediaCredits = z.infer<typeof MediaCreditsSchema>;

// The banner at the top of the Chat (Baarali, 07/10/2026), written in the
// admin console; control GET /v1/announcement. Null: none for this account.
export const AnnouncementSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** The button's words; null: no button. */
  button: z.string().nullable(),
  target: z.enum(['none', 'plans', 'usage', 'voice', 'link']),
  /** An https address, with `target: 'link'` only. */
  link: z.string().nullable(),
  tone: z.enum(['info', 'important']),
  endsAt: z.string(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const AnnouncementEventKindSchema = z.enum(['view', 'click', 'dismiss']);
export type AnnouncementEventKind = z.infer<typeof AnnouncementEventKindSchema>;

// The admin console's messages for this person (control GET /v1/notifications,
// Baarali, 07/10/2026): the bell on the Mac, the inbox on the phone.
export const NoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  /** The button's words; null: the message itself leads to the target. */
  button: z.string().nullable(),
  target: z.enum(['none', 'chat', 'plans', 'usage', 'link']),
  /** An https address, with `target: 'link'` only. */
  link: z.string().nullable(),
  sentAt: z.string(),
  read: z.boolean(),
});
export type Notice = z.infer<typeof NoticeSchema>;

export const NoticeInboxSchema = z.object({ data: z.array(NoticeSchema), unread: z.number() });
export type NoticeInbox = z.infer<typeof NoticeInboxSchema>;

export const NoticeEventKindSchema = z.enum(['read', 'click']);
export type NoticeEventKind = z.infer<typeof NoticeEventKindSchema>;

// A creator's partner code, typed in the app soon after signing up (control
// GET /v1/codes/partner and POST /v1/codes/redeem, Baarali, 08/10/2026).
export const PartnerCodeStateSchema = z.object({
  /** Who recommended Baarali to this person; null: nobody yet. */
  partner: z.string().nullable(),
  /** Whether a code can still be typed: within the days after signing up. */
  canRedeem: z.boolean(),
  /** Until when, when it can. */
  until: z.string().nullable(),
  /** The plan a code brings this person, for how many days; null: none. */
  gift: z.object({ plan: z.string(), planId: z.string(), days: z.number() }).nullable(),
  /** The offered plan while it runs: the account shows its days. */
  running: z.object({ plan: z.string(), startsAt: z.string(), endsAt: z.string() }).nullable(),
});
export type PartnerCodeState = z.infer<typeof PartnerCodeStateSchema>;

/** A code checked as it is typed: whose it is, or why it would not take. */
export const PartnerCodeCheckSchema = z.union([
  z.object({ ok: z.literal(true), name: z.string(), network: z.string().nullable(), city: z.string().nullable() }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type PartnerCodeCheck = z.infer<typeof PartnerCodeCheckSchema>;

export const PartnerCodeResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    partner: z.string(),
    /** The plan offered with the code, and until when; null: none. */
    gift: z.object({ plan: z.string(), endsAt: z.string() }).nullable(),
  }),
  // The control plane's own words (unknown code, too late…), or ours when it cannot be reached.
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type PartnerCodeResult = z.infer<typeof PartnerCodeResultSchema>;
