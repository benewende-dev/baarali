// BAARALI(2026-10-09): the Studio Motion on the Mac (mockup validated by the
// founder the same day). A motion project is a HyperFrames composition the
// agent writes in the workspace, motion/<project>/index.html (the instance's
// baarali-motion tools). This reads what the studio shows from it — size,
// length, scenes, the voice and the music with its volume lane, the captions'
// pages — and builds the page the player loads.

export const MOTION_INDEX = /^motion\/([^/]+)\/index\.html$/

/** `motion/<project>` for a project's index.html, else null. */
export function motionProject(path: string): string | null {
  const m = MOTION_INDEX.exec(path)
  return m ? `motion/${m[1]}` : null
}

/** The project's folder name when a path (workspace or absolute) is a project's index.html, as the agent gives it in chat. */
export function motionProjectName(path: string): string | null {
  return /(?:^|\/)motion\/([^/]+)\/index\.html$/.exec(path)?.[1] ?? null
}

export interface LanePoint { t: number; v: number }

export interface Composition {
  title: string
  width: number
  height: number
  duration: number
  /** The scenes in time order, in video seconds. */
  scenes: Array<{ id: string; start: number; end: number }>
  voice: { id: string | null; start: number; end: number } | null
  music: { id: string | null; start: number; end: number; level: number; lane: LanePoint[] | null } | null
}

const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}
const num = (raw: string | null): number | null => (raw !== null && /^\s*\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : null)

/** The same reading of names as the instance's mix tool (motion-mix.ts). */
const MUSIC = /musi|bgm|soundtrack|jingle|instrument|ambian|beat|(^|[^a-z])(bed|fond)([^a-z]|$)/i
const VOICE = /voi[xc]|narra|speech|parole|speak|(^|[^a-z])vo([^a-z]|$)/i
const nameOf = (id: string | null, src: string | null) => `${id ?? ''} ${(src ?? '').split('/').pop() ?? ''}`

function readLane(raw: string | null): LanePoint[] | null {
  if (!raw) return null
  try {
    const lane = (JSON.parse(raw) as { lanes?: Array<{ target?: string; points?: LanePoint[] }> }).lanes?.find((l) => l.target === 'volume')
    const points = (lane?.points ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    return points.length ? points : null
  } catch {
    return null
  }
}

/** What the studio shows of a composition, or null when it has no readable root. */
export function readComposition(html: string): Composition | null {
  const root = /<[a-z]+\b([^>]*\bdata-composition-id\s*=[^>]*)>/i.exec(html)?.[1]
  if (!root) return null
  const width = num(attr(root, 'data-width'))
  const height = num(attr(root, 'data-height'))
  const duration = num(attr(root, 'data-duration'))
  if (!width || !height || !duration) return null
  const title = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim()

  const scenes: Composition['scenes'] = []
  for (const m of html.matchAll(/<section\b([^>]*)>/gi)) {
    const a = m[1]
    if (!/\bclass\s*=\s*["'][^"']*\bclip\b/i.test(a)) continue
    const start = num(attr(a, 'data-start'))
    const length = num(attr(a, 'data-duration'))
    if (start === null || length === null) continue
    scenes.push({ id: attr(a, 'id') ?? `scene-${scenes.length + 1}`, start, end: Math.min(duration, start + length) })
  }
  scenes.sort((a, b) => a.start - b.start)

  type Clip = { id: string | null; src: string | null; kind: string; start: number; end: number; volume: number | null; lane: LanePoint[] | null }
  const clips: Clip[] = []
  for (const m of html.matchAll(/<(audio|video)\b([^>]*)>/gi)) {
    const a = m[2]
    const kind = m[1].toLowerCase()
    if (kind === 'video' && !/data-has-audio\s*=\s*["']true["']/i.test(a)) continue
    const start = attr(a, 'data-start') === null ? 0 : num(attr(a, 'data-start'))
    if (start === null) continue
    const length = num(attr(a, 'data-duration'))
    clips.push({ id: attr(a, 'id'), src: attr(a, 'src'), kind, start, end: Math.min(duration, length === null ? duration : start + length), volume: num(attr(a, 'data-volume')), lane: readLane(attr(a, 'data-automation')) })
  }
  const isMusic = (c: Clip) => c.kind === 'audio' && MUSIC.test(nameOf(c.id, c.src))
  const voice = clips.find((c) => VOICE.test(nameOf(c.id, c.src))) ?? clips.find((c) => !isMusic(c)) ?? null
  const music = clips.find((c) => c !== voice && isMusic(c)) ?? (clips.filter((c) => c !== voice && c.kind === 'audio').length === 1 ? clips.find((c) => c !== voice && c.kind === 'audio')! : null)

  return {
    title,
    width,
    height,
    duration,
    scenes,
    voice: voice ? { id: voice.id, start: voice.start, end: voice.end } : null,
    music: music ? { id: music.id, start: music.start, end: music.end, level: Math.min(1, music.volume ?? 1), lane: music.lane } : null,
  }
}

export interface CaptionPage { start: number; end: number; text: string }

/**
 * The voice's passages and the captions' lines, from captions.json (words
 * with their times, as the captions tool keeps them): a new line at a pause
 * of more than 0.6 s or a sentence's end, as the captions themselves cut.
 */
export function readCaptions(json: string): { pages: CaptionPage[]; spans: Array<[number, number]> } {
  let file: { at?: unknown; words?: unknown }
  try {
    file = JSON.parse(json) as typeof file
  } catch {
    return { pages: [], spans: [] }
  }
  const at = typeof file.at === 'number' && Number.isFinite(file.at) ? file.at : 0
  const words = (Array.isArray(file.words) ? file.words : [])
    .filter((w): w is { text: string; start: number; end: number } => !!w && typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ text: w.text.trim(), start: w.start + at, end: w.end + at }))
    .filter((w) => w.text)
    .sort((a, b) => a.start - b.start)
  const pages: CaptionPage[] = []
  const spans: Array<[number, number]> = []
  let page: typeof words = []
  const close = () => {
    if (page.length) pages.push({ start: page[0].start, end: page[page.length - 1].end, text: page.map((w) => w.text).join(' ') })
    page = []
  }
  words.forEach((w, i) => {
    const gap = i > 0 ? w.start - words[i - 1].end : 0
    if (gap > 0.6) close()
    page.push(w)
    if (/[.!?…]["»”]?$/.test(w.text)) close()
    const last = spans[spans.length - 1]
    if (last && w.start - last[1] < 1.2) last[1] = Math.max(last[1], w.end)
    else spans.push([w.start, w.end])
  })
  close()
  return { pages, spans }
}

/**
 * The page the player loads: the composition with a base for its relative
 * files and HyperFrames' runtime, which the player drives (renders add it
 * themselves, so the project stays as the agent wrote it). The player keeps
 * it in an opaque sandbox: the runtime then plays the media natively, and the
 * music's volume lane still follows (element volume, checked 09/10/2026).
 */
export function previewDocument(html: string, baseUrl: string, runtimeUrl: string): string {
  const head = `<base href="${baseUrl}"><script data-hyperframes-preview-runtime src="${runtimeUrl}"></script>`
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (m) => m + head) : head + html
}

/** The volume of the music at a time, from its lane (absolute gains, as HyperFrames reads them). */
export function laneValue(lane: LanePoint[], t: number): number {
  if (t <= lane[0].t) return lane[0].v
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1]
    const b = lane[i]
    if (t <= b.t) return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t)
  }
  return lane[lane.length - 1].v
}

/** The share of its level the music keeps under the voice, read on its lane. */
export function underVoice(music: NonNullable<Composition['music']>): number {
  if (!music.lane || music.level <= 0) return 1
  const lowest = Math.min(...music.lane.filter((p) => p.t > 0.3 && p.t < music.end - music.start - 0.3).map((p) => p.v), music.level)
  return Math.round((lowest / music.level) * 100) / 100
}

/** The other formats made of a project by `reformat`: siblings named <project>-1x1, -16x9, -4x5. */
export function siblingFormats(project: string, folders: string[]): Array<{ ratio: string; project: string }> {
  const base = project.replace(/^motion\//, '').replace(/-(1x1|16x9|4x5)$/, '')
  const out = [{ ratio: '9:16', project: `motion/${base}` }]
  for (const r of ['1x1', '4x5', '16x9']) out.push({ ratio: r.replace('x', ':'), project: `motion/${base}-${r}` })
  return out.filter((f) => folders.includes(f.project.replace(/^motion\//, '')))
}
