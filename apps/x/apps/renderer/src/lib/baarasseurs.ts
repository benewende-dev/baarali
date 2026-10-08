import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  BAARASSEURS_PATH, baarasseurAgentId, baarasseurIdOf, parseBaarasseurs, saveTeam, upsertChange, templateToBaarasseur as fromTemplate,
  type Baarasseur, type BaarasseurSchedule, type Template,
} from '@x/shared/dist/baarasseur.js'
import { appLang } from '@/lib/prompt-library'

// BAARALI(06/10/2026): the baarasseurs on the desktop — one shared store over
// the workspace file (the core reads the same file on every turn) and the
// avatar tints. The recruiting kit (templates, tools, the sentence → form
// step, the save) is shared with the phone: @x/shared/baarasseur.

export type { Baarasseur, BaarasseurSchedule, Template }
export { TEMPLATES, TOOLS, WEEKDAYS, TRYOUT_NOTE, describeSystem, idFor, parseDescribed, tryoutRequest } from '@x/shared/dist/baarasseur.js'

let team: Baarasseur[] = []
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const invoke = (channel: string, args: unknown) => window.ipc.invoke(channel as never, args as never) as Promise<unknown>

async function load() {
  try {
    const r = await window.ipc.invoke('workspace:readFile', { path: BAARASSEURS_PATH, encoding: 'utf8' })
    team = parseBaarasseurs(r.data)
  } catch {
    team = []
  }
  loaded = true
  emit()
}

async function save(change: (current: Baarasseur[]) => Baarasseur[], touched: { id: string; removed?: boolean }) {
  team = await saveTeam(invoke, change, touched, appLang())
  emit()
}

export function useBaarasseurs() {
  const list = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => team,
  )
  useEffect(() => { if (!loaded) void load() }, [])
  // Read again when the window comes back: the phone may have recruited one,
  // or a baarasseur kept a rule (the core writes its memory) meanwhile.
  useEffect(() => {
    const again = () => { if (loaded) void load() }
    window.addEventListener('focus', again)
    return () => window.removeEventListener('focus', again)
  }, [])
  /** Saves it; `forgotten` are the rules the person removed in the form. */
  const upsert = useCallback(async (b: Baarasseur, forgotten: string[] = []) => {
    await save(upsertChange(b, forgotten), { id: b.id })
  }, [])
  const remove = useCallback(async (id: string) => {
    await save((current) => current.filter((x) => x.id !== id), { id, removed: true })
  }, [])
  return { team: list, upsert, remove, reload: load }
}

export const templateToBaarasseur = (t: Template, taken: string[]) => fromTemplate(t, taken, appLang())

/** Avatar tints: a light ground and a dark ink by day, the reverse at night. */
export const TINTS: Record<string, string> = {
  clay: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
}
export const tint = (color: string) => TINTS[color] ?? TINTS.clay

export const HOURS = Array.from({ length: 24 }, (_, h) => h)

// Which chats are a baarasseur's: a fresh chat opened to write to one (by
// chat id), and the sessions it already holds (by run id, from the runs
// list). The chat pane reads it to show who you are talking to.
const byChat = new Map<string, string>()
let byRun = new Map<string, string>()
let chatsVersion = 0
const chatListeners = new Set<() => void>()
const emitChats = () => { chatsVersion++; chatListeners.forEach((l) => l()) }

export function noteChatAgent(chatId: string, agentId: string) {
  byChat.set(chatId, agentId)
  emitChats()
}

export function noteRunAgents(runs: Array<{ id: string; agentId: string }>) {
  const next = new Map<string, string>()
  for (const r of runs) if (baarasseurIdOf(r.agentId)) next.set(r.id, r.agentId)
  if (next.size === byRun.size && [...next].every(([k, v]) => byRun.get(k) === v)) return
  byRun = next
  emitChats()
}

/** The baarasseur a chat belongs to, if any. */
export function useChatBaarasseur(tab: { chatId: string; runId: string | null }): Baarasseur | null {
  useSyncExternalStore((l) => { chatListeners.add(l); return () => chatListeners.delete(l) }, () => chatsVersion)
  const { team: list } = useBaarasseurs()
  const agentId = (tab.runId ? byRun.get(tab.runId) : undefined) ?? byChat.get(tab.chatId)
  const id = baarasseurIdOf(agentId)
  return id ? list.find((b) => b.id === id) ?? null : null
}

// ---------------------------------------------------------------------------
// Unread (08/10/2026, validated mockup): what a baarasseur did since the
// person last opened it — a scheduled run's report, an answer that came after
// they left. Kept on this computer: when each one was last seen.

const SEEN_KEY = 'baarali.baarasseurs.seen'
let seen: Record<string, string> = (() => {
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string> } catch { return {} }
})()
let seenVersion = 0
const seenListeners = new Set<() => void>()

function writeSeen(next: Record<string, string>) {
  seen = next
  seenVersion++
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen)) } catch { /* in memory only */ }
  seenListeners.forEach((l) => l())
}

/** Its conversations read up to now (`at`: the latest one's time, when later). */
export function markBaarasseurSeen(agentId: string, at?: string) {
  const now = new Date().toISOString()
  const mark = at && at > now ? at : now
  if ((seen[agentId] ?? '') >= mark) return
  writeSeen({ ...seen, [agentId]: mark })
}

/** How many of each one's conversations moved since it was last opened, by agent id. */
export function useBaarasseurUnread(runs: Array<{ agentId: string; modifiedAt: string }>): Map<string, number> {
  useSyncExternalStore((l) => { seenListeners.add(l); return () => seenListeners.delete(l) }, () => seenVersion)
  const { team: list } = useBaarasseurs()
  // One never seen on this computer starts read: its past is not news.
  useEffect(() => {
    const missing = list.map((b) => baarasseurAgentId(b.id)).filter((a) => !(a in seen))
    if (missing.length === 0) return
    const now = new Date().toISOString()
    writeSeen({ ...seen, ...Object.fromEntries(missing.map((a) => [a, now])) })
  }, [list])
  const counts = new Map<string, number>()
  for (const r of runs) {
    const since = seen[r.agentId]
    if (!since || !baarasseurIdOf(r.agentId) || r.modifiedAt <= since) continue
    counts.set(r.agentId, (counts.get(r.agentId) ?? 0) + 1)
  }
  return counts
}

/** The hour as the person's language writes it: « 8 h », "8:00". */
export const hourWords = (h: number) => (appLang() === 'fr' ? `${h} h` : `${h}:00`)

/** Its hours in one whole sentence, for the French layer (fr.ts templates). */
export function scheduleLabel(s: BaarasseurSchedule): string {
  const at = hourWords(s.hour)
  switch (s.every) {
    case 'day': return `Every day at ${at}`
    case 'weekday': return `Weekdays at ${at}`
    case 'week': return `Every ${WEEKDAY_NAMES[s.day ?? 1]} at ${at}`
    case 'month': return `On day ${Math.max(1, s.day ?? 1)} of the month at ${at}`
  }
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
