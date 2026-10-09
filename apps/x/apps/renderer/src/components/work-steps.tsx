import * as React from 'react'
import { AlertTriangle, Check, ChevronRight, LoaderIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConversationItem } from '@/lib/chat-conversation'
import type { WorkStep } from '@/lib/work-steps'

// BAARALI(09/10/2026): the agent's work, folded (mockup validated by the
// founder). Running, one line per step and a spinner on the current one;
// done, a single line « Worked 1 min 40 s · 5 steps ». A step opens on what
// the agent thought and the tools it called.

/** « 4 s », « 1 min 12 s », « 2 min ». */
export function workDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} s` : `${m} min`
}

function useNow(live: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}

function StepRow({ step, current, renderItems, defaultOpen }: {
  step: WorkStep
  current: boolean
  renderItems: (items: ConversationItem[]) => React.ReactNode
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const now = useNow(current)
  const ms = (current ? now : step.endedAt) - step.startedAt
  const hasDetail = step.items.length > 0 || step.said !== null
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group flex w-full items-start gap-2 rounded-md py-1 text-left text-sm',
          current ? 'text-foreground' : 'text-muted-foreground',
          hasDetail && 'hover:text-foreground',
        )}
      >
        <ChevronRight className={cn('mt-[3px] size-3 shrink-0 opacity-60 transition-transform', open && 'rotate-90', !hasDetail && 'invisible')} />
        <span className="mt-[2px] flex size-4 shrink-0 items-center justify-center">
          {current ? (
            <LoaderIcon className="size-3.5 animate-spin text-primary" />
          ) : step.failed ? (
            <AlertTriangle className="size-3.5 text-amber-500" />
          ) : (
            <Check className="size-3.5 text-emerald-500" />
          )}
        </span>
        <span className="min-w-0 flex-1" data-no-translate>{step.title}</span>
        <span className="shrink-0 pl-2 text-xs tabular-nums text-muted-foreground/70" data-no-translate>{workDuration(ms)}</span>
      </button>
      {open && hasDetail && (
        <div className="mb-2 ml-[42px] mt-1 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          {step.said && <p className="whitespace-pre-wrap text-muted-foreground" data-no-translate>{step.said}</p>}
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
  /** A step waits for the person (a permission): the work shows. */
  forceOpen?: boolean
}) {
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
  return (
    <div className="flex flex-col" data-work-block>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-2 rounded-md py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
        {active ? (
          <>
            <span className="text-foreground">Baarali is working…</span>
            <span className="tabular-nums" data-no-translate>· {total}</span>
          </>
        ) : (
          <>
            <span>Worked</span>
            <span className="tabular-nums" data-no-translate>{total}</span>
            <span data-no-translate>·</span>
            <span className="tabular-nums" data-no-translate>{count}</span>
            <span>{count === 1 ? 'step' : 'steps'}</span>
          </>
        )}
      </button>
      {open && (
        <ol className="ml-1.5 mt-1 flex flex-col border-l border-border pl-3">
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              current={active && i === steps.length - 1}
              renderItems={renderItems}
              defaultOpen={forceOpen && i === steps.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  )
}
