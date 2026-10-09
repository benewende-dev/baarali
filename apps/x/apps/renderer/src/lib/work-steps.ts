// BAARALI(09/10/2026): the chat shows the agent's work as steps, one line
// each, its thinking and tools folded under each (mockup validated by the
// founder). In each turn, the agent's last words, with nothing after them,
// are the answer and stay in the open; everything before is work. Each thing
// the agent says on the way (« Template posé, je corrige la typo ») starts a
// step and titles it; the thinking and tools that follow belong to it.

import {
  getToolDisplayName,
  isChatMessage,
  isErrorMessage,
  isToolCall,
  isTurnUsageMessage,
  type ConversationItem,
} from '@/lib/chat-conversation'

export interface WorkStep {
  id: string
  /** The agent’s words that open the step, as one short line; without a word, what it did first. */
  title: string
  /** The whole of those words, when the title had to cut them. */
  said: string | null
  items: ConversationItem[]
  startedAt: number
  endedAt: number
  failed: boolean
}

export type TurnSegment =
  | { kind: 'item'; item: ConversationItem }
  | { kind: 'work'; id: string; steps: WorkStep[]; active: boolean; startedAt: number; endedAt: number }

const TITLE_MAX = 110

/** The first sentence of what the agent said, without its markdown. */
export function stepTitle(text: string): { title: string; cut: boolean } {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = plain.match(/^(.+?[.!?…])(\s|$)/)?.[1] ?? plain
  if (sentence.length <= TITLE_MAX) return { title: sentence, cut: sentence !== plain }
  return { title: `${sentence.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, '')}…`, cut: true }
}

/** After the answer, only these may follow without making it work. */
const trailing = (item: ConversationItem) => isTurnUsageMessage(item) || isErrorMessage(item)

function stepsOf(items: ConversationItem[]): WorkStep[] {
  const steps: WorkStep[] = []
  for (const item of items) {
    if (isChatMessage(item) && item.role === 'assistant') {
      const { title, cut } = stepTitle(item.content)
      if (title) {
        steps.push({ id: item.id, title, said: cut ? item.content : null, items: [], startedAt: item.timestamp, endedAt: item.timestamp, failed: false })
        continue
      }
    }
    let step = steps[steps.length - 1]
    if (!step) {
      step = {
        id: item.id,
        title: 'Getting ready',
        said: null,
        items: [],
        startedAt: item.timestamp,
        endedAt: item.timestamp,
        failed: false,
      }
      steps.push(step)
    }
    step.items.push(item)
    step.endedAt = Math.max(step.endedAt, item.timestamp)
    if (isToolCall(item) && item.status === 'error') step.failed = true
  }
  // Started without a word: named after its first tool, wherever it comes.
  for (const step of steps) {
    if (step.id !== step.items[0]?.id) continue
    const first = step.items.find(isToolCall)
    if (first) step.title = getToolDisplayName(first)
  }
  // A step lasts until the next one starts.
  for (let i = 0; i < steps.length - 1; i++) steps[i].endedAt = Math.max(steps[i].endedAt, steps[i + 1].startedAt)
  return steps
}

/**
 * The conversation as the chat draws it: people's messages, the work of each
 * turn folded into one block, then the answer. `working`: the last turn is
 * still running.
 */
export function segmentTurns(items: ConversationItem[], working: boolean): TurnSegment[] {
  const out: TurnSegment[] = []
  const runs: ConversationItem[][] = []
  let run: ConversationItem[] | null = null
  for (const item of items) {
    if (isChatMessage(item) && item.role === 'user') {
      out.push({ kind: 'item', item })
      run = []
      runs.push(run)
      // Keep the order: the run's segments go in once it is complete.
      out.push({ kind: 'work', id: `run-${runs.length - 1}`, steps: [], active: false, startedAt: 0, endedAt: 0 })
      continue
    }
    if (!run) {
      run = []
      runs.push(run)
      out.push({ kind: 'work', id: `run-${runs.length - 1}`, steps: [], active: false, startedAt: 0, endedAt: 0 })
    }
    run.push(item)
  }
  const expanded: TurnSegment[] = []
  let r = 0
  for (const seg of out) {
    if (seg.kind === 'item') { expanded.push(seg); continue }
    const index = r++
    const items = runs[index]
    const last = index === runs.length - 1
    const finished = items.some(isTurnUsageMessage) || !working || !last
    let answer = -1
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (trailing(it)) continue
      if (isChatMessage(it) && it.role === 'assistant') answer = i
      break
    }
    const work = answer === -1 ? items.filter((it) => !trailing(it)) : items.slice(0, answer).filter((it) => !trailing(it))
    if (work.length) {
      const steps = stepsOf(work)
      const active = !finished && answer === -1
      const endedAt = answer === -1 ? Math.max(...work.map((w) => w.timestamp)) : items[answer].timestamp
      expanded.push({ kind: 'work', id: seg.id, steps, active, startedAt: work[0].timestamp, endedAt })
    }
    if (answer !== -1) expanded.push({ kind: 'item', item: items[answer] })
    for (const it of items) if (trailing(it)) expanded.push({ kind: 'item', item: it })
  }
  return expanded
}

/** Whether the chat already shows the turn running (the work block's own spinner). */
export function hasActiveWork(items: ConversationItem[], working: boolean): boolean {
  return segmentTurns(items, working).some((s) => s.kind === 'work' && s.active)
}
