import { getAccessToken } from '../auth/tokens.js';
import { API_URL } from '../config/env.js';
import { AnnouncementSchema, MediaCreditsSchema, NoticeInboxSchema, PartnerCodeStateSchema, PlanOffersSchema, type PartnerCodeCheck, type PartnerCodeResult, type PartnerCodeState, type Announcement, type AnnouncementEventKind, type BillingInfo, type BillingPlanId, type MediaCredits, type NoticeEventKind, type NoticeInbox, type PlanOffers } from '@x/shared/dist/billing.js';
import { getRowboatConfig } from '../config/rowboat.js';

export async function getBillingInfo(): Promise<BillingInfo> {
  const config = await getRowboatConfig();
  const accessToken = await getAccessToken();
  const response = await fetch(`${API_URL}/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Billing API failed: ${response.status}`);
  }
  const body = await response.json() as {
    user: {
      id: string;
      email: string;
    };
    // BAARALI(03/10/2026): sent for an admin's account only.
    admin?: { url?: unknown };
    billing: {
      planId: BillingPlanId | null;
      status: string | null;
      trialExpiresAt: string | null;
      usage: {
        monthly: {
          sanctionedCredits: number;
          usedCredits: number;
          availableCredits: number;
          resetsAt?: string;
        };
        daily: {
          sanctionedCredits: number;
          usedCredits: number;
          availableCredits: number;
          usageDay: string;
          resetsAt?: string;
        };
        // credit-store bucket; absent on API deployments that predate grants
        store?: {
          availableCredits: number;
        };
      };
    };
  };
  return {
    userEmail: body.user.email ?? null,
    userId: body.user.id ?? null,
    adminUrl: typeof body.admin?.url === 'string' ? body.admin.url : null,
    subscriptionPlanId: body.billing.planId,
    subscriptionStatus: body.billing.status,
    trialExpiresAt: body.billing.trialExpiresAt ?? null,
    catalog: config.billing,
    monthly: body.billing.usage.monthly,
    daily: body.billing.usage.daily,
    store: {
      availableCredits: body.billing.usage.store?.availableCredits ?? 0,
    },
  };
}

/**
 * The plans as Baarali's pricing page words them (control GET /v1/plans),
 * for the app's own window. Null when the API serves none (an upstream
 * deployment) or cannot be reached: the window says so.
 */
export async function getPlanOffers(lang: 'fr' | 'en'): Promise<PlanOffers | null> {
  try {
    const response = await fetch(`${API_URL}/v1/plans?lang=${lang}`);
    if (!response.ok) return null;
    return PlanOffersSchema.parse(await response.json());
  } catch {
    return null;
  }
}

/**
 * The media credits as the usage page shows them (control /v1/media/*,
 * Baarali, 03/10/2026). Null when the API serves none (an upstream
 * deployment) or cannot be reached: the page says so.
 */
export async function getMediaCredits(): Promise<MediaCredits | null> {
  try {
    const accessToken = await getAccessToken();
    const get = async (path: string) => {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json() as Promise<Record<string, unknown>>;
    };
    const [models, history, packs] = await Promise.all([get('/v1/media/models'), get('/v1/media/history'), get('/v1/media/packs')]);
    const costs = Array.isArray(models.data)
      ? (models.data as { kind: string; name: string; credits: number }[]).map(({ kind, name, credits }) => ({ kind, name, credits }))
      : [];
    return MediaCreditsSchema.parse({
      balance: models.balance,
      history: history.data,
      packs: packs.data,
      costs,
    });
  } catch {
    return null;
  }
}

/**
 * The banner at the top of the Chat (control GET /v1/announcement, Baarali,
 * 07/10/2026). Null when there is none, or the API serves none (an upstream
 * deployment) or cannot be reached: the Chat simply shows no banner.
 */
export async function getAnnouncement(): Promise<Announcement | null> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/announcement`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as { announcement?: unknown };
    return body.announcement ? AnnouncementSchema.parse(body.announcement) : null;
  } catch {
    return null;
  }
}

/** Seen, followed or closed: the control plane counts each person once per kind. Best effort. */
export async function sendAnnouncementEvent(id: string, kind: AnnouncementEventKind): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/announcement/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    if (!response.ok) return false;
    return ((await response.json()) as { counted?: unknown }).counted === true;
  } catch {
    // A lost count never bothers the person.
    return false;
  }
}

/**
 * The admin console's messages for this person (control GET
 * /v1/notifications, Baarali, 07/10/2026). Null when the API serves none (an
 * upstream deployment) or cannot be reached: the bell then stays quiet.
 */
export async function getNotifications(): Promise<NoticeInbox | null> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/notifications`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;
    return NoticeInboxSchema.parse(await response.json());
  } catch {
    return null;
  }
}

/** Read or followed: the control plane counts the first of each. Best effort. */
export async function sendNotificationEvent(id: string, kind: NoticeEventKind): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/notifications/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    if (!response.ok) return false;
    return ((await response.json()) as { counted?: unknown }).counted === true;
  } catch {
    return false;
  }
}

/**
 * Whether the app still offers the partner code field, and who recommended
 * Baarali once linked (control GET /v1/codes/partner, 08/10/2026). Null when
 * the API serves none or cannot be reached: the field then stays hidden.
 */
export async function getPartnerCode(): Promise<PartnerCodeState | null> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/codes/partner`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      partner?: unknown;
      can_redeem?: unknown;
      until?: unknown;
      gift?: { plan?: unknown; plan_id?: unknown; days?: unknown } | null;
      running?: { plan?: unknown; starts_at?: unknown; ends_at?: unknown } | null;
    };
    return PartnerCodeStateSchema.parse({
      partner: body.partner ?? null,
      canRedeem: body.can_redeem === true,
      until: body.until ?? null,
      gift: body.gift ? { plan: body.gift.plan, planId: body.gift.plan_id, days: body.gift.days } : null,
      running: body.running ? { plan: body.running.plan, startsAt: body.running.starts_at, endsAt: body.running.ends_at } : null,
    });
  } catch {
    return null;
  }
}

/** A code checked as it is typed (control GET /v1/codes/check): nothing is applied. */
export async function checkPartnerCode(code: string): Promise<PartnerCodeCheck> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/codes/check?code=${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = (await response.json().catch(() => ({}))) as {
      partner?: { name?: unknown; network?: unknown; city?: unknown };
      error?: { message?: unknown };
    };
    if (response.ok && typeof body.partner?.name === 'string') {
      const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
      return { ok: true, name: body.partner.name, network: text(body.partner.network), city: text(body.partner.city) };
    }
    return { ok: false, message: typeof body.error?.message === 'string' ? body.error.message : 'The code could not be checked. Try again in a moment.' };
  } catch {
    return { ok: false, message: 'The code could not be checked. Try again in a moment.' };
  }
}

/** A partner's code typed in the app: the control plane says why it is refused. */
export async function redeemPartnerCode(code: string): Promise<PartnerCodeResult> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/codes/redeem`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      partner?: unknown;
      gift?: { plan?: unknown; ends_at?: unknown } | null;
      error?: { message?: unknown };
    };
    if (!response.ok || typeof body.partner !== 'string') {
      const message = typeof body.error?.message === 'string' ? body.error.message : 'The code could not be checked. Try again in a moment.';
      return { ok: false, message };
    }
    const gift = body.gift && typeof body.gift.plan === 'string' && typeof body.gift.ends_at === 'string' ? { plan: body.gift.plan, endsAt: body.gift.ends_at } : null;
    return { ok: true, partner: body.partner, gift };
  } catch {
    return { ok: false, message: 'The code could not be checked. Try again in a moment.' };
  }
}

/** Everything in the bell marked read; how many were not. */
export async function readAllNotifications(): Promise<number> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_URL}/v1/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return 0;
    const changed = ((await response.json()) as { changed?: unknown }).changed;
    return typeof changed === 'number' ? changed : 0;
  } catch {
    return 0;
  }
}
