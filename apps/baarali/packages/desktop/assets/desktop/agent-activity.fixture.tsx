import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnBusEvent, TurnStreamEvent } from '@x/shared/src/turns.js'
import type { ConversationItem } from '@/lib/chat-conversation'
import { currentTurn, requestActivityRefresh, subscribeActivityRefresh } from '@/lib/baarali-agent-activity'
import { TurnActivityIndicator } from './turn-activity-indicator'
import { WorkBlock } from './work-steps'

const { listeners, invoke } = vi.hoisted(() => ({ listeners: new Set<(event: TurnBusEvent) => void>(), invoke: vi.fn() }))
vi.mock('@/lib/turn-feed', () => ({ subscribeTurnFeed: (listener: (event: TurnBusEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } }))
vi.mock('./baarali-mark', () => ({ BaaraliMark: ({ motion }: { motion: string }) => <span data-testid="activity-mark" data-motion={motion} /> }))
const start = 1_800_000_000_000
const user = (): ConversationItem => ({ id: 'turn:user', role: 'user', content: 'Bonjour', timestamp: start })
const emit = (event: Partial<TurnStreamEvent> & { type: TurnStreamEvent['type'] }, sessionId = 'session', turnId = 'turn') => act(() => {
  for (const listener of listeners) listener({ sessionId, turnId, event: { turnId, ts: new Date(Date.now()).toISOString(), ...event } as TurnStreamEvent })
})
const settle = async () => { await act(async () => {}) }
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
  listeners.clear()
  invoke.mockReset().mockRejectedValue(new Error('no snapshot'))
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('live Baarali activity', () => {
  it('shows the rotating mark without a product name and follows actual model and text events', async () => {
    render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={[user()]} />)
    await settle()
    expect(screen.getByTestId('activity-mark')).toHaveAttribute('data-motion', 'rotation')
    expect(screen.queryByText('Baarali')).toBeNull()
    expect(screen.getByText('Waiting for confirmed activity')).toBeVisible()
    emit({ type: 'model_call_requested' })
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the model')
    emit({ type: 'text_delta', delta: 'Bonjour' })
    expect(screen.getByRole('status')).toHaveTextContent('Writing the response')
    emit({ type: 'turn_completed' })
    emit({ type: 'text_delta', delta: 'late delivery' })
    expect(screen.queryByTestId('activity-mark')).toBeNull()
    expect(screen.queryByLabelText('Agent activity')).toBeNull()
  })

  it('does not invent progress while quiet, and returns to activity after a real signal', async () => {
    render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={[user()]} />)
    await settle()
    emit({ type: 'model_call_requested' })
    act(() => vi.advanceTimersByTime(31000))
    expect(screen.getByText(/^No new activity for /)).toBeVisible()
    expect(screen.getByText('The wait is taking longer. This does not confirm that the agent has stopped.')).toBeVisible()
    expect(screen.queryByTestId('activity-mark')).toBeNull()
    emit({ type: 'reasoning_delta', delta: 'Analyzing' })
    expect(screen.getByTestId('activity-mark')).toHaveAttribute('data-motion', 'rotation')
    expect(screen.queryByText(/^No new activity for /)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing your request')
  })

  it('recognizes new text in legacy chats without treating an old reopened tail as fresh activity', async () => {
    const view = render(<TurnActivityIndicator isReasoning={false} assistantText="Old tail" items={[user()]} />)
    await settle()
    expect(screen.getByText('Waiting for confirmed activity')).toBeVisible()
    act(() => vi.advanceTimersByTime(31000))
    view.rerender(<TurnActivityIndicator isReasoning={false} assistantText="New response fragment" items={[user()]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Writing the response')
    expect(screen.queryByText(/^No new activity for /)).toBeNull()
    expect(screen.getByTestId('activity-mark')).toHaveAttribute('data-motion', 'rotation')
  })

  it('keeps the tool visible and stops rotation while waiting for the person', async () => {
    const items: ConversationItem[] = [user(), { id: 'tool', name: 'file-readText', input: {}, status: 'running', timestamp: start + 1 }]
    const view = render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={items} />)
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent('Reading documents')
    view.rerender(<TurnActivityIndicator isReasoning={false} sessionId="session" items={items} waitingForPerson />)
    expect(screen.getByRole('status')).toHaveTextContent('Your response is needed')
    expect(screen.queryByTestId('activity-mark')).toBeNull()
    act(() => vi.advanceTimersByTime(60000))
    expect(screen.queryByText(/^No new activity for /)).toBeNull()
  })

  it('ignores other sessions and turns and does not let an old snapshot overwrite live text', async () => {
    let resolve!: (snapshot: unknown) => void
    invoke.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={[user()]} />)
    emit({ type: 'turn_completed' }, 'other-session')
    emit({ type: 'turn_completed' }, 'session', 'old-turn')
    expect(screen.getByLabelText('Agent activity')).toBeVisible()
    emit({ type: 'text_delta', delta: 'Bonjour' })
    await act(async () => resolve({ events: [{ type: 'model_call_requested', turnId: 'turn', ts: new Date(start).toISOString() }] }))
    expect(screen.getByRole('status')).toHaveTextContent('Writing the response')
  })

  it('checks the server and refreshes only the matching session without sending the request again', async () => {
    invoke.mockImplementation((channel: string) => channel === 'sessions:getTurn'
      ? Promise.resolve({ events: [{ type: 'model_call_requested', turnId: 'turn', ts: new Date(start - 45000).toISOString() }] })
      : Promise.resolve({ turns: [] }))
    const refresh = vi.fn(), otherRefresh = vi.fn()
    const off = subscribeActivityRefresh('session', refresh), offOther = subscribeActivityRefresh('other', otherRefresh)
    render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={[user()]} />)
    await settle()
    expect(screen.getByText(/^No new activity for /)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    await settle()
    expect(invoke).toHaveBeenCalledWith('sessions:get', { sessionId: 'session' })
    expect(refresh).toHaveBeenCalledOnce()
    expect(otherRefresh).not.toHaveBeenCalled()
    expect(screen.getByText('Server reachable. Refreshing the session state.')).toBeVisible()
    expect(invoke.mock.calls.some(([channel]) => String(channel).includes('send'))).toBe(false)
    off(); offOther()
  })

  it('labels a real network loss, resumes on return, and unsubscribes on unmount', async () => {
    const view = render(<TurnActivityIndicator isReasoning={false} sessionId="session" items={[user()]} />)
    await settle()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('status')).toHaveTextContent('Network connection interrupted')
    expect(screen.queryByTestId('activity-mark')).toBeNull()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    fireEvent(window, new Event('online'))
    emit({ type: 'text_delta', delta: 'Bonjour' })
    expect(screen.getByTestId('activity-mark')).toBeVisible()
    view.unmount()
    expect(listeners.size).toBe(0)
    requestActivityRefresh('session')
  })

  it('keeps elapsed time and outstanding tools when the person steers the current turn', () => {
    const items: ConversationItem[] = [user(), { id: 'tool', name: 'executeCommand', input: {}, status: 'running', timestamp: start + 1 }, { ...user(), id: 'turn:user:1', timestamp: start + 5000 }]
    const current = currentTurn(items)
    expect(current.turnId).toBe('turn')
    expect(current.startedAt).toBe(start)
    expect(current.items.some(item => item.id === 'tool')).toBe(true)
  })

  it('preserves a measured live duration when work folds, without inventing a history duration', () => {
    const steps = [{ id: 'step', title: 'Reading files', said: null, items: [], startedAt: start, endedAt: start + 1, failed: false }]
    const view = render(<WorkBlock steps={steps} active startedAt={start} endedAt={start + 1} renderItems={() => null} />)
    act(() => vi.advanceTimersByTime(11000))
    view.rerender(<WorkBlock steps={steps} active={false} startedAt={start} endedAt={start + 1} renderItems={() => null} />)
    expect(screen.getByText('11 s')).toBeVisible()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    view.unmount()
    render(<WorkBlock steps={steps} active={false} startedAt={start} endedAt={start + 1} renderItems={() => null} />)
    expect(screen.queryByText('0 s')).toBeNull()
  })

  it('never marks a pending tool as completed after an interrupted turn', () => {
    const tool: ConversationItem = { id: 'tool', name: 'executeCommand', input: {}, status: 'running', timestamp: start }
    const steps = [{ id: 'step', title: 'Running a command', said: null, items: [tool], startedAt: start, endedAt: start, failed: false }]
    render(<WorkBlock steps={steps} active={false} startedAt={start} endedAt={start} renderItems={() => null} forceOpen />)
    expect(screen.getByLabelText('Unfinished action')).toBeVisible()
    expect(screen.queryByText('0 s')).toBeNull()
  })
})
