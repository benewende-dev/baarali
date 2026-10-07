import { getAccessToken } from '../auth/tokens.js';
import { API_URL } from '../config/env.js';
import { AnnouncementSchema, MediaCreditsSchema, NoticeInboxSchema, PlanOffersSchema, type Announcement, type AnnouncementEventKind, type BillingInfo, type BillingPlanId, type MediaCredits, type NoticeEventKind, type NoticeInbox, type PlanOffers } from '@x/shared/dist/billing.js';
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
