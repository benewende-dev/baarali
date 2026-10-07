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

/**
 * What to say of a reply that came without a <voice> summary: its opening,
 * as plain text, cut after a sentence near 400 characters. Code, links and
 * markup are not read; an empty string when nothing is left.
 */
export function speakableOpening(reply: string, max = 400): string {
  const text = reply
    .replace(/<voice>[\s\S]*?<\/voice>/g, ' ')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const window = text.slice(0, max)
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
  return cut > max / 3 ? window.slice(0, cut + 1) : `${window.slice(0, window.lastIndexOf(' '))}…`
}
