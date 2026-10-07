import { useSyncExternalStore } from 'react'

// Whether typed chats have their replies read aloud (Baarali, 07/10/2026:
// the composer's speaker toggle, next to dictation). One switch for the
// whole app, remembered on this device; calls always speak, whatever it says.
//
// A module store like voice-ownership.ts: the composer toggles it, App reads
// it synchronously when it sends a message and when a reply streams in.

const KEY = 'baarali.readAloud'

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = stored()
const listeners = new Set<() => void>()

export function isReadAloud(): boolean {
  return on
}

export function setReadAloud(next: boolean): void {
  if (next === on) return
  on = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Not remembered on this device; still on for this run.
  }
  for (const listener of listeners) listener()
}

export function onReadAloudChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReadAloud(): boolean {
  return useSyncExternalStore(onReadAloudChange, isReadAloud)
}
