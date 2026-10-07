import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { RpcClient } from '@x/client';
import type { Announcement, AnnouncementEventKind, Notice, NoticeEventKind } from '@x/shared/dist/billing.js';

import { useConnection } from '@/lib/connection';

// What the admin console writes to people (Baarali, 07/10/2026): the banner
// at the top of the home tab and the inbox behind the bell. Read through the
// person's instance, like the Mac (server channels.ts billing:*); one shared
// state for every screen, read again when a screen shows and when the app
// comes back.

interface State {
  announcement: Announcement | null;
  notices: Notice[];
  unread: number;
}

let current: State = { announcement: null, notices: [], unread: 0 };
const listeners = new Set<() => void>();
let lastLoad = 0;
let loading: Promise<void> | null = null;
const sent = new Set<string>();

function publish(next: Partial<State>): void {
  current = { ...current, ...next };
  for (const l of listeners) l();
}

async function load(rpc: RpcClient, force: boolean): Promise<void> {
  if (loading) return loading;
  if (!force && Date.now() - lastLoad < 30_000) return;
  loading = (async () => {
    try {
      const [announcement, inbox] = await Promise.all([
        rpc.call('billing:getAnnouncement', null).catch(() => current.announcement),
        rpc.call('billing:getNotifications', null).catch(() => null),
      ]);
      lastLoad = Date.now();
      publish({ announcement, ...(inbox ? { notices: inbox.data, unread: inbox.unread } : {}) });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** The banner, the inbox and its unread count, kept fresh while a screen shows them. */
export function useConsoleMessages() {
  const { rpc } = useConnection();
  const state = useStore();
  useFocusEffect(useCallback(() => {
    if (rpc) void load(rpc, true);
  }, [rpc]));
  useEffect(() => {
    if (!rpc) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load(rpc, false);
    });
    return () => sub.remove();
  }, [rpc]);

  const announcementEvent = useCallback((id: string, kind: AnnouncementEventKind) => {
    const key = `${id}:${kind}`;
    if (!rpc || sent.has(key)) return;
    sent.add(key);
    void rpc.call('billing:announcementEvent', { id, kind }).catch(() => {});
  }, [rpc]);

  const dismissAnnouncement = useCallback((id: string) => {
    announcementEvent(id, 'dismiss');
    if (current.announcement?.id === id) publish({ announcement: null });
  }, [announcementEvent]);

  const noticeEvent = useCallback((id: string, kind: NoticeEventKind) => {
    const n = current.notices.find((x) => x.id === id);
    if (n && !n.read) publish({ notices: current.notices.map((x) => (x.id === id ? { ...x, read: true } : x)), unread: Math.max(0, current.unread - 1) });
    if (rpc) void rpc.call('billing:notificationEvent', { id, kind }).catch(() => {});
  }, [rpc]);

  const readAll = useCallback(() => {
    if (current.unread === 0) return;
    publish({ notices: current.notices.map((x) => ({ ...x, read: true })), unread: 0 });
    if (rpc) void rpc.call('billing:readAllNotifications', null).catch(() => {});
  }, [rpc]);

  // An announcement past its end leaves without waiting for the next read.
  const announcement = state.announcement && Date.parse(state.announcement.endsAt) > Date.now() ? state.announcement : null;
  return { announcement, notices: state.notices, unread: state.unread, announcementEvent, dismissAnnouncement, noticeEvent, readAll };
}
