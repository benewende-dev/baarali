import { getNotifications } from "@x/core/dist/billing/billing.js";
import { freshNotices } from "@x/core/dist/billing/fresh-notices.js";
import { notifyIfEnabled } from "@x/core/dist/application/notification/notifier.js";

// The admin console's messages on the Mac's screen (Baarali, 07/10/2026): the
// bell in the sidebar lists them; this shows each new one as a notification
// while the app runs, even with its window closed. Clicking one opens the
// bell (renderer App.tsx). Messages sent while the app was not running wait
// in the bell: reopening never replays a flood.

/** Opens the bell in the renderer. */
export const NOTIFICATIONS_LINK = "rowboat://baarali/notifications";

const POLL_MS = 5 * 60_000;
const FIRST_POLL_MS = 30_000;

export function startBaaraliNotifications(launchedAt: number): void {
    let since = launchedAt;
    const poll = async () => {
        const inbox = await getNotifications();
        if (!inbox) return;
        const fresh = freshNotices(inbox.data, since);
        for (const n of inbox.data) since = Math.max(since, Date.parse(n.sentAt));
        for (const n of fresh) {
            void notifyIfEnabled("baarali_news", { title: n.title, message: n.body, link: NOTIFICATIONS_LINK, actionLabel: n.button ?? undefined });
        }
    };
    setTimeout(() => {
        void poll();
        setInterval(() => void poll(), POLL_MS).unref();
    }, FIRST_POLL_MS).unref();
}
