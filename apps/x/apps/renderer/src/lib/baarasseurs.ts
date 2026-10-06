import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  BAARASSEURS_PATH, SCHEDULED_MESSAGE, baarasseurAgentId, baarasseurIdOf, parseBaarasseurs, scheduleCron,
  type Baarasseur, type BaarasseurSchedule,
} from '@x/shared/dist/baarasseur.js'
import { appLang } from '@/lib/prompt-library'
import DATA from '@/lib/baarasseurs-data.json'

// BAARALI(06/10/2026): the baarasseurs on the app side — one shared store over
// the workspace file (the core reads the same file on every turn), the tints,
// the tools one can give, and the templates of the site's carousel.

export type { Baarasseur, BaarasseurSchedule }

const SCHEDULED_MESSAGE_FR = DATA.scheduledMessage.fr

let team: Baarasseur[] = []
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

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

/**
 * Writes the team, then its hours: a removed one loses its schedule, a
 * changed one starts afresh. The file is read again first, so a rule a
 * baarasseur kept meanwhile (the core writes its memory) is not lost.
 */
async function save(change: (current: Baarasseur[]) => Baarasseur[], touched: { id: string; removed?: boolean }) {
  try {
    const r = await window.ipc.invoke('workspace:readFile', { path: BAARASSEURS_PATH, encoding: 'utf8' })
    team = parseBaarasseurs(r.data)
  } catch {
    // No file yet: the first recruit.
  }
  const next = change(team)
  team = next
  emit()
  await window.ipc.invoke('workspace:writeFile', {
    path: BAARASSEURS_PATH, data: JSON.stringify({ baarasseurs: next }, null, 2), opts: { mkdirp: true },
  })
  const agentName = baarasseurAgentId(touched.id)
  const b = next.find((x) => x.id === touched.id)
  await window.ipc.invoke('agent-schedule:deleteAgent', { agentName }).catch(() => {})
  if (!touched.removed && b?.schedule) {
    await window.ipc.invoke('agent-schedule:updateAgent', {
      agentName,
      entry: {
        schedule: { type: 'cron', expression: scheduleCron(b.schedule) },
        enabled: true,
        // Shown in its conversation: in the person's language.
        startingMessage: appLang() === 'fr' ? SCHEDULED_MESSAGE_FR : SCHEDULED_MESSAGE,
        description: `${b.name}${b.role ? ` · ${b.role}` : ''}`,
      },
    })
  }
}

export function useBaarasseurs() {
  const list = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => team,
  )
  useEffect(() => { if (!loaded) void load() }, [])
  /** Saves it; `forgotten` are the rules the person removed in the form. */
  const upsert = useCallback(async (b: Baarasseur, forgotten: string[] = []) => {
    await save((current) => {
      const stored = current.find((x) => x.id === b.id)
      if (!stored) return [...current, b]
      // Rules kept since the form opened stay, unless the person removed them.
      const memory = [...b.memory, ...stored.memory.filter((m) => !b.memory.includes(m) && !forgotten.includes(m))]
      return current.map((x) => (x.id === b.id ? { ...b, memory } : x))
    }, { id: b.id })
  }, [])
  const remove = useCallback(async (id: string) => {
    await save((current) => current.filter((x) => x.id !== id), { id, removed: true })
  }, [])
  return { team: list, upsert, remove, reload: load }
}

/** A readable, unique id from the name: « Aminata » → aminata, then aminata-2. */
export function idFor(name: string, taken: string[]): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'baarasseur'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

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

/** The tools one can give, by the name the prompt and the chips use. */
export const TOOLS = [
  'Gmail', 'Google Calendar', 'WhatsApp', 'Telegram', 'Google Sheets', 'Google Docs', 'Google Drive',
  'Outlook', 'Web search', 'Browser', 'Images and videos',
] as const

export const HOURS = Array.from({ length: 24 }, (_, h) => h)
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

type L = { fr: string; en: string }
export interface Template {
  id: string
  name: string
  color: string
  role: L
  mission: L
  tools: string[]
  schedule: BaarasseurSchedule | null
}

// The site's carousel (home-page.ts), as ready-to-recruit baarasseurs.
export const TEMPLATES = DATA.templates as Template[]

export function templateToBaarasseur(t: Template, taken: string[]): Baarasseur {
  const lang = appLang()
  return {
    id: idFor(t.name, taken), name: t.name, role: t.role[lang], mission: t.mission[lang], color: t.color,
    tools: t.tools, schedule: t.schedule, memory: [], createdAt: new Date().toISOString(),
  }
}

/** Asks the model to fill the form from a sentence. */
export function describeSystem(lang: 'fr' | 'en'): string {
  return DATA.describe.join('\n').replace('$TOOLS', JSON.stringify(TOOLS)).replace('$LANG', DATA.languages[lang])
}

/** Said to it during a try-out, after its persona. */
export const TRYOUT_NOTE = DATA.tryout

export function parseDescribed(text: string): Partial<Baarasseur> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>
    const out: Partial<Baarasseur> = {}
    if (typeof raw.name === 'string') out.name = raw.name.slice(0, 40)
    if (typeof raw.role === 'string') out.role = raw.role.slice(0, 60)
    if (typeof raw.mission === 'string') out.mission = raw.mission.slice(0, 4000)
    if (Array.isArray(raw.tools)) out.tools = raw.tools.filter((t): t is string => (TOOLS as readonly string[]).includes(t as string))
    const s = raw.schedule as Record<string, unknown> | null | undefined
    if (s === null) out.schedule = null
    else if (s && ['day', 'weekday', 'week', 'month'].includes(s.every as string) && typeof s.hour === 'number') {
      out.schedule = {
        every: s.every as BaarasseurSchedule['every'],
        hour: Math.min(23, Math.max(0, Math.round(s.hour))),
        ...(typeof s.day === 'number' ? { day: Math.min(28, Math.max(0, Math.round(s.day))) } : {}),
      }
    }
    return out
  } catch {
    return null
  }
}

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
