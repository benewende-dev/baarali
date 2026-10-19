import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Clock3, RefreshCw, WifiOff } from 'lucide-react'
import { BaaraliMark } from '@/components/baarali-mark'
import { subscribeTurnFeed } from '@/lib/turn-feed'
import { activityDuration, activityTitle, currentTurn, eventActivity, requestActivityRefresh, runningTool, type ActivityPhase } from '@/lib/baarali-agent-activity'
import { isChatMessage, isReasoningMessage, isToolCall, type ConversationItem } from '@/lib/chat-conversation'

type Props = { isReasoning: boolean; sessionId?: string | null; items?: ConversationItem[]; waitingForPerson?: boolean; assistantText?: string; reasoningText?: string }
const EMPTY_ITEMS: ConversationItem[] = []

export function TurnActivityIndicator({ isReasoning, sessionId = null, items = EMPTY_ITEMS, waitingForPerson = false, assistantText = '', reasoningText = '' }: Props) {
  const turn = currentTurn(items)
  return <LiveActivity key={`${sessionId}:${turn.key}`} isReasoning={isReasoning} sessionId={sessionId} turn={turn} waitingForPerson={waitingForPerson} assistantText={assistantText} reasoningText={reasoningText} />
}

function LiveActivity({ isReasoning, sessionId, turn, waitingForPerson, assistantText = '', reasoningText = '' }: Omit<Props, 'items'> & { turn: ReturnType<typeof currentTurn> }) {
  const [startedAt] = useState(() => turn.startedAt ?? Date.now())
  const [now, setNow] = useState(Date.now)
  const [signal, setSignal] = useState<{ phase: ActivityPhase | null; at: number | null }>({ phase: null, at: null })
  const [online, setOnline] = useState(() => navigator.onLine)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<'reachable' | 'unavailable' | null>(null)
  const revision = useRef(0)
  const alive = useRef(true)
  const priorText = useRef({ assistantText, reasoningText })

  useEffect(() => {
    const changedText = assistantText && assistantText !== priorText.current.assistantText
    const changedReasoning = reasoningText && reasoningText !== priorText.current.reasoningText
    priorText.current = { assistantText, reasoningText }
    if (!changedText && !changedReasoning) return
    // Legacy runs have no turn-feed deltas. A newly received text fragment
    // is still real activity; merely reopening an old tail is not.
    revision.current++
    const phase = changedText ? 'responding' : 'reasoning'
    const at = Date.now()
    setSignal(previous => previous.phase === 'settled' || (previous.phase === phase && previous.at !== null && at - previous.at < 500) ? previous : { phase, at })
  }, [assistantText, reasoningText])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      clearInterval(timer)
      if (!document.hidden) {
        setNow(Date.now())
        timer = setInterval(() => setNow(Date.now()), 1000)
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [])

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync) }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    return subscribeTurnFeed(event => {
      if (event.sessionId !== sessionId || (turn.turnId && event.turnId !== turn.turnId)) return
      revision.current++
      const at = Date.now()
      setSignal(previous => {
        if (previous.phase === 'settled') return previous
        const phase = eventActivity(event.event) ?? previous.phase
        if (phase === previous.phase && previous.at !== null && at - previous.at < 500) return previous
        return { phase, at }
      })
      setCheckResult(null)
    })
  }, [sessionId, turn.turnId])

  useEffect(() => {
    if (!turn.turnId) return
    let disposed = false
    const before = revision.current
    // 18/10/2026: transcript timestamps are synthetic ordering keys. Only
    // execution events establish freshness when reopening a running chat.
    void window.ipc.invoke('sessions:getTurn', { turnId: turn.turnId }).then(snapshot => {
      if (disposed || before !== revision.current) return
      let phase: ActivityPhase | null = null
      let at: number | null = null
      for (const event of snapshot.events) {
        phase = eventActivity(event) ?? phase
        const time = Date.parse(event.ts)
        if (Number.isFinite(time)) at = Math.max(at ?? 0, Math.min(time, Date.now()))
      }
      setSignal({ phase, at })
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [turn.turnId])

  const tool = runningTool(turn.items)
  const pendingCodePermission = turn.items.some(item => isToolCall(item) && item.pendingCodePermission)
  const streamingText = turn.items.some(item => isChatMessage(item) && item.role === 'assistant' && item.streaming)
  const streamingReasoning = turn.items.some(item => isReasoningMessage(item) && item.streaming)
  const phase: ActivityPhase = signal.phase === 'settled' ? 'settled' : waitingForPerson || pendingCodePermission ? 'person'
    : signal.phase ?? (tool ? 'tool' : streamingText ? 'responding' : isReasoning || streamingReasoning ? 'reasoning' : 'preparing')
  const quietFor = Math.max(0, now - (signal.at ?? startedAt))
  const stale = phase !== 'person' && quietFor >= 30000
  const title = !online ? 'Network connection interrupted' : activityTitle(phase, tool)
  const moving = online && phase !== 'person' && phase !== 'error' && !stale
  const markMotion = moving ? 'rotation' : 'static'

  async function checkConnection() {
    if (!sessionId || checking) return
    setChecking(true)
    setCheckResult(null)
    try {
      await window.ipc.invoke('sessions:get', { sessionId })
      if (!alive.current) return
      setCheckResult('reachable')
      requestActivityRefresh(sessionId)
    } catch {
      if (alive.current) setCheckResult('unavailable')
    } finally {
      if (alive.current) setChecking(false)
    }
  }

  if (phase === 'settled') return null
  return <section className="flex flex-col gap-2 py-1" aria-label="Agent activity" data-agent-activity>
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center text-foreground">
        {!online ? <WifiOff className="size-5 text-amber-500" aria-hidden />
          : phase === 'person' ? <CircleHelp className="size-5 text-muted-foreground" aria-hidden />
          : stale ? <Clock3 className="size-5 text-muted-foreground" aria-hidden />
          : <BaaraliMark motion={markMotion} size={36} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground" role="status">{title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          {phase === 'person' ? <span>Please answer the request above to continue.</span>
            : !online ? <span>Your conversation is preserved. The connection will retry automatically.</span>
            : signal.at === null ? <span>Waiting for confirmed activity</span>
            : <span>{stale ? `No new activity for ${activityDuration(quietFor)}` : `Last activity ${activityDuration(quietFor)} ago`}</span>}
        </div>
      </div>
      <time className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-label="Elapsed time" data-no-translate>{activityDuration(now - startedAt)}</time>
    </div>
    {(stale || !online || checkResult) && phase !== 'person' && <div className="ml-[46px] flex flex-col items-start gap-2 text-xs text-muted-foreground">
      {stale && online && <p>The wait is taking longer. This does not confirm that the agent has stopped.</p>}
      {sessionId && <button type="button" onClick={() => void checkConnection()} disabled={checking} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"><RefreshCw className="size-3" aria-hidden /><span>{checking ? 'Checking connection…' : 'Check connection'}</span></button>}
      {checkResult && <p role="status">{checkResult === 'reachable' ? 'Server reachable. Refreshing the session state.' : 'The session state could not be checked. You can try again.'}</p>}
    </div>}
  </section>
}
