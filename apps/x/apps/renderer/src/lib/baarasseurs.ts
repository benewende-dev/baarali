import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  BAARASSEURS_PATH, baarasseurIdOf, parseBaarasseurs, saveTeam, upsertChange, templateToBaarasseur as fromTemplate,
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
