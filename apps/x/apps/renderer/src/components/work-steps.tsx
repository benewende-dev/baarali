import * as React from 'react'
import { ChevronRight, ShieldAlert } from 'lucide-react'
import { BaaraliMark } from '@/components/baarali-mark'
import { cn } from '@/lib/utils'
import { getToolRowSummary, isToolCall, type ConversationItem } from '@/lib/chat-conversation'
import type { WorkStep } from '@/lib/work-steps'

// BAARALI(09/10/2026): the agent's work, folded (mockup validated by the
// founder).
// BAARALI(08/11/2026): redrawn as Claude Code shows its work (the founder's
// call): while Baarali works, what it says and each action it takes appear
// one under the other as they happen, the action under way last; under them
// one status line, the B at work, what it is doing, the time. Done, the work
// folds into one quiet line « Worked 10 s · 16 actions » that opens on the
// same list. Each action opens on its detail, as before.

/** « 4 s », « 1 min 12 s », « 2 min ». */
export function workDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} s` : `${m} min`
}

/** The B's motions: looking around at work, still while it waits. */
const MOTION = ['loading', 'static'] as const

/** While it works, the last actions only; the earlier ones one click away. */
const LIVE_TAIL = 8

function useNow(live: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}

export type WorkEntry =
  | { kind: 'said'; id: string; text: string }
  | { kind: 'item'; id: string; item: ConversationItem }

/** The work in the order it happened: the agent's words, then what it did. */
export function workEntries(steps: WorkStep[]): WorkEntry[] {
  const out: WorkEntry[] = []
  for (const step of steps) {
    // A step opened by words has its own id; one without (« Getting ready ») takes its first item's.
    if (step.id !== step.items[0]?.id) out.push({ kind: 'said', id: step.id, text: (step.said ?? step.title).trim() })
    for (const item of step.items) out.push({ kind: 'item', id: item.id, item })
  }
  return out
}

/** What Baarali is doing now, for the status line. */
function CurrentAction({ entry }: { entry: WorkEntry | undefined }) {
  if (!entry) return <span>Getting ready</span>
  if (entry.kind === 'said') return <span data-no-translate>{entry.text.split('\n')[0]}</span>
  if (isToolCall(entry.item)) {
    const row = getToolRowSummary(entry.item)
    return (
      <>
        <span>{row.verb}</span>
        {(row.dimPrefix || row.detail) && <span data-no-translate> {row.dimPrefix}{row.detail}</span>}
      </>
    )
  }
  return <span>Thinking...</span>
}

function Timeline({ entries, renderItems, tail }: {
  entries: WorkEntry[]
  renderItems: (items: ConversationItem[]) => React.ReactNode
  /** Show only the last `tail` entries until the person asks for all. */
  tail?: number
}) {
  const [all, setAll] = React.useState(false)
  const hidden = !all && tail !== undefined ? Math.max(0, entries.length - tail) : 0
  const shown = hidden ? entries.slice(hidden) : entries
  return (
    <div className="baarali-timeline ml-[9px] flex flex-col gap-1 border-l border-border pl-4">
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="w-fit rounded-md py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
          {`${hidden} earlier actions`}
        </button>
      )}
      {shown.map((entry) =>
        entry.kind === 'said' ? (
          <p key={entry.id} className="whitespace-pre-wrap py-0.5 text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]" data-no-translate>
            {entry.text}
          </p>
        ) : (
          <div key={entry.id} className="baarali-timeline-item min-w-0 [&>*]:!my-0">{renderItems([entry.item])}</div>
        ),
      )}
    </div>
  )
}

export function WorkBlock({ steps, active, startedAt, endedAt, renderItems, forceOpen = false }: {
  steps: WorkStep[]
  active: boolean
  startedAt: number
  endedAt: number
  renderItems: (items: ConversationItem[]) => React.ReactNode
  /** An action waits for the person (a permission): the work shows, and says so. */
  forceOpen?: boolean
}) {
  const waiting = active && forceOpen
  const [open, setOpen] = React.useState(forceOpen)
  React.useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  const now = useNow(active)
  const total = workDuration((active ? now : endedAt) - startedAt)
  const entries = React.useMemo(() => workEntries(steps), [steps])
  const actions = entries.filter((e) => e.kind === 'item' && isToolCall(e.item)).length

  if (active) {
    return (
      <div className={cn('baarali-work is-active flex flex-col gap-3', waiting && 'is-waiting')} data-work-block>
        {entries.length > 0 && <Timeline entries={entries} renderItems={renderItems} tail={waiting ? undefined : LIVE_TAIL} />}
        <div role="status" className="flex min-w-0 items-center gap-2.5 text-sm">
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            <BaaraliMark motion={MOTION[waiting ? 1 : 0]} size={22} className="text-foreground" />
            {waiting && <span className="baarali-work-badge absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full"><ShieldAlert className="size-2" /></span>}
          </span>
          <span className={cn('shrink-0 font-medium text-foreground', !waiting && 'baarali-shimmer')}>
            {waiting ? 'Waiting for your approval' : 'Working...'}
          </span>
          {!waiting && (
            <span className="min-w-0 truncate text-muted-foreground">
              <CurrentAction entry={entries[entries.length - 1]} />
            </span>
          )}
          <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted-foreground" data-no-translate>{total}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="baarali-work flex flex-col" data-work-block>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit flex-wrap items-center gap-1.5 whitespace-nowrap rounded-lg px-1 py-1 text-left text-sm text-muted-foreground hover:text-foreground"
      >
        <BaaraliMark size={16} className="shrink-0" />
        <span>Worked</span>
        <span className="tabular-nums" data-no-translate>{total}</span>
        {actions > 0 && (
          <>
            <span data-no-translate>·</span>
            <span className="tabular-nums" data-no-translate>{actions}</span>
            <span>{actions === 1 ? 'action' : 'actions'}</span>
          </>
        )}
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-2">
          <Timeline entries={entries} renderItems={renderItems} />
        </div>
      )}
    </div>
  )
}
