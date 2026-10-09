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

export function useSidebarRows(): sidebarLayout.SidebarRow[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => rows,
  )
}
