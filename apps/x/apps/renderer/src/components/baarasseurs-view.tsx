import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUp, Check, Loader2, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'
import { baarasseurAgentId } from '@x/shared/dist/baarasseur.js'
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
  useBaarasseurs, type Baarasseur, type BaarasseurSchedule,
} from '@/lib/baarasseurs'

// The Baarasseurs page (Baarali, 06/10/2026, validated mockup
// claude.ai/artifact/E332orsDPVrPkekqKbL6Pi): the person's named agents as
// cards, templates to recruit from, and the recruit form with a try-out.
// A baarasseur's conversations are chats whose agent is `baarasseur-<id>`;
// « Write » opens its latest one in the Assistant, or a fresh one.
// Strings are English and whole, for the French layer (fr.ts).

export interface BaarasseurRun { id: string; title?: string; modifiedAt: string; agentId: string }

export function Avatar({ b, size = 'md' }: { b: Pick<Baarasseur, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold',
        size === 'sm' && 'size-7 text-xs', size === 'md' && 'size-11 text-base', size === 'lg' && 'size-16 text-2xl',
        tint(b.color),
      )}
      data-no-translate
    >
      {(b.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

function Hours({ s }: { s: BaarasseurSchedule }) {
  const at = <span data-no-translate>{`${String(s.hour).padStart(2, '0')}:00`}</span>
  switch (s.every) {
    case 'day': return <span><span>Every day</span> · {at}</span>
    case 'weekday': return <span><span>Weekdays</span> · {at}</span>
    case 'week': return <span><span>{`Every ${WEEKDAYS[s.day ?? 1]}`}</span> · {at}</span>
    case 'month': return <span><span>Monthly</span> · <span data-no-translate>{s.day ?? 1}</span> · {at}</span>
  }
}

function blank(taken: string[]): Baarasseur {
  return { id: idFor('baarasseur', taken), name: '', role: '', mission: '', color: 'clay', tools: [], schedule: null, memory: [], createdAt: new Date().toISOString() }
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

/**
 * The page, as WhatsApp lays it out (the founder's call, 06/10/2026): the
 * baarasseurs as contacts on the left, the open one's conversation on the
 * right with its card beside it. With none open, the right side is the
 * overview: every card, and the templates to recruit from.
 */
export function BaarasseursView({ runs, openAgent, onOpen, onClose, chatHost, hasChat }: {
  runs: BaarasseurRun[]
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
  const [editing, setEditing] = useState<{ draft: Baarasseur; isNew: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const latest = useMemo(() => latestByAgent(runs), [runs])
  const taken = team.map((b) => b.id)
  const open = team.find((b) => baarasseurAgentId(b.id) === openAgent) ?? null
  const q = query.trim().toLowerCase()
  // Contacts as in a messenger: the latest conversation first.
  const contacts = team
    .filter((b) => !q || `${b.name} ${b.role}`.toLowerCase().includes(q))
    .sort((a, b) => (latest.get(baarasseurAgentId(b.id))?.modifiedAt ?? b.createdAt).localeCompare(latest.get(baarasseurAgentId(a.id))?.modifiedAt ?? a.createdAt))

  const openOne = (b: Baarasseur) => {
    setEditing(null)
    const agentId = baarasseurAgentId(b.id)
    onOpen(agentId, latest.get(agentId)?.id ?? null)
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Baarasseurs" className="flex w-[290px] shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h1 className="flex-1 font-serif text-xl font-semibold tracking-tight">Baarasseurs</h1>
          <Button size="sm" onClick={() => { onClose(); setEditing({ draft: blank(taken), isNew: true }) }}>
            <Plus className="size-4" /><span>Recruit</span>
          </Button>
        </div>
        {team.length > 3 && (
          <div className="px-3 pb-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search" className="h-8" />
          </div>
        )}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {contacts.map((b) => {
            const agentId = baarasseurAgentId(b.id)
            const run = latest.get(agentId)
            const active = agentId === openAgent && !editing
            return (
              <button key={b.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => openOne(b)}
                className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 text-left', active ? 'bg-primary/10' : 'hover:bg-muted')}>
                <Avatar b={b} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <b className="flex-1 truncate text-sm font-semibold" data-no-translate>{b.name}</b>
                    {run && <span className="shrink-0 text-[11px] text-muted-foreground" data-no-translate>{formatRelativeTime(run.modifiedAt)}</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground" data-no-translate>{run?.title || b.role}</span>
                </span>
              </button>
            )
          })}
          {team.length === 0 && <p className="px-3 py-4 text-[13px] text-muted-foreground">Your baarasseurs appear here, like contacts.</p>}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {editing ? (
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
        ) : open ? (
          <Conversation b={open} chatHost={chatHost} hasChat={hasChat}
            onEdit={() => setEditing({ draft: open, isNew: false })}
            onNew={() => onOpen(baarasseurAgentId(open.id), null)} />
        ) : (
          <Overview team={team} latest={latest} taken={taken} onOpen={openOne}
            onRecruit={(draft) => setEditing({ draft, isNew: true })} />
        )}
      </div>
    </div>
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
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-2.5">
        <Avatar b={b} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold" data-no-translate>{b.name}</h2>
          <div className="truncate text-xs text-muted-foreground">
            {b.role && <span data-no-translate>{b.role} · </span>}
            {modelName ? <span data-no-translate>{modelName}</span> : <span>Automatic</span>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onNew}><Plus className="size-3.5" /><span>New conversation</span></Button>
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="size-3.5" /><span>Edit</span></Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div ref={chatHost} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!hasChat && <div className="m-auto"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
        </div>
        <aside aria-label="Its card" className="hidden w-[260px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border px-5 py-5 xl:flex">
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">Mission</h3>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed" data-no-translate>{b.mission}</p>
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">Works on its own</h3>
            <p className="text-[13px]">{b.schedule ? <Hours s={b.schedule} /> : <span>Only when I write</span>}</p>
          </section>
          {b.tools.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">Tools</h3>
              <div className="flex flex-wrap gap-1.5">{b.tools.map((t) => <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t}</span>)}</div>
            </section>
          )}
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">What it remembers</h3>
            {b.memory.length > 0
              ? <ul className="list-disc space-y-1 pl-4 text-[13px]">{b.memory.map((m) => <li key={m} data-no-translate>{m}</li>)}</ul>
              : <p className="text-[13px] text-muted-foreground">Nothing yet: give it a rule and it keeps it.</p>}
          </section>
        </aside>
      </div>
    </>
  )
}

/** With no conversation open: every card, then the templates. */
function Overview({ team, latest, taken, onOpen, onRecruit }: {
  team: Baarasseur[]
  latest: Map<string, BaarasseurRun>
  taken: string[]
  onOpen: (b: Baarasseur) => void
  onRecruit: (draft: Baarasseur) => void
}) {
  const { namesByKey } = useModels()
  const templates = TEMPLATES.filter((t) => !team.some((b) => b.name === t.name))
  const lang = appLang()
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-7">
        <div>
          <h2 className="font-serif text-[28px] font-semibold tracking-tight">Your baarasseurs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Workers who work for you: each one has a name, a mission, its tools and its model.</p>
        </div>
        {team.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {team.map((b) => {
              const run = latest.get(baarasseurAgentId(b.id))
              const modelName = b.model ? namesByKey[`${b.provider ?? ''}/${b.model}`] ?? b.model : null
              return (
                <button key={b.id} type="button" onClick={() => onOpen(b)}
                  className="flex flex-col gap-2.5 rounded-xl border border-border p-4 text-left hover:border-primary/50">
                  <span className="flex items-center gap-3">
                    <Avatar b={b} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold" data-no-translate>{b.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground" data-no-translate>{b.role}</span>
                    </span>
                    <MessageSquare className="size-4 text-muted-foreground" />
                  </span>
                  <span className="line-clamp-3 text-[13px] leading-relaxed text-foreground/80" data-no-translate>{b.mission}</span>
                  {b.tools.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {b.tools.map((t) => <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t}</span>)}
                    </span>
                  )}
                  <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
                    {modelName ? <span data-no-translate>{modelName}</span> : <span>Automatic</span>}
                    {b.schedule && <><span aria-hidden>·</span><Hours s={b.schedule} /></>}
                    {run && <span className="ml-auto" data-no-translate>{formatRelativeTime(run.modifiedAt)}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center">
            <p className="text-[15px] font-semibold">No baarasseur yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Recruit your first one: describe it in a sentence, or start from a template below.</p>
          </div>
        )}
        {templates.length > 0 && (
          <section aria-labelledby="baarasseur-templates" className="flex flex-col gap-2.5">
            <h2 id="baarasseur-templates" className="text-sm font-semibold">Start from a template</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {templates.map((t) => (
                <button key={t.id} type="button"
                  className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left hover:border-primary/60 hover:bg-primary/5"
                  onClick={() => onRecruit(templateToBaarasseur(t, taken))}>
                  <Avatar b={{ name: t.name, color: t.color }} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold" data-no-translate>{t.name} · {t.role[lang]}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground" data-no-translate>{t.mission[lang]}</span>
                  </span>
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

function Recruit({ initial, isNew, onCancel, onSave, onRemove }: {
  initial: Baarasseur
  isNew: boolean
  onCancel: () => void
  onSave: (b: Baarasseur, forgotten: string[]) => Promise<void>
  onRemove?: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [b, setB] = useState<Baarasseur>(initial)
  const [tab, setTab] = useState<'describe' | 'setup'>(isNew && !initial.mission ? 'describe' : 'setup')
  const [sentence, setSentence] = useState('')
  const [busy, setBusy] = useState<'describe' | 'save' | 'try' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trial, setTrial] = useState<Turn[]>([])
  const [ask, setAsk] = useState('')
  const set = (patch: Partial<Baarasseur>) => setB((cur) => ({ ...cur, ...patch }))
  const named = b.name.trim().length > 0

  const describe = async () => {
    if (!sentence.trim()) return
    setBusy('describe'); setError(null)
    try {
      const res = await window.ipc.invoke('llm:generate', { prompt: sentence.trim(), system: describeSystem(appLang()) })
      const filled = res.text ? parseDescribed(res.text) : null
      if (!filled) throw new Error(res.error ?? 'empty')
      setB((cur) => ({ ...cur, ...filled }))
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

  const save = async () => {
    if (!named) { setTab('setup'); setError('Give it a name first.'); return }
    setBusy('save'); setError(null)
    try {
      await onSave({ ...b, name: b.name.trim(), role: b.role.trim(), mission: b.mission.trim() }, initial.memory.filter((m) => !b.memory.includes(m)))
    } catch {
      setError('Could not save. Try again.')
      setBusy(null)
    }
  }

  const schedule = b.schedule
  const setEvery = (every: string) => set({
    schedule: every === 'never' ? null : { every: every as BaarasseurSchedule['every'], hour: schedule?.hour ?? 8, ...(every === 'week' ? { day: 1 } : every === 'month' ? { day: 1 } : {}) },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <button type="button" aria-label="Back" onClick={onCancel} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="flex-1 text-[15px] font-semibold">
          {isNew ? <span>Recruit a baarasseur</span> : <><span>Edit</span> <span data-no-translate>{initial.name}</span></>}
        </h1>
        <div role="tablist" aria-label="How to set it up" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {(['describe', 'setup'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium', tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
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
          <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setConfirming(true)}><Trash2 className="size-4" /></Button>
        ))}
        <Button onClick={() => void save()} disabled={busy === 'save'}>
          {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {isNew ? <span>Recruit</span> : <span>Save</span>}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-wrap">
        <div className="min-w-0 flex-[999_1_520px] overflow-y-auto border-r border-border px-7 py-6">
          {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
          {tab === 'describe' ? (
            <div className="flex max-w-xl flex-col gap-3">
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
            <div className="flex max-w-xl flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar b={{ name: b.name || '?', color: b.color }} size="lg" />
                  <div className="flex max-w-[84px] flex-wrap justify-center gap-1" role="radiogroup" aria-label="Colour">
                    {Object.keys(TINTS).map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={b.color === c} aria-label={c} onClick={() => set({ color: c })}
                        className={cn('size-4 rounded-full', tint(c), b.color === c && 'ring-2 ring-primary ring-offset-1 ring-offset-background')} />
                    ))}
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Name</span>
                    <Input value={b.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} data-no-translate /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Role</span>
                    <Input value={b.role} maxLength={60} onChange={(e) => set({ role: e.target.value })} data-no-translate /></label>
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium"><span>Mission</span>
                <Textarea rows={5} value={b.mission} maxLength={4000} onChange={(e) => set({ mission: e.target.value })} data-no-translate />
                <span className="text-xs font-normal text-muted-foreground">Write as you would to a new hire: what to do, how, and what never to do.</span>
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Tools</legend>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((t) => {
                    const on = b.tools.includes(t)
                    return (
                      <button key={t} type="button" aria-pressed={on}
                        onClick={() => set({ tools: on ? b.tools.filter((x) => x !== t) : [...b.tools, t] })}
                        className={cn('rounded-lg border px-2.5 py-1.5 text-[13px]', on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted')}>
                        {t}
                      </button>
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
                  <div className="flex gap-2">
                    <select aria-label="How often" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                      value={schedule?.every ?? 'never'} onChange={(e) => setEvery(e.target.value)}>
                      <option value="never">Only when I write</option>
                      <option value="day">Every day</option>
                      <option value="weekday">Weekdays</option>
                      <option value="week">Every week</option>
                      <option value="month">Monthly</option>
                    </select>
                    {schedule?.every === 'week' && (
                      <select aria-label="Day" className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={schedule.day ?? 1} onChange={(e) => set({ schedule: { ...schedule, day: Number(e.target.value) } })}>
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                      </select>
                    )}
                    {schedule?.every === 'month' && (
                      <select aria-label="Day of the month" className="h-9 rounded-md border border-input bg-background px-2 text-sm" data-no-translate
                        value={schedule.day ?? 1} onChange={(e) => set({ schedule: { ...schedule, day: Number(e.target.value) } })}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                    {schedule && (
                      <select aria-label="Hour" className="h-9 rounded-md border border-input bg-background px-2 text-sm" data-no-translate
                        value={schedule.hour} onChange={(e) => set({ schedule: { ...schedule, hour: Number(e.target.value) } })}>
                        {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
                      </select>
                    )}
                  </div>
                </div>
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

        <section aria-label="Try-out" className="flex min-h-[320px] min-w-0 flex-[1_1_340px] flex-col bg-muted/40">
          <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 text-sm font-medium text-muted-foreground">
            <span className="flex-1">Try it before recruiting</span>
            <span className="text-xs font-normal">No tools during a try-out: nothing is sent</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-3">
            {trial.map((t, i) => t.role === 'user' ? (
              <div key={i} className="max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] text-primary-foreground" data-no-translate>{t.text}</div>
            ) : (
              <div key={i} className="flex max-w-[88%] gap-2.5">
                <Avatar b={{ name: b.name || '?', color: b.color }} size="sm" />
                <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-background px-3.5 py-2 text-[13px] leading-relaxed" data-no-translate>{t.text}</div>
              </div>
            ))}
            {busy === 'try' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <form className="m-4 mt-0 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2"
            onSubmit={(e) => { e.preventDefault(); void tryOut() }}>
            <input value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Message for the try-out"
              placeholder={named ? `Write to ${b.name}…` : 'Write a message…'} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button type="submit" aria-label="Send" disabled={!ask.trim() || busy === 'try'}
              className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
