import { useEffect, useSyncExternalStore } from 'react'
import type { Notice, NoticeEventKind } from '@x/shared/dist/billing.js'

// The bell's messages (Baarali, 07/10/2026), written in the admin console.
// One shared state for every bell; read again every 5 minutes, when the
// window comes back, and when the bell opens. Main shows new ones on the
// Mac's screen (main baarali-notifications.ts).

const REFRESH_MS = 5 * 60_000

/** A click on a message's notification on the Mac's screen opens the bell (main baarali-notifications.ts). */
export const NOTIFICATIONS_LINK = 'rowboat://baarali/notifications'
export const OPEN_NOTIFICATIONS_EVENT = 'baarali:open-notifications'

export interface NoticeState {
  list: Notice[]
  unread: number
}

const EMPTY: NoticeState = { list: [], unread: 0 }
let current: NoticeState = EMPTY
let loading: Promise<void> | null = null
let lastLoad = 0
const listeners = new Set<() => void>()

function publish(next: NoticeState): void {
  current = next
  for (const l of listeners) l()
}

async function load(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const inbox = await window.ipc.invoke('billing:getNotifications', null)
      lastLoad = Date.now()
      if (inbox) publish({ list: inbox.data, unread: inbox.unread })
    } catch {
      // The API cannot be reached: the bell keeps what it had.
    } finally {
      loading = null
    }
  })()
  return loading
}

/** Read again, unless it was read moments ago. */
export function refreshNotifications(force = false): Promise<void> {
  if (!force && Date.now() - lastLoad < 30_000) return Promise.resolve()
  return load()
}

/** Read (opened in the list) or followed: marked here at once, counted by the server. */
export function noticeEvent(id: string, kind: NoticeEventKind): void {
  const n = current.list.find((x) => x.id === id)
  if (n && !n.read) {
    publish({ list: current.list.map((x) => (x.id === id ? { ...x, read: true } : x)), unread: Math.max(0, current.unread - 1) })
  }
  void window.ipc.invoke('billing:notificationEvent', { id, kind }).catch(() => {})
}

export function readAllNotifications(): void {
  if (current.unread === 0) return
  publish({ list: current.list.map((x) => ({ ...x, read: true })), unread: 0 })
  void window.ipc.invoke('billing:readAllNotifications', null).catch(() => {})
}

/** Whether a rowboat:// URL is the one that opens the bell. */
export const isNotificationsLink = (url: string) => url.replace(/\/+$/, '') === NOTIFICATIONS_LINK

export function useNotifications(): NoticeState {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  useEffect(() => {
    void refreshNotifications(true)
    const timer = window.setInterval(() => void refreshNotifications(true), REFRESH_MS)
    const onFocus = () => void refreshNotifications()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return value
}

/** Test-only: forget everything. */
export function __resetNotificationsForTests(): void {
  current = EMPTY
  loading = null
  lastLoad = 0
  listeners.clear()
}
