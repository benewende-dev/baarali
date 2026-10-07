import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Announcement } from '@x/shared/dist/billing.js'
import { announcementEvent, dismissAnnouncement, OPEN_USAGE_EVENT, useAnnouncement } from '@/lib/announcement'
import { openPlans } from '@/lib/plans-window'
import { canToggleConversation, toggleConversation } from '@/lib/voice-conversation'
import { cn } from '@/lib/utils'

// The banner at the top of the Chat (Baarali, 07/10/2026; console mockup
// validated the same day). Its words come from the admin console, already in
// French: they are never run through the dictionary.

function follow(a: Announcement): void {
  announcementEvent(a.id, 'click')
  if (a.target === 'plans') openPlans()
  else if (a.target === 'usage') window.dispatchEvent(new CustomEvent(OPEN_USAGE_EVENT))
  else if (a.target === 'voice' && canToggleConversation()) toggleConversation('chat')
  // Main opens any window.open in the system browser; the server only sends https.
  else if (a.target === 'link' && a.link?.startsWith('https://')) window.open(a.link, '_blank', 'noopener')
}

export function AnnouncementBanner({ className }: { className?: string }) {
  const announcement = useAnnouncement()
  const id = announcement?.id
  useEffect(() => {
    if (id) announcementEvent(id, 'view')
  }, [id])
  if (!announcement) return null

  const important = announcement.tone === 'important'
  return (
    <div
      role="status"
      className={cn(
        'mx-auto flex w-full max-w-[820px] items-center gap-3 rounded-xl border px-3.5 py-2 text-[13px] text-foreground',
        important ? 'border-amber-500/50 bg-amber-500/10' : 'border-primary/40 bg-primary/10',
        className,
      )}
    >
      <span className="min-w-0 flex-1" data-no-translate>{announcement.text}</span>
      {announcement.button && announcement.target !== 'none' ? (
        <button
          type="button"
          onClick={() => follow(announcement)}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
          data-no-translate
        >
          {announcement.button}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Close"
        onClick={() => dismissAnnouncement(announcement.id)}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
