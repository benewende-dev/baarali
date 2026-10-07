import { useEffect, useSyncExternalStore } from 'react'
import type { Announcement, AnnouncementEventKind } from '@x/shared/dist/billing.js'

// The banner at the top of the Chat (Baarali, 07/10/2026), written in the
// admin console. One shared state for every chat pane: closing it in one
// closes it everywhere. Read again every 10 minutes and when the window
// comes back, like the account's config (core config/rowboat.ts).

const REFRESH_MS = 10 * 60_000

/** The usage page lives in the sidebar's settings: the sidebar opens it on this event. */
export const OPEN_USAGE_EVENT = 'baarali:open-usage'

let current: Announcement | null = null
let loading: Promise<void> | null = null
let lastLoad = 0
const listeners = new Set<() => void>()
// Sent once per banner and kind in this window; the server counts once per person anyway.
const sent = new Set<string>()

function publish(next: Announcement | null): void {
  current = next
  for (const l of listeners) l()
}

async function load(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const next = await window.ipc.invoke('billing:getAnnouncement', null)
      lastLoad = Date.now()
      publish(next)
    } catch {
      // No banner is a fine answer when the API cannot be reached.
    } finally {
      loading = null
    }
  })()
  return loading
}

/** Read again, unless it was read moments ago. */
export function refreshAnnouncement(force = false): Promise<void> {
  if (!force && Date.now() - lastLoad < 30_000) return Promise.resolve()
  return load()
}

export function announcementEvent(id: string, kind: AnnouncementEventKind): void {
  const key = `${id}:${kind}`
  if (sent.has(key)) return
  sent.add(key)
  void window.ipc.invoke('billing:announcementEvent', { id, kind }).catch(() => {})
}

/** Closed: gone at once on every pane, and for good on the account. */
export function dismissAnnouncement(id: string): void {
  announcementEvent(id, 'dismiss')
  if (current?.id === id) publish(null)
}

/** The banner to show now, kept fresh while a chat is on screen. */
export function useAnnouncement(): Announcement | null {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  useEffect(() => {
    void refreshAnnouncement(true)
    const timer = window.setInterval(() => void refreshAnnouncement(true), REFRESH_MS)
    const onFocus = () => void refreshAnnouncement()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  // An announcement past its end leaves without waiting for the next read.
  return value && Date.parse(value.endsAt) > Date.now() ? value : null
}

/** Test-only: forget everything. */
export function __resetAnnouncementForTests(): void {
  current = null
  loading = null
  lastLoad = 0
  sent.clear()
  listeners.clear()
}
