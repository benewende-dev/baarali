import { isChatMessage, isToolCall, type ConversationItem, type ToolCall } from '@/lib/chat-conversation'
import type { TurnStreamEvent } from '@x/shared/src/turns.js'

export type ActivityPhase = 'preparing' | 'model' | 'reasoning' | 'responding' | 'tool' | 'person' | 'error' | 'settled'

// 18/10/2026: activity comes from execution events, never a timed sequence
// of reassuring labels. A quiet stream is not proof that execution stopped.
export function eventActivity(event: TurnStreamEvent): ActivityPhase | null {
  switch (event.type) {
    case 'turn_created': case 'input_added': case 'tool_result': case 'model_call_completed': return 'preparing'
    case 'model_call_requested': return 'model'
    case 'reasoning_delta': return 'reasoning'
    case 'text_delta': return 'responding'
    case 'model_step_event':
      if (event.event.type === 'reasoning_start') return 'reasoning'
      if (event.event.type === 'text_start') return 'responding'
      return null
    case 'tool_invocation_requested': case 'tool_progress': return 'tool'
    case 'tool_permission_required': return 'preparing'
    case 'turn_suspended': return event.pendingAsyncTools.length ? 'tool' : 'preparing'
    case 'tool_permission_resolved': return 'preparing'
    case 'model_call_failed': return 'error'
    case 'turn_completed': case 'turn_failed': case 'turn_cancelled': return 'settled'
    default: return null
  }
}

export function currentTurn(items: ConversationItem[]) {
  // Steered inputs have :user:<index>; they belong to the same turn and
  // must not reset elapsed time or discard its still-running tools.
  let start = -1
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (isChatMessage(item) && item.role === 'user') { start = i; break }
  }
  if (start < 0) return { key: 'pending', turnId: null, startedAt: null, items }
  const user = items[start]
  const match = user.id.match(/^(.*):user(?::\d+)?$/)
  const turnId = match?.[1] ?? null
  if (turnId) {
    const first = items.findIndex(item => item.id === `${turnId}:user`)
    if (first >= 0) start = first
  }
  return { key: turnId ?? user.id, turnId, startedAt: items[start].timestamp, items: items.slice(start + 1) }
}

export function runningTool(items: ConversationItem[]): ToolCall | undefined {
  return items.filter(isToolCall).reverse().find(tool => tool.status === 'running' || tool.status === 'pending')
}

export function activityTitle(phase: ActivityPhase, tool?: ToolCall): string {
  if (phase === 'model') return 'Waiting for the model'
  if (phase === 'reasoning') return 'Analyzing your request'
  if (phase === 'responding') return 'Writing the response'
  if (phase === 'person') return 'Your response is needed'
  if (phase === 'error') return 'The model reported an error'
  if (phase === 'tool') {
    switch (tool?.name) {
      case 'file-readText': case 'parseFile': case 'LLMParse': return 'Reading documents'
      case 'file-writeText': case 'file-editText': return 'Updating files'
      case 'file-list': case 'file-glob': case 'file-grep': return 'Inspecting files'
      case 'executeCommand': return 'Running a command'
      case 'web-search': case 'browser-control': case 'browser-run': return 'Browsing the web'
      case 'code_agent_run': return 'Working on the project'
      case 'spawn-agent': return 'Delegated task in progress'
      default: return 'Using a tool'
    }
  }
  return 'Preparing the response'
}

export function activityDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`
}

export function requestActivityRefresh(sessionId: string): void {
  window.dispatchEvent(new CustomEvent('baarali:refresh-session-activity', { detail: sessionId }))
}

export function subscribeActivityRefresh(sessionId: string | null, listener: () => void): () => void {
  const refresh = (event: Event) => { if ((event as CustomEvent<unknown>).detail === sessionId) listener() }
  window.addEventListener('baarali:refresh-session-activity', refresh)
  return () => window.removeEventListener('baarali:refresh-session-activity', refresh)
}
