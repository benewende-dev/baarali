import { useSyncExternalStore } from 'react'
import { sidebarLayout } from '@x/shared'

// Baarali (09/10/2026): the sidebar's layout as the admin console published
// it. Without one yet, or offline, the founder's order (DEFAULT_SIDEBAR_LAYOUT);
// the last one received is kept for the next launch.

export type SidebarPage = sidebarLayout.SidebarPage
type Layout = sidebarLayout.SidebarLayout

const KEY = 'baarali.sidebarLayout'
const listeners = new Set<() => void>()

function stored(): Layout | null {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? sidebarLayout.SidebarLayoutSchema.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data : null
  } catch {
    return null
  }
}

let published: Layout | null = stored()
let rows = sidebarLayout.sidebarRows(published)

/** A layout from the control plane; null when none is published. */
export function setPublishedSidebarLayout(layout: Layout | null): void {
  if (JSON.stringify(layout) === JSON.stringify(published)) return
  published = layout
  rows = sidebarLayout.sidebarRows(layout)
  try {
    if (layout) localStorage.setItem(KEY, JSON.stringify(layout))
    else localStorage.removeItem(KEY)
  } catch {
    // Private storage refused: the layout still applies for this session.
  }
  for (const l of listeners) l()
}

/** Read again every 10 minutes and when the window comes back, like the announcements. */
const REFRESH_MS = 10 * 60_000
let syncing = false
let lastLoad = 0

async function loadPublished(): Promise<void> {
  try {
    const answer = await window.ipc.invoke('billing:getSidebarLayout', null)
    lastLoad = Date.now()
    // null: the API could not be reached; the last layout known stays.
    if (answer) setPublishedSidebarLayout(answer.layout)
  } catch {
    // Same: offline, the sidebar keeps its last layout.
  }
}

function startSync(): void {
  if (syncing || typeof window === 'undefined' || !window.ipc) return
  syncing = true
  void loadPublished()
  setInterval(() => void loadPublished(), REFRESH_MS)
  window.addEventListener('focus', () => {
    if (Date.now() - lastLoad > 30_000) void loadPublished()
  })
}

export function useSidebarRows(): sidebarLayout.SidebarRow[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); startSync(); return () => listeners.delete(l) },
    () => rows,
  )
}
