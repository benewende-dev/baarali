import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ChevronLeft, FileText, Loader2, Plus, SquarePen, Trash2, X } from 'lucide-react'
import { baarasseurAgentId, DOCUMENTS_DIR, DOCUMENTS_LIMIT, nextRunAt } from '@x/shared/dist/baarasseur.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ModelSelector, modelOverrideToRef, refToModelOverride } from '@/components/model-selector'
import { useModels } from '@/hooks/use-models'
import { formatRelativeTime } from '@/lib/relative-time'
import { appLang } from '@/lib/prompt-library'
import { cn } from '@/lib/utils'
import {
  HOURS, TEMPLATES, TINTS, TOOLS, WEEKDAYS, describeSystem, tryoutRequest, idFor, parseDescribed, templateToBaarasseur, tint,
  markBaarasseurSeen, scheduleLabel, useBaarasseurs, useBaarasseurUnread, type Baarasseur, type BaarasseurSchedule,
} from '@/lib/baarasseurs'

// The Baarasseurs page (Baarali, 06/10/2026; brought back to the validated
// mockup on 08/10/2026, the founder's three screens): with none open, the
// cards full width beside the app's sidebar, then the templates; one open,
// its contacts take the sidebar's place, its conversation in the middle and
// its card on the right; recruiting, the form beside a try-out.
// A baarasseur's conversations are chats whose agent is `baarasseur-<id>`.
// Strings are English and whole, for the French layer (fr.ts).

export interface BaarasseurRun { id: string; title?: string; modifiedAt: string; agentId: string }

export function Avatar({ b, size = 'md', working }: { b: Pick<Baarasseur, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg'; working?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-bold',
        size === 'sm' && 'size-7 text-xs', size === 'md' && 'size-11 text-base', size === 'lg' && 'size-20 text-3xl',
        tint(b.color),
      )}
      data-no-translate
    >
      {(b.name.trim()[0] ?? '?').toUpperCase()}
      {working && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-background bg-emerald-500" />}
    </span>
  )
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground" data-no-translate>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** A conversation's time in the contacts: the hour today, otherwise how long ago. */
function when(iso: string) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : formatRelativeTime(iso)
}

function blank(taken: string[]): Baarasseur {
  return { id: idFor('baarasseur', taken), name: '', role: '', mission: '', color: 'clay', tools: [], schedule: null, memory: [], documents: [], createdAt: new Date().toISOString() }
}

/** The newest conversation of each baarasseur, by agent id. */
function latestByAgent(runs: BaarasseurRun[]) {
  const by = new Map<string, BaarasseurRun>()
  for (const r of runs) {
    const prev = by.get(r.agentId)
    if (!prev || r.modifiedAt > prev.modifiedAt) by.set(r.agentId, r)
  }
  return by
}

const fileName = (path: string) => path.split('/').pop() ?? path

export function BaarasseursView({ runs, workingAgents, openAgent, onOpen, onClose, chatHost, hasChat }: {
  runs: BaarasseurRun[]
  /** The agents with a turn running now: a green dot on their avatar. */
  workingAgents: Set<string>
  /** The baarasseur whose conversation is open (agent id), if any. */
  openAgent: string | null
  /** Opens its conversation: the run to resume, or null for a fresh one. */
  onOpen: (agentId: string, runId: string | null) => void
  onClose: () => void
  /** Where the app mounts the open conversation. */
  chatHost: (element: HTMLDivElement | null) => void
  hasChat: boolean
}) {
  const { team, upsert, remove } = useBaarasseurs()
  const unread = useBaarasseurUnread(runs)
  const [editing, setEditing] = useState<{ draft: Baarasseur; isNew: boolean } | null>(null)
  const latest = useMemo(() => latestByAgent(runs), [runs])
  const taken = team.map((b) => b.id)
  const open = team.find((b) => baarasseurAgentId(b.id) === openAgent) ?? null

  // The open one is read as its conversations move.
  const openLatest = openAgent ? latest.get(openAgent)?.modifiedAt : undefined
  useEffect(() => {
    if (openAgent && !editing) markBaarasseurSeen(openAgent, openLatest)
  }, [openAgent, openLatest, editing])

  const openOne = (b: Baarasseur) => {
    setEditing(null)
    const agentId = baarasseurAgentId(b.id)
    onOpen(agentId, latest.get(agentId)?.id ?? null)
  }

  if (editing) {
    return (
      <Recruit
        initial={editing.draft}
        isNew={editing.isNew}
        onCancel={() => setEditing(null)}
        onSave={async (b, forgotten) => {
          const id = editing.isNew ? idFor(b.name, taken) : b.id
          await upsert({ ...b, id }, forgotten)
          setEditing(null)
          if (editing.isNew) onOpen(baarasseurAgentId(id), null)
        }}
        onRemove={editing.isNew ? undefined : async () => {
          await remove(editing.draft.id)
          setEditing(null)
          if (openAgent === baarasseurAgentId(editing.draft.id)) onClose()
        }}
      />
    )
  }

  if (open) {
    return (
      <div className="flex min-h-0 flex-1">
        <Contacts team={team} latest={latest} unread={unread} workingAgents={workingAgents} openAgent={openAgent} onOpen={openOne} onBack={onClose} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Conversation b={open} chatHost={chatHost} hasChat={hasChat}
            onEdit={() => setEditing({ draft: open, isNew: false })}
            onNew={() => onOpen(baarasseurAgentId(open.id), null)} />
        </div>
      </div>
    )
  }

  return (
    <Overview team={team} latest={latest} unread={unread} workingAgents={workingAgents} taken={taken} onOpen={openOne}
      onRecruit={(draft) => setEditing({ draft, isNew: true })} />
  )
}

/** One open: the others as contacts, in the sidebar's place. */
function Contacts({ team, latest, unread, workingAgents, openAgent, onOpen, onBack }: {
  team: Baarasseur[]
  latest: Map<string, BaarasseurRun>
  unread: Map<string, number>
  workingAgents: Set<string>
  openAgent: string | null
  onOpen: (b: Baarasseur) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // As in a messenger: the latest conversation first.
  const contacts = team
    .filter((b) => !q || `${b.name} ${b.role}`.toLowerCase().includes(q))
    .sort((a, b) => (latest.get(baarasseurAgentId(b.id))?.modifiedAt ?? b.createdAt).localeCompare(latest.get(baarasseurAgentId(a.id))?.modifiedAt ?? a.createdAt))
  return (
    <aside aria-label="Baarasseurs" className="flex w-[280px] shrink-0 flex-col border-r border-border bg-muted/30">
      <button type="button" onClick={onBack}
        className="mx-2 mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
        <ChevronLeft className="size-4" /><span>Your baarasseurs</span>
      </button>
      {team.length > 6 && (
        <div className="px-3 pb-1 pt-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search" className="h-8" />
        </div>
      )}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3 pt-2">
        {contacts.map((b) => {
          const agentId = baarasseurAgentId(b.id)
          const run = latest.get(agentId)
          const active = agentId === openAgent
          return (
            <button key={b.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onOpen(b)}
              className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 text-left', active ? 'bg-primary/10' : 'hover:bg-muted')}>
              <Avatar b={b} working={workingAgents.has(agentId)} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold" data-no-translate>{b.name}</b>
                <span className="block truncate text-[13px] text-muted-foreground" data-no-translate>{run?.title || b.role}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {run && <span className="text-[11px] tabular-nums text-muted-foreground" data-no-translate>{when(run.modifiedAt)}</span>}
                {!active && <UnreadBadge count={unread.get(agentId) ?? 0} />}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

/** The open conversation: its header, the chat, and its card beside it. */
function Conversation({ b, chatHost, hasChat, onEdit, onNew }: {
  b: Baarasseur
  chatHost: (element: HTMLDivElement | null) => void
  hasChat: boolean
  onEdit: () => void
  onNew: () => void
}) {
  const { namesByKey } = useModels()
  const modelName = b.model ? namesByKey[`${b.provider ?? ''}/${b.model}`] ?? b.model : null
  const next = b.schedule ? nextRunAt(b.schedule, new Date()) : null
  const documents = b.documents ?? []
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-2.5">
        <Avatar b={b} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold" data-no-translate>{b.name}</h2>
          <div className="truncate text-[13px] text-muted-foreground">
            {b.role && <span data-no-translate>{b.role} · </span>}
            {modelName ? <span data-no-translate>{modelName}</span> : <span>Automatic</span>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onNew} aria-label="New conversation" title="New conversation">
          <SquarePen className="size-4" />
        </Button>
        <Button variant="outline" onClick={onEdit}>Edit</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div ref={chatHost} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!hasChat && <div className="m-auto"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
        </div>
        <aside aria-label="Its card" className="hidden w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border px-6 py-5 xl:flex">
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Mission</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" data-no-translate>{b.mission}</p>
          </section>
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Works on its own</h3>
            <p className="text-sm">{b.schedule ? scheduleLabel(b.schedule) : 'Only when I write'}</p>
            {next && (
              <p className="text-sm text-muted-foreground">
                {`Next run: ${next.toLocaleDateString(appLang() === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
              </p>
            )}
          </section>
          {b.tools.length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">Tools</h3>
              <div className="flex flex-wrap gap-1.5">{b.tools.map((t) => <span key={t} className="rounded-md bg-muted px-2 py-1 text-[13px]">{t}</span>)}</div>
            </section>
          )}
          {documents.length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">Its documents</h3>
              <ul className="space-y-1.5">
                {documents.map((d) => (
                  <li key={d} className="flex items-center gap-2 text-sm"><FileText className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate" data-no-translate>{fileName(d)}</span></li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">What it remembers</h3>
            {b.memory.length > 0
              ? <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{b.memory.map((m) => <li key={m} data-no-translate>{m}</li>)}</ul>
              : <p className="text-sm text-muted-foreground">Nothing yet: give it a rule and it keeps it.</p>}
          </section>
        </aside>
      </div>
    </>
  )
}

/** With none open: every card, then the templates. */
function Overview({ team, latest, unread, workingAgents, taken, onOpen, onRecruit }: {
  team: Baarasseur[]
  latest: Map<string, BaarasseurRun>
  unread: Map<string, number>
  workingAgents: Set<string>
  taken: string[]
  onOpen: (b: Baarasseur) => void
  onRecruit: (draft: Baarasseur) => void
}) {
  const { namesByKey } = useModels()
  const templates = TEMPLATES.filter((t) => !team.some((b) => b.name === t.name))
  const lang = appLang()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-8 py-9">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[34px] font-semibold leading-tight tracking-tight">Your baarasseurs</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">Workers who work for you: each one has a name, a mission, its tools and its model.</p>
          </div>
          <Button size="lg" onClick={() => onRecruit(blank(taken))}><Plus className="size-4" /><span>Recruit</span></Button>
        </div>

        {team.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {team.map((b) => {
              const agentId = baarasseurAgentId(b.id)
              const run = latest.get(agentId)
              const count = unread.get(agentId) ?? 0
              const modelName = b.model ? namesByKey[`${b.provider ?? ''}/${b.model}`] ?? b.model : null
              return (
                <button key={b.id} type="button" onClick={() => onOpen(b)}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-5 text-left transition-colors hover:border-primary/50">
                  <span className="flex items-center gap-3">
                    <Avatar b={b} working={workingAgents.has(agentId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold" data-no-translate>{b.name}</span>
                      <span className="block truncate text-sm text-muted-foreground" data-no-translate>{b.role}</span>
                    </span>
                    <UnreadBadge count={count} />
                  </span>
                  <span className="line-clamp-2 text-[15px] leading-relaxed" data-no-translate>{b.mission}</span>
                  {b.tools.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {b.tools.map((t) => <span key={t} className="rounded-md bg-muted px-2.5 py-1 text-[13px]">{t}</span>)}
                    </span>
                  )}
                  <span className="mt-auto flex items-center gap-3 border-t border-border pt-3 text-[13px]">
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {modelName ? <span data-no-translate>{modelName}</span> : <span>Automatic</span>}
                      {b.schedule && <><span aria-hidden> · </span><span className="lowercase">{scheduleLabel(b.schedule)}</span></>}
                    </span>
                    {run?.title && (
                      <span className={cn('max-w-[55%] truncate', count > 0 ? 'font-medium text-primary' : 'text-muted-foreground')} data-no-translate>{run.title}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-base font-semibold">No baarasseur yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Recruit your first one: describe it in a sentence, or start from a template below.</p>
          </div>
        )}

        {templates.length > 0 && (
          <section aria-labelledby="baarasseur-templates" className="flex flex-col gap-3">
            <h2 id="baarasseur-templates" className="text-base font-semibold">Start from a template</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {templates.map((t) => (
                <button key={t.id} type="button"
                  className="flex flex-col gap-0.5 rounded-xl border border-dashed border-border px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
                  onClick={() => onRecruit(templateToBaarasseur(t, taken))}>
                  <span className="truncate text-[15px] font-semibold" data-no-translate>{t.role[lang]}</span>
                  <span className="truncate text-sm text-muted-foreground" data-no-translate>{t.summary[lang]}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type Turn = { role: 'user' | 'assistant'; text: string }

/** The hours one picks in one go; anything else is set by hand. */
const PRESETS: Array<BaarasseurSchedule | null> = [
  null,
  { every: 'day', hour: 8 },
  { every: 'day', hour: 18 },
  { every: 'weekday', hour: 8 },
  { every: 'week', day: 1, hour: 8 },
  { every: 'week', day: 5, hour: 17 },
  { every: 'month', day: 1, hour: 8 },
  { every: 'month', day: 5, hour: 8 },
]
const presetKey = (s: BaarasseurSchedule | null | undefined) => (s ? `${s.every}-${s.day ?? ''}-${s.hour}` : 'never')
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function Recruit({ initial, isNew, onCancel, onSave, onRemove }: {
  initial: Baarasseur
  isNew: boolean
  onCancel: () => void
  onSave: (b: Baarasseur, forgotten: string[]) => Promise<void>
  onRemove?: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [b, setB] = useState<Baarasseur>({ ...initial, documents: initial.documents ?? [] })
  const [tab, setTab] = useState<'describe' | 'setup'>(isNew && !initial.mission ? 'describe' : 'setup')
  const [sentence, setSentence] = useState('')
  const [busy, setBusy] = useState<'describe' | 'save' | 'try' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trial, setTrial] = useState<Turn[]>([])
  const [ask, setAsk] = useState('')
  const [picking, setPicking] = useState(false)
  const [custom, setCustom] = useState(() => !PRESETS.some((p) => presetKey(p) === presetKey(initial.schedule)))
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Baarasseur>) => setB((cur) => ({ ...cur, ...patch }))
  const named = b.name.trim().length > 0
  const documents = b.documents ?? []
  const kept = initial.documents ?? []

  const describe = async () => {
    if (!sentence.trim()) return
    setBusy('describe'); setError(null)
    try {
      const res = await window.ipc.invoke('llm:generate', { prompt: sentence.trim(), system: describeSystem(appLang()) })
      const filled = res.text ? parseDescribed(res.text) : null
      if (!filled) throw new Error(res.error ?? 'empty')
      setB((cur) => ({ ...cur, ...filled }))
      setCustom(!PRESETS.some((p) => presetKey(p) === presetKey(filled.schedule ?? null)))
      setTab('setup')
    } catch {
      setError('Baarali could not prepare it. Try again, or set it up yourself.')
    } finally {
      setBusy(null)
    }
  }

  const tryOut = async () => {
    const text = ask.trim()
    if (!text || busy) return
    const turns: Turn[] = [...trial, { role: 'user', text }]
    setTrial(turns); setAsk(''); setBusy('try')
    try {
      const res = await window.ipc.invoke('llm:generate', tryoutRequest(b, turns))
      setTrial([...turns, { role: 'assistant', text: res.text?.trim() || '…' }])
    } catch {
      setTrial([...turns, { role: 'assistant', text: '…' }])
    } finally {
      setBusy(null)
    }
  }

  // Its documents go to its own folder in the workspace at once; the list is
  // what the save keeps. A file dropped then let go is removed on leaving.
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy('upload'); setError(null)
    const added: string[] = []
    try {
      for (const file of files) {
        if (documents.length + added.length >= DOCUMENTS_LIMIT) { setError(`${DOCUMENTS_LIMIT} documents at most.`); break }
        if (file.size > MAX_DOCUMENT_BYTES) { setError(`${file.name} is too large (15 MB at most).`); continue }
        const safe = file.name.normalize('NFC').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)
        const path = `${DOCUMENTS_DIR}/${b.id}/${safe}`
        await window.ipc.invoke('workspace:writeFile', { path, data: await readBase64(file), opts: { encoding: 'base64', mkdirp: true } })
        if (!documents.includes(path) && !added.includes(path)) added.push(path)
      }
    } catch {
      setError('A document could not be added. Try again.')
    } finally {
      if (added.length) setB((cur) => ({ ...cur, documents: [...(cur.documents ?? []), ...added] }))
      setBusy(null)
    }
  }
  const dropFiles = (paths: string[]) => {
    for (const path of paths) void window.ipc.invoke('workspace:remove', { path }).catch(() => {})
  }

  const cancel = () => {
    dropFiles(documents.filter((d) => !kept.includes(d)))
    onCancel()
  }

  const save = async () => {
    if (!named) { setTab('setup'); setError('Give it a name first.'); return }
    setBusy('save'); setError(null)
    try {
      await onSave({ ...b, name: b.name.trim(), role: b.role.trim(), mission: b.mission.trim() }, initial.memory.filter((m) => !b.memory.includes(m)))
      dropFiles(kept.filter((d) => !documents.includes(d)))
    } catch {
      setError('Could not save. Try again.')
      setBusy(null)
    }
  }

  const schedule = b.schedule ?? null
  const pickPreset = (key: string) => {
    if (key === 'custom') { setCustom(true); if (!schedule) set({ schedule: { every: 'week', day: 1, hour: 8 } }); return }
    setCustom(false)
    set({ schedule: PRESETS.find((p) => presetKey(p) === key) ?? null })
  }
  const setEvery = (every: BaarasseurSchedule['every']) => set({
    schedule: { every, hour: schedule?.hour ?? 8, ...(every === 'week' || every === 'month' ? { day: 1 } : {}) },
  })
  const select = 'h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <button type="button" aria-label="Back" onClick={cancel} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="flex-1 text-base font-semibold">
          {isNew ? <span>Recruit a baarasseur</span> : <><span>Edit</span> <span data-no-translate>{initial.name}</span></>}
        </h1>
        <div role="tablist" aria-label="How to set it up" className="flex gap-0.5 rounded-lg bg-muted p-1">
          {(['describe', 'setup'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn('rounded-md px-3.5 py-1.5 text-[13px] font-medium', tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
              {t === 'describe' ? 'Describe' : 'Set up'}
            </button>
          ))}
        </div>
        {onRemove && (confirming ? (
          <span className="flex items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1 text-[13px]">
            <span>Remove this baarasseur?</span>
            <Button size="sm" variant="destructive" onClick={() => void onRemove()}>Remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </span>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setConfirming(true)}><Trash2 className="size-4" /></Button>
        ))}
        <Button size="lg" onClick={() => void save()} disabled={busy === 'save' || busy === 'upload'}>
          {busy === 'save' && <Loader2 className="size-4 animate-spin" />}
          {!isNew ? <span>Save</span> : named ? <span>{`Recruit ${b.name.trim()}`}</span> : <span>Recruit</span>}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-wrap">
        <div className="min-w-0 flex-[999_1_520px] overflow-y-auto border-r border-border px-8 py-7">
          {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
          {tab === 'describe' ? (
            <div className="flex max-w-2xl flex-col gap-3">
              <label htmlFor="baarasseur-sentence" className="text-sm font-medium">Describe it in a sentence</label>
              <Textarea id="baarasseur-sentence" rows={4} value={sentence} onChange={(e) => setSentence(e.target.value)}
                placeholder="E.g. Someone who follows up with my customers every Monday and prepares my quotes"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void describe() }} />
              <p className="text-xs text-muted-foreground">Baarali fills in the form; you check it before recruiting.</p>
              <div><Button onClick={() => void describe()} disabled={!sentence.trim() || busy === 'describe'}>
                {busy === 'describe' && <Loader2 className="size-4 animate-spin" />}<span>Prepare</span>
              </Button></div>
            </div>
          ) : (
            <div className="flex max-w-2xl flex-col gap-6">
              <div className="flex items-start gap-5">
                <div className="relative flex flex-col items-center gap-1.5">
                  <Avatar b={{ name: b.name || '?', color: b.color }} size="lg" />
                  <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking}
                    className="text-[13px] font-medium text-primary hover:underline">Change</button>
                  {picking && (
                    <div role="radiogroup" aria-label="Colour"
                      className="absolute top-full z-10 mt-1 flex gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-md">
                      {Object.keys(TINTS).map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={b.color === c} aria-label={c}
                          onClick={() => { set({ color: c }); setPicking(false) }}
                          className={cn('size-6 rounded-full', tint(c), b.color === c && 'ring-2 ring-primary ring-offset-1 ring-offset-background')} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Name</span>
                    <Input value={b.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className="h-10" data-no-translate /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Role</span>
                    <Input value={b.role} maxLength={60} onChange={(e) => set({ role: e.target.value })} className="h-10" data-no-translate /></label>
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Mission</span>
                <Textarea rows={5} value={b.mission} maxLength={4000} onChange={(e) => set({ mission: e.target.value })} className="text-[15px] leading-relaxed" data-no-translate />
                <span className="text-xs font-normal text-muted-foreground">Write as you would to a new hire: what to do, how, and what never to do.</span>
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Tools</legend>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((t) => {
                    const on = b.tools.includes(t)
                    return (
                      <label key={t}
                        className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                          on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted')}>
                        <input type="checkbox" checked={on} className="size-4 accent-primary"
                          onChange={() => set({ tools: on ? b.tools.filter((x) => x !== t) : [...b.tools, t] })} />
                        <span>{t}</span>
                      </label>
                    )
                  })}
                </div>
                <span className="text-xs text-muted-foreground">Sending, posting or paying always waits for your approval.</span>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 text-sm font-medium"><span>Model</span>
                  <ModelSelector variant="field" inheritDefault={{ label: 'Automatic' }}
                    value={modelOverrideToRef(b.model, b.provider)}
                    onChange={(sel) => { const o = refToModelOverride(sel); set({ model: o.model, provider: o.provider }) }} />
                </div>
                <div className="flex flex-col gap-1.5 text-sm font-medium"><span>Works on its own</span>
                  <select aria-label="Works on its own" className={select}
                    value={custom ? 'custom' : presetKey(schedule)} onChange={(e) => pickPreset(e.target.value)}>
                    {PRESETS.map((p) => <option key={presetKey(p)} value={presetKey(p)}>{p ? scheduleLabel(p) : 'Only when I write'}</option>)}
                    <option value="custom">Other hours…</option>
                  </select>
                </div>
              </div>
              {custom && schedule && (
                <div className="-mt-3 flex flex-wrap gap-2">
                  <select aria-label="How often" className={select} value={schedule.every} onChange={(e) => setEvery(e.target.value as BaarasseurSchedule['every'])}>
                    <option value="day">Every day</option>
                    <option value="weekday">Weekdays</option>
                    <option value="week">Every week</option>
                    <option value="month">Monthly</option>
                  </select>
                  {schedule.every === 'week' && (
                    <select aria-label="Day" className={select} value={schedule.day ?? 1} onChange={(e) => set({ schedule: { ...schedule, day: Number(e.target.value) } })}>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </select>
                  )}
                  {schedule.every === 'month' && (
                    <select aria-label="Day of the month" className={select} data-no-translate value={schedule.day ?? 1} onChange={(e) => set({ schedule: { ...schedule, day: Number(e.target.value) } })}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                  <select aria-label="Hour" className={select} data-no-translate value={schedule.hour} onChange={(e) => set({ schedule: { ...schedule, hour: Number(e.target.value) } })}>
                    {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Its documents</span>
                <div role="button" tabIndex={0} aria-label="Add documents"
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click() } }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)) }}
                  className={cn('flex min-h-12 cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm',
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40')}>
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  {documents.map((d) => (
                    <span key={d} className="flex items-center gap-1 rounded-md bg-muted py-0.5 pl-2 pr-1 text-[13px]" onClick={(e) => e.stopPropagation()}>
                      <span className="max-w-[220px] truncate" data-no-translate>{fileName(d)}</span>
                      <button type="button" aria-label="Remove" className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => set({ documents: documents.filter((x) => x !== d) })}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {busy === 'upload'
                    ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    : <span className="text-muted-foreground">{documents.length ? 'Drop other files here' : 'Drop its files here: price list, catalogue, procedures…'}</span>}
                </div>
                <input ref={fileInput} type="file" multiple hidden
                  onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              </div>

              {!isNew && b.memory.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">What it remembers</h2>
                  <ul className="flex flex-col gap-1.5">
                    {b.memory.map((m, i) => (
                      <li key={`${i}-${m}`} className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px]">
                        <span className="flex-1" data-no-translate>{m}</span>
                        <button type="button" aria-label="Forget" className="text-muted-foreground hover:text-foreground"
                          onClick={() => set({ memory: b.memory.filter((_, j) => j !== i) })}>
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <section aria-label="Try-out" className="flex min-h-[320px] min-w-0 flex-[1_1_380px] flex-col bg-muted/40">
          <div className="flex flex-wrap items-center gap-2 px-6 py-4 text-sm">
            <span className="flex-1 font-medium text-muted-foreground">Try it before recruiting</span>
            <span className="text-[13px] text-muted-foreground">Nothing is sent during the try-out</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-3">
            {trial.map((t, i) => t.role === 'user' ? (
              <div key={i} className="max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground" data-no-translate>{t.text}</div>
            ) : (
              <div key={i} className="flex max-w-[88%] gap-2.5">
                <Avatar b={{ name: b.name || '?', color: b.color }} size="sm" />
                <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-background px-4 py-2.5 text-sm leading-relaxed" data-no-translate>{t.text}</div>
              </div>
            ))}
            {busy === 'try' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <form className="m-5 mt-0 flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-3"
            onSubmit={(e) => { e.preventDefault(); void tryOut() }}>
            <input value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Message for the try-out"
              placeholder={named ? `Write to ${b.name}…` : 'Write a message…'} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button type="submit" aria-label="Send" disabled={!ask.trim() || busy === 'try'}
              className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
