import type { Notice } from '@x/shared/dist/billing.js';

/** More at once is a flood: the rest wait in the bell. */
const MAX_AT_ONCE = 3;

/**
 * The console's messages to show on the Mac's screen (Baarali, 07/10/2026):
 * unread, sent after `since`, oldest first, the newest three at most.
 */
export function freshNotices(list: Notice[], since: number): Notice[] {
    return list
        .filter((n) => !n.read && Date.parse(n.sentAt) > since)
        .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
        .slice(-MAX_AT_ONCE);
}
