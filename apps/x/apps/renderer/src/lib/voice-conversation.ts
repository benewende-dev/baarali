import { useSyncExternalStore } from 'react'

// Conversation mode (Baarali, 07/10/2026): one tap on the composer's voice
// button, then talk as on the phone. Each pause sends what was said, the
// reply is read aloud in the open chat, and the mic listens again. No
// floating window, no key to hold. « Interrupt » cuts a reply short and
// gives the user the floor. Tap again to hang up.
//
// A module store like read-aloud.ts: App owns the engine and registers the
// toggle; any composer shows the state and offers the button.

export type ConversationStatus = 'off' | 'listening' | 'thinking' | 'speaking'

/** Where the tap came from: the Home composer opens a new chat first. */
export type ConversationOrigin = 'home' | 'chat'

let status: ConversationStatus = 'off'
const listeners = new Set<() => void>()
type Engine = { toggle: (origin: ConversationOrigin) => void; interrupt: () => void }
let engine: Engine | null = null

export function getConversationStatus(): ConversationStatus {
  return status
}

export function setConversationStatus(next: ConversationStatus): void {
  if (next === status) return
  status = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useConversationStatus(): ConversationStatus {
  return useSyncExternalStore(subscribe, getConversationStatus)
}

/** App installs the engine; returns the uninstaller. */
export function registerConversation(next: Engine): () => void {
  engine = next
  return () => {
    if (engine === next) engine = null
  }
}

export function canToggleConversation(): boolean {
  return engine !== null
}

export function toggleConversation(origin: ConversationOrigin): void {
  engine?.toggle(origin)
}

/** Silences the reply being read and listens to the user again. */
export function interruptConversation(): void {
  engine?.interrupt()
}
