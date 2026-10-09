// BAARALI(2026-10-09): the Studio Motion on the Mac, in place of the raw HTML
// preview of a motion project (mockup validated by the founder the same day).
// HyperFrames' own player plays the composition with its sound, fitted to
// the pane; under it the scenes, the captions, the voice and the music's
// volume; beside it the export and the mix, through the instance's
// baarali-motion tools (their structured answers, PR #176).
import '@hyperframes/player'
import runtimeUrl from '@hyperframes/core/runtime?url'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircleIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from 'lucide-react'
import { useFileViewerSource } from './file-viewer-source'
import {
  laneValue, motionProject, previewDocument, readCaptions, readComposition, siblingFormats, underVoice,
  type CaptionPage, type Composition,
} from '@/lib/motion-project'

const SERVER = 'baarali-motion'
const POLL_MS = 3000

const FORMATS = [
  { id: 'mp4', name: 'MP4', use: 'TikTok, Reels, YouTube Shorts' },
  { id: 'mp4-light', name: 'Light MP4', use: 'WhatsApp status and messages' },
  { id: 'gif', name: 'GIF', use: 'No sound, for a message' },
  { id: 'webm', name: 'Transparent WebM', use: 'An overlay to lay on a video' },
] as const
type FormatId = (typeof FORMATS)[number]['id']

/** What the baarali-motion tools answer as data (structuredContent, instance PR #176). */
interface Answer {
  export?: ExportState
  refused?: { code: string }
  allowance?: Allowance
  mix?: Record<string, unknown>
}
interface ExportState { id: string; format: string; status: string; progress?: number; file?: string; error?: string }
interface Allowance { period: 'week' | 'month'; usedSeconds: number; totalSeconds: number }
type Exporting = { kind: 'idle' } | { kind: 'running'; state: ExportState } | { kind: 'done'; file: string } | { kind: 'error'; message: string }

/** A baarali-motion tool's structured answer; null when it gave none (an older instance, or no tool). */
async function callTool(toolName: string, input: Record<string, unknown>): Promise<Answer | null> {
  const { result } = await window.ipc.invoke('mcp:executeTool', { serverName: SERVER, toolName, input })
  return (result as { structuredContent?: Answer } | null)?.structuredContent ?? null
}

const REFUSALS: Record<string, string> = {
  insufficient_media_credits: 'No export minutes left, and not enough media credits.',
  composition_errors: 'The project has errors: ask the agent to fix them.',
}

function exportMessage(answer: Answer | null): string {
  if (answer?.refused) return REFUSALS[answer.refused.code] ?? 'Export is unavailable right now.'
  const status = answer?.export?.status
  if (status === 'failed') return 'The export failed. Its minutes were given back.'
  if (status === 'lost') return 'The file was lost on the way. It was refunded: export again.'
  return 'Export is unavailable right now.'
}

/** The player's frame, as big as the stage allows at the composition's ratio. */
function useFit(ratio: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const w = Math.min(width, height * ratio)
      setSize({ width: Math.floor(w), height: Math.floor(w / ratio) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ratio])
  return { ref, size }
}

export function MotionStudio({ path }: { path: string }) {
  const source = useFileViewerSource()
  // Keyed by path where it is mounted: a new path is a new studio.
  const [project, setProject] = useState(() => motionProject(path)!)
  const [html, setHtml] = useState<string | null>(null)
  const [captions, setCaptions] = useState<{ pages: CaptionPage[]; spans: Array<[number, number]> }>({ pages: [], spans: [] })
  const [exports, setExports] = useState<Array<{ path: string; name: string; size: number }>>([])
  const [siblings, setSiblings] = useState<Array<{ ratio: string; project: string }>>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  // The page is read again after a mix or on Reload; the files around it after an export too.
  const [version, setVersion] = useState(0)
  const [filesVersion, setFilesVersion] = useState(0)

  const reload = useCallback(() => { setVersion((v) => v + 1); setFilesVersion((v) => v + 1) }, [])
  const refreshFiles = useCallback(() => setFilesVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    source.read({ path: `${project}/index.html`, encoding: 'utf8' })
      .then((index) => { if (!cancelled) { setLoadError(null); setHtml(index.data) } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [project, source, version])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [caps, files, folders] = await Promise.all([
        source.read({ path: `${project}/captions.json`, encoding: 'utf8' }).then((r) => readCaptions(r.data)).catch(() => ({ pages: [], spans: [] })),
        window.ipc.invoke('workspace:readdir', { path: `${project}/exports` }).catch(() => []),
        window.ipc.invoke('workspace:readdir', { path: 'motion' }).catch(() => []),
      ])
      if (cancelled) return
      setCaptions(caps)
      setExports(files.filter((f) => f.kind === 'file').map((f) => ({ path: f.path, name: f.name, size: f.stat?.size ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)))
      setSiblings(siblingFormats(project, folders.filter((f) => f.kind === 'dir').map((f) => f.name)))
    })()
    return () => { cancelled = true }
  }, [project, source, filesVersion])

  const comp = useMemo(() => (html ? readComposition(html) : null), [html])

  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <AlertCircleIcon className="size-6 text-destructive" />
        <p className="text-sm font-medium text-foreground">Could not read the project</p>
        <p className="max-w-md text-xs" data-no-translate>{loadError}</p>
      </div>
    )
  }
  if (!html || !comp) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin" />
        <p className="text-sm">Loading the studio…</p>
      </div>
    )
  }
  return <Studio key={`${project}-${version}`} project={project} html={html} comp={comp} captions={captions} exports={exports} siblings={siblings} onProject={(next) => { setHtml(null); setProject(next) }} onReload={reload} onFiles={refreshFiles} url={source.url} />
}

function Studio({ project, html, comp, captions, exports, siblings, onProject, onReload, onFiles, url }: {
  project: string
  html: string
  comp: Composition
  captions: { pages: CaptionPage[]; spans: Array<[number, number]> }
  exports: Array<{ path: string; name: string; size: number }>
  siblings: Array<{ ratio: string; project: string }>
  onProject: (project: string) => void
  onReload: () => void
  onFiles: () => void
  url: (path: string) => string
}) {
  const D = comp.duration
  const vertical = comp.height > comp.width
  const { ref: stageRef, size } = useFit(comp.width / comp.height)
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLElement & { currentTime: number; seek: (t: number) => void } | null>(null)
  const [time, setTime] = useState(0)
  const [safeZones, setSafeZones] = useState(false)
  const [watching, setWatching] = useState<string | null>(null)

  // The player, made once per project version: a custom element React does not know.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const player = document.createElement('hyperframes-player') as HTMLElement & { currentTime: number; seek: (t: number) => void }
    player.setAttribute('controls', '')
    // No same-origin: the page is the agent's, it must not reach the app.
    player.setAttribute('sandbox-origin', 'opaque')
    player.style.cssText = 'display:block;width:100%;height:100%'
    if (watching) {
      player.setAttribute('type', watching.endsWith('.webm') ? 'video/webm' : 'video/mp4')
      player.setAttribute('src', url(watching))
    } else {
      const base = url(`${project}/`)
      player.setAttribute('srcdoc', previewDocument(html, base, new URL(runtimeUrl, window.location.href).href))
    }
    const onTime = () => setTime(player.currentTime || 0)
    player.addEventListener('timeupdate', onTime)
    holder.appendChild(player)
    playerRef.current = player
    return () => {
      player.removeEventListener('timeupdate', onTime)
      player.remove()
      playerRef.current = null
    }
  }, [html, project, url, watching])

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(D, t))
    playerRef.current?.seek(clamped)
    setTime(clamped)
  }
  const pct = (t: number) => `${(Math.max(0, Math.min(D, t)) / D) * 100}%`
  const laneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    seek(((e.clientX - r.left) / r.width) * D)
  }
  const voiceSpans = captions.spans.length ? captions.spans : comp.voice ? [[comp.voice.start, comp.voice.end] as [number, number]] : []

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" data-no-translate>{comp.title || project.replace(/^motion\//, '')}</div>
          <div className="truncate text-xs text-muted-foreground"><span data-no-translate>{project}</span> · {formatSeconds(D)}</div>
        </div>
        <div className="flex-1" />
        {siblings.length > 1 && (
          <div className="flex overflow-hidden rounded-md border border-border">
            {siblings.map((s) => (
              <button key={s.project} type="button" onClick={() => { setWatching(null); onProject(s.project) }}
                className={`border-r border-border px-2.5 py-1 text-xs last:border-r-0 ${s.project === project ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {s.ratio}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onReload} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCwIcon className="size-3.5" />Reload
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center gap-2 bg-muted/30 p-4">
            <div ref={stageRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
              <div className="relative overflow-hidden rounded-lg bg-black" style={{ width: size.width, height: size.height }}>
                <div ref={holderRef} className="absolute inset-0" />
                {safeZones && vertical && !watching && (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-x-0 bottom-0 h-[15%] border-t border-dashed border-red-400/80 bg-red-500/15" />
                    <div className="absolute bottom-[15%] right-0 top-0 w-[15%] border-l border-dashed border-red-400/80 bg-red-500/15" />
                    <span className="absolute bottom-1 left-2 text-[10px] text-red-200">TikTok and Reels buttons</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {watching ? (
                <>
                  <span className="text-xs text-muted-foreground">Export preview</span>
                  <Chip on={false} onClick={() => setWatching(null)}>Back to the project</Chip>
                </>
              ) : vertical && (
                <Chip on={safeZones} onClick={() => setSafeZones((v) => !v)}>Network zones</Chip>
              )}
            </div>
          </div>

          {!watching && (
            <div className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-1.5 border-t border-border px-4 py-3">
              <LaneName>Scenes</LaneName>
              <Lane onClick={laneClick} head={pct(time)}>
                {comp.scenes.map((s, i) => (
                  <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); seek(s.start + 0.01) }}
                    className="absolute inset-y-1 overflow-hidden rounded bg-accent px-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
                    style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)} - 2px)` }}>
                    {sceneLabel(i + 1)}
                  </button>
                ))}
              </Lane>
              {captions.pages.length > 0 && (
                <>
                  <LaneName>Captions</LaneName>
                  <Lane onClick={laneClick} head={pct(time)}>
                    {captions.pages.map((p, i) => (
                      <div key={i} className="absolute inset-y-1 overflow-hidden whitespace-nowrap rounded bg-accent px-1 text-[10px] leading-[18px] text-muted-foreground"
                        style={{ left: pct(p.start), width: `calc(${pct(p.end)} - ${pct(p.start)})` }} data-no-translate>{p.text}</div>
                    ))}
                  </Lane>
                </>
              )}
              {voiceSpans.length > 0 && (
                <>
                  <LaneName>Voice</LaneName>
                  <Lane onClick={laneClick} head={pct(time)}>
                    {voiceSpans.map(([s, e], i) => (
                      <div key={i} className="absolute inset-y-1.5 rounded-sm bg-primary/70" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />
                    ))}
                  </Lane>
                </>
              )}
              {comp.music && (
                <>
                  <LaneName>Music</LaneName>
                  <Lane onClick={laneClick} head={pct(time)}><MusicCurve comp={comp} /></Lane>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border p-4">
          <ExportPanel project={project} duration={D} onDone={(file) => { onFiles(); setWatching(file) }} />
          {comp.music && !watching && <MixPanel project={project} comp={comp} onMixed={onReload} />}
          <section className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground">Exported files</h3>
            {exports.length === 0 && <p className="text-xs text-muted-foreground">No export yet</p>}
            {exports.map((f) => (
              <div key={f.path} className="flex items-center gap-2 border-t border-border py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate" data-no-translate>{f.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(f.size)}</span>
                <button type="button" aria-label="Play" onClick={() => setWatching(f.path)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><PlayIcon className="size-3" /></button>
                <button type="button" onClick={() => { void window.ipc.invoke('workspace:exportCopy', { path: f.path }) }} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Save…</button>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}

function ExportPanel({ project, duration, onDone }: { project: string; duration: number; onDone: (file: string) => void }) {
  const [format, setFormat] = useState<FormatId>('mp4')
  const [state, setState] = useState<Exporting>({ kind: 'idle' })
  const [allowance, setAllowance] = useState<Allowance | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const readAllowance = useCallback(() => {
    callTool('export_minutes', {}).then((a) => { if (alive.current && a?.allowance) setAllowance(a.allowance) }).catch(() => {})
  }, [])
  useEffect(readAllowance, [readAllowance])

  const follow = useCallback(async (answer: Answer | null) => {
    for (;;) {
      if (!alive.current) return
      const exp = answer?.export
      if (!exp || answer?.refused || exp.status === 'failed' || exp.status === 'lost' || exp.status === 'unknown') {
        setState({ kind: 'error', message: exportMessage(answer) })
        readAllowance()
        return
      }
      if (exp.status === 'done' && exp.file) {
        setState({ kind: 'done', file: exp.file })
        readAllowance()
        onDone(exp.file)
        return
      }
      setState({ kind: 'running', state: exp })
      await new Promise((r) => setTimeout(r, POLL_MS))
      answer = await callTool('render_status', { id: exp.id, project, format: exp.format, wait: false }).catch(() => null)
    }
  }, [onDone, project, readAllowance])

  const start = async () => {
    setState({ kind: 'running', state: { id: '', format, status: 'queued' } })
    const answer = await callTool('render', { project, format, wait: false }).catch(() => null)
    await follow(answer)
  }

  const left = allowance ? Math.max(0, allowance.totalSeconds - allowance.usedSeconds) : null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-muted-foreground">Export</h3>
      <div className="flex flex-col gap-1.5">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFormat(f.id)}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left ${format === f.id ? 'border-primary' : 'border-border hover:bg-accent/50'}`}>
            <span className={`size-3 shrink-0 rounded-full border-2 ${format === f.id ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_var(--background)]' : 'border-muted-foreground/50'}`} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{f.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{f.use}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" disabled={state.kind === 'running'} onClick={() => void start()}
        className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
        {exportLabel(duration)}
      </button>
      {state.kind === 'running' && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{state.state.status === 'queued' ? 'Waiting for a free machine…' : renderingLabel(Math.round((state.state.progress ?? 0) * 100))}</span>
          <div className="h-1 overflow-hidden rounded bg-accent"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((state.state.progress ?? 0) * 100)}%` }} /></div>
        </div>
      )}
      {state.kind === 'done' && <p className="text-xs text-muted-foreground">Exported</p>}
      {state.kind === 'error' && <p className="text-xs text-destructive">{state.message}</p>}
      {left !== null && allowance && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{minutesLeft(left, allowance)}</p>
          <div className="h-1 overflow-hidden rounded bg-accent"><div className="h-full bg-primary" style={{ width: `${allowance.totalSeconds ? (left / allowance.totalSeconds) * 100 : 0}%` }} /></div>
        </div>
      )}
    </section>
  )
}

function MixPanel({ project, comp, onMixed }: { project: string; comp: Composition; onMixed: () => void }) {
  const music = comp.music!
  const [level, setLevel] = useState(Math.round(music.level * 100))
  const [under, setUnder] = useState(Math.round(underVoice(music) * 100))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const commit = async (next: { level: number; under: number }) => {
    setBusy(true)
    setFailed(false)
    const answer = await callTool('mix', { project, ...(music.id ? { music: music.id } : {}), level: next.level / 100, under_voice: next.under / 100 }).catch(() => null)
    setBusy(false)
    if (answer?.mix) onMixed()
    else setFailed(true)
  }
  const db = under > 0 ? `${Math.round(20 * Math.log10(under / 100))} dB`.replace('-', '−') : null
  return (
    <section className="flex flex-col gap-2 text-xs">
      <h3 className="font-semibold text-muted-foreground">Mix</h3>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between"><span className="text-muted-foreground">Music level</span><span>{level} %</span></span>
        <input type="range" min={0} max={100} value={level} disabled={busy} className="accent-primary"
          onChange={(e) => setLevel(Number(e.target.value))} onPointerUp={() => void commit({ level, under })} onKeyUp={() => void commit({ level, under })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between"><span className="text-muted-foreground">Under the voice</span><span>{db ?? <>muted</>}</span></span>
        <input type="range" min={0} max={100} value={under} disabled={busy} className="accent-primary"
          onChange={(e) => setUnder(Number(e.target.value))} onPointerUp={() => void commit({ level, under })} onKeyUp={() => void commit({ level, under })} />
      </label>
      {busy && <span className="text-muted-foreground">Mixing…</span>}
      {failed && <span className="text-destructive">The mix could not be redone.</span>}
    </section>
  )
}

/** The music's volume, drawn from its lane (or flat at its level). */
function MusicCurve({ comp }: { comp: Composition }) {
  const m = comp.music!
  const D = comp.duration
  const points: Array<[number, number]> = m.lane
    ? m.lane.map((p) => [m.start + p.t, p.v] as [number, number])
    : [[m.start, m.level], [m.end, m.level]]
  if (m.lane) points.push([m.end, laneValue(m.lane, m.end - m.start)])
  const d = points.map(([t, v], i) => `${i ? 'L' : 'M'}${((Math.min(t, D) / D) * 1000).toFixed(1)} ${(24 - Math.min(1, v) * 21).toFixed(1)}`).join(' ')
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 26" preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L${((Math.min(m.end, D) / D) * 1000).toFixed(1)} 26 L${((m.start / D) * 1000).toFixed(1)} 26 Z`} fill="rgb(201 162 39 / 0.22)" />
      <path d={d} fill="none" stroke="rgb(201 162 39)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${on ? 'border-foreground/40 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  )
}

function LaneName({ children }: { children: React.ReactNode }) {
  return <span className="text-right text-[11px] text-muted-foreground">{children}</span>
}

function Lane({ children, onClick, head }: { children: React.ReactNode; onClick: (e: React.MouseEvent<HTMLDivElement>) => void; head: string }) {
  return (
    <div className="relative h-[26px] cursor-pointer overflow-hidden rounded bg-muted/50" onClick={onClick}>
      {children}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground" style={{ left: head }} />
    </div>
  )
}

// The texts with a value, written whole so the app's translation finds them.
const formatSeconds = (s: number) => `${Math.round(s * 10) / 10} s`
const sceneLabel = (n: number) => `Scene ${n}`
const exportLabel = (seconds: number) => `Export · ${Math.round(seconds * 10) / 10} s`
const renderingLabel = (pct: number) => `Rendering… ${pct} %`
const minutesLeft = (seconds: number, a: Allowance) =>
  `${Math.round((seconds / 60) * 10) / 10} min of export left ${a.period === 'week' ? 'this week' : 'this month'}, out of ${Math.round(a.totalSeconds / 60)}.`
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}
