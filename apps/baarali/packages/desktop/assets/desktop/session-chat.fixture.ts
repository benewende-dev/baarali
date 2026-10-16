import { describe, expect, it, vi } from 'vitest'
import type { TurnBusEvent } from '@x/shared/src/turns.js'
import type { SessionsClient } from './client'
import { SessionChatStore } from './store'
import { completedTurnLog, sessionState } from './test-fixtures'

// BAARALI(16/10/2026): a fast first answer must survive the slower empty
// session snapshot that was requested before the message reached the runtime.
describe('Baarali live chat hydration', () => {
  it('retains the first completed response when an older empty snapshot arrives late', async () => {
    const sessionId = 'new-chat', turnId = 'first-turn'
    const events = completedTurnLog(turnId, sessionId, 'hello', 'Reception OK')
    let deliver!: (event: TurnBusEvent) => void
    let releaseQueue!: () => void
    const client = {
      get: vi.fn().mockResolvedValueOnce(sessionState(sessionId, [])).mockResolvedValue(sessionState(sessionId, [turnId])),
      getTurn: vi.fn().mockResolvedValue({ turnId, events }),
      listQueued: vi.fn().mockImplementationOnce(() => new Promise(resolve => { releaseQueue = () => resolve({ queue: [] }) })).mockResolvedValue({ queue: [] }),
    } as unknown as SessionsClient
    const store = new SessionChatStore({ client,
      subscribeTurnFeed: listener => { deliver = listener; return () => {} },
      subscribeSessionFeed: () => () => {}, subscribeDeltas: () => () => {},
      scheduleEmit: flush => { flush(); return () => {} },
    })
    const disconnect = store.connect()
    try {
      const hydration = store.setSession(sessionId)
      await vi.waitFor(() => expect(releaseQueue).toBeTypeOf('function'))
      events.forEach((event, i) => deliver({ sessionId, turnId, event, offset: i + 1 }))
      expect(store.getSnapshot().latestTurnId).toBe(turnId)
      releaseQueue()
      await hydration
      expect(JSON.stringify(store.getSnapshot().chatState)).toContain('Reception OK')
      expect(store.getSnapshot().latestTurnId).toBe(turnId)
      expect(store.getSnapshot().chatState?.isProcessing).toBe(false)
    } finally { disconnect() }
  })
})
