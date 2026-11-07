import * as React from 'react'
import { AlertTriangle, Check, ChevronRight, ShieldAlert } from 'lucide-react'
import { BaaraliMark } from '@/components/baarali-mark'
import { cn } from '@/lib/utils'
import type { ConversationItem } from '@/lib/chat-conversation'
import type { WorkStep } from '@/lib/work-steps'

// BAARALI(09/10/2026): the agent's work, folded (mockup validated by the
// founder). A step opens on what the agent thought and the tools it called.
// BAARALI(07/11/2026): redrawn in the app's new look (the founder found it
// dull): the B at work with the step under way said in clear, the real time,
// a line that moves while it works; waiting for the person, it says so and
// opens on the request; done, one quiet line « Worked 1 min 12 s · 5 steps ».

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

function useNow(live: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}

function StepRow({ step, current, waiting, renderItems, defaultOpen }: {
  step: WorkStep
  current: boolean
  waiting: boolean
  renderItems: (items: ConversationItem[]) => React.ReactNode
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  React.useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])
  const now = useNow(current && !waiting)
  const ms = (current ? now : step.endedAt) - step.startedAt
  const hasDetail = step.items.length > 0 || step.said !== null
  return (
    <li className="baarali-step relative flex flex-col" data-state={current ? (waiting ? 'waiting' : 'current') : step.failed ? 'failed' : 'done'}>
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors',
          current ? 'text-foreground' : 'text-muted-foreground',
          hasDetail && 'hover:bg-muted/50 hover:text-foreground',
        )}
      >
        <span className="baarali-step-dot mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-full">
          {current ? (
            waiting ? <ShieldAlert className="size-3" /> : <span className="baarali-step-pulse size-2 rounded-full" />
          ) : step.failed ? (
            <AlertTriangle className="size-3" />
          ) : (
            <Check className="size-3" strokeWidth={3} />
          )}
        </span>
        <span className={cn('min-w-0 flex-1 leading-[1.45] [overflow-wrap:anywhere]', current && !waiting && 'baarali-shimmer')} data-no-translate>{step.title}</span>
        <span className="shrink-0 pl-2 pt-[1px] text-xs tabular-nums text-muted-foreground/70" data-no-translate>{workDuration(ms)}</span>
        <ChevronRight className={cn('mt-[3px] size-3.5 shrink-0 opacity-50 transition-transform', open && 'rotate-90', !hasDetail && 'invisible')} />
      </button>
      {open && hasDetail && (
        <div className="mb-2 ml-[30px] mt-1 flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm">
          {step.said && <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]" data-no-translate>{step.said}</p>}
          {step.items.length > 0 && <div className="flex flex-col gap-3">{renderItems(step.items)}</div>}
        </div>
      )}
    </li>
  )
}

export function WorkBlock({ steps, active, startedAt, endedAt, renderItems, forceOpen = false }: {
  steps: WorkStep[]
  active: boolean
  startedAt: number
  endedAt: number
  renderItems: (items: ConversationItem[]) => React.ReactNode
  /** A step waits for the person (a permission): the work shows, and says so. */
  forceOpen?: boolean
}) {
  const waiting = active && forceOpen
  const [open, setOpen] = React.useState(active || forceOpen)
  // Running, the steps show; once done the block folds, unless the person opened it.
  const wasActive = React.useRef(active)
  React.useEffect(() => {
    if (wasActive.current && !active) setOpen(false)
    if (!wasActive.current && active) setOpen(true)
    wasActive.current = active
  }, [active])
  React.useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  const now = useNow(active)
  const total = workDuration((active ? now : endedAt) - startedAt)
  const count = steps.length
  const current = active ? steps[steps.length - 1] : undefined
  return (
    <div className={cn('baarali-work flex flex-col', active && 'is-active', waiting && 'is-waiting')} data-work-block>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-3 text-left text-sm',
          active ? 'w-full rounded-2xl border border-border bg-muted/30 px-3.5 py-3' : 'w-fit flex-wrap whitespace-nowrap rounded-lg px-1.5 py-1 text-muted-foreground hover:text-foreground',
        )}
      >
        {active ? (
          <>
            <span className="relative flex size-9 shrink-0 items-center justify-center">
              <BaaraliMark motion={MOTION[waiting ? 1 : 0]} size={34} className="text-foreground" />
              {waiting && <span className="baarali-work-badge absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full"><ShieldAlert className="size-2.5" /></span>}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{waiting ? 'Waiting for your approval' : 'Baarali is working…'}</span>
              {current && <span className="truncate text-[13px] text-muted-foreground" data-no-translate>{current.title}</span>}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-no-translate>{total}</span>
            <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          </>
        ) : (
          <>
            <BaaraliMark size={18} className="shrink-0 text-muted-foreground" />
            <span>Worked</span>
            <span className="tabular-nums" data-no-translate>{total}</span>
            <span data-no-translate>·</span>
            <span className="tabular-nums" data-no-translate>{count}</span>
            <span>{count === 1 ? 'step' : 'steps'}</span>
            <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
          </>
        )}
      </button>
      {active && !waiting && <div className="baarali-work-bar mx-4" aria-hidden="true" />}
      {open && (
        <ol className={cn('baarali-steps flex flex-col', active ? 'mt-2 pl-1' : 'mt-1 pl-1')}>
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              current={active && i === steps.length - 1}
              waiting={waiting && i === steps.length - 1}
              renderItems={renderItems}
              defaultOpen={forceOpen && i === steps.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  )
}
