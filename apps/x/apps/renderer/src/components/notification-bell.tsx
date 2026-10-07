import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import type { Notice } from '@x/shared/dist/billing.js'
import { OPEN_USAGE_EVENT } from '@/lib/announcement'
import { noticeEvent, OPEN_NOTIFICATIONS_EVENT, readAllNotifications, refreshNotifications, useNotifications } from '@/lib/notifications'
import { openPlans } from '@/lib/plans-window'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// The bell (Baarali, 07/10/2026; console mockup validated the same day): the
// messages written in the admin console, newest first. Their words come from
// the console, already in French: they are never run through the dictionary.

const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function follow(n: Notice, onOpenChat?: () => void): void {
  noticeEvent(n.id, 'click')
  if (n.target === 'plans') openPlans()
  else if (n.target === 'usage') window.dispatchEvent(new CustomEvent(OPEN_USAGE_EVENT))
  else if (n.target === 'chat') onOpenChat?.()
  // Main opens any window.open in the system browser; the server only sends https.
  else if (n.target === 'link' && n.link?.startsWith('https://')) window.open(n.link, '_blank', 'noopener')
}

export function NotificationBell({ className, onOpenChat }: { className?: string; onOpenChat?: () => void }) {
  const { list, unread } = useNotifications()
  const [open, setOpen] = useState(false)

  // A click on the notification on the Mac's screen opens the bell.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
  }, [])
  useEffect(() => {
    if (open) void refreshNotifications(true)
  }, [open])

  // The message itself leads where it says when it has no button; else it is just read.
  const tap = (n: Notice) => {
    if (n.target !== 'none' && !n.button) {
      setOpen(false)
      follow(n, onOpenChat)
    } else noticeEvent(n.id, 'read')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className={cn('titlebar-no-drag relative rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground', className)}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground" data-no-translate>
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[13px] font-semibold">Notifications</span>
          {unread > 0 ? (
            <button type="button" onClick={() => readAllNotifications()} className="text-[12px] text-muted-foreground hover:text-foreground">
              Mark all as read
            </button>
          ) : null}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No notifications yet</p>
          ) : (
            list.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => tap(n)}
                onKeyDown={(e) => { if (e.key === 'Enter') tap(n) }}
                className={cn('flex cursor-default gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-foreground/[0.03]', !n.read && 'bg-primary/[0.05]')}
              >
                <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                <div className="min-w-0 flex-1" data-no-translate>
                  <div className="text-[13px] font-medium text-foreground">{n.title}</div>
                  <div className="whitespace-pre-line text-[12.5px] leading-snug text-muted-foreground">{n.body}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{when.format(new Date(n.sentAt))}</span>
                    {n.button && n.target !== 'none' ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setOpen(false); follow(n, onOpenChat) }}
                        className="ml-auto rounded-md bg-primary px-2 py-0.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        {n.button}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
