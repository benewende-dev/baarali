import type { CaptionWord } from './motion-captions.js';

// The mix (Studio Motion step 4): the music bed comes down while the voice
// speaks and back up in its real pauses, as a volume lane on the music clip —
// HyperFrames' data-automation, which the preview plays and the render bakes
// into the samples (no point limit there). The voice's timing is the words
// the captions already transcribed (captions.json), so mixing a captioned
// video costs nothing more.

export const AUTOMATION_ATTR = 'data-automation';
/** HyperFrames refuses more points in a lane. */
const MAX_POINTS = 512;
/** The music starts coming down this long before the first word… */
const ATTACK = 0.3;
/** …and is back up this long after the last. */
const RELEASE = 0.8;
/** Words closer than this are one passage: the music does not pump between sentences. */
const HOLD_GAP = 1.2;

export interface AudioClip {
  /** The opening tag as written, to find it again. */
  tag: string;
  index: number;
  kind: 'audio' | 'video';
  id: string | null;
  src: string | null;
  /** Seconds in the video, or null when the start is not a number (relative to another clip). */
  start: number | null;
  duration: number | null;
  volume: number | null;
  hasAudio: boolean;
  automated: boolean;
}

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
const value = (attrs: string, name: string) => {
  const m = attr(attrs, name);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
const num = (raw: string | null) => (raw !== null && /^\s*\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : null);

/** The composition's <audio> clips, and the <video> clips that keep their sound. */
export function audioClips(html: string): AudioClip[] {
  const out: AudioClip[] = [];
  for (const m of html.matchAll(/<(audio|video)\b([^>]*)>/gi)) {
    const kind = m[1].toLowerCase() as 'audio' | 'video';
    const attrs = m[2];
    const hasAudio = kind === 'audio' || /data-has-audio\s*=\s*["']true["']/i.test(attrs);
    if (!hasAudio) continue;
    out.push({
      tag: m[0],
      index: m.index!,
      kind,
      id: value(attrs, 'id'),
      src: value(attrs, 'src'),
      start: value(attrs, 'data-start') === null ? 0 : num(value(attrs, 'data-start')),
      duration: num(value(attrs, 'data-duration')),
      volume: num(value(attrs, 'data-volume')),
      hasAudio,
      automated: attr(attrs, AUTOMATION_ATTR) !== null,
    });
  }
  return out;
}

/** What a clip's name says it holds: a music bed, not a voice. */
export function isMusic(clip: Pick<AudioClip, 'id' | 'src' | 'kind'>): boolean {
  if (clip.kind !== 'audio') return false;
  const name = `${clip.id ?? ''} ${(clip.src ?? '').split('/').pop() ?? ''}`;
  return /musi|bgm|soundtrack|jingle|instrument|ambian|beat|(^|[^a-z])(bed|fond)([^a-z]|$)/i.test(name);
}

/** What a clip's name says it holds: a voice. */
export function isVoice(clip: Pick<AudioClip, 'id' | 'src'>): boolean {
  const name = `${clip.id ?? ''} ${(clip.src ?? '').split('/').pop() ?? ''}`;
  return /voi[xc]|narra|speech|parole|speak|(^|[^a-z])vo([^a-z]|$)/i.test(name);
}

/** The voice's passages in the video, in seconds: words closer than HOLD_GAP make one. */
export function speechSpans(words: CaptionWord[], at: number, gap = HOLD_GAP): [number, number][] {
  const spans: [number, number][] = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const s = w.start + at;
    const e = Math.max(w.end, w.start) + at;
    const last = spans[spans.length - 1];
    if (last && s - last[1] < gap) last[1] = Math.max(last[1], e);
    else spans.push([s, e]);
  }
  return spans;
}

export interface DuckOptions {
  /** The music clip's start and length in the video. */
  clipStart: number;
  clipDuration: number;
  /** The music's level when nobody speaks, 0..1. */
  level: number;
  /** Its share of that level under the voice, 0..1. */
  underVoice: number;
  fadeIn: number;
  fadeOut: number;
}

export interface LanePoint {
  t: number;
  v: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The music's volume lane, in clip seconds: down under each passage, faded in and out. */
export function duckLane(spans: [number, number][], o: DuckOptions): LanePoint[] {
  const D = o.clipDuration;
  const local = spans
    .map(([s, e]) => [s - o.clipStart, e - o.clipStart] as [number, number])
    .filter(([s, e]) => e + RELEASE > 0 && s - ATTACK < D);
  // 1 away from the voice, underVoice under it, linear ramps between.
  const duck = (t: number) => {
    let f = 1;
    for (const [s, e] of local) {
      const g = t < s - ATTACK || t > e + RELEASE ? 1 : t < s ? 1 - ((t - (s - ATTACK)) / ATTACK) * (1 - o.underVoice) : t <= e ? o.underVoice : o.underVoice + ((t - e) / RELEASE) * (1 - o.underVoice);
      f = Math.min(f, g);
    }
    return f;
  };
  const fadeIn = Math.min(o.fadeIn, D / 2);
  const fadeOut = Math.min(o.fadeOut, D / 2);
  const fade = (t: number) => Math.min(fadeIn > 0 ? Math.min(1, t / fadeIn) : 1, fadeOut > 0 ? Math.min(1, (D - t) / fadeOut) : 1);
  const times = new Set<number>([0, D, fadeIn, D - fadeOut]);
  for (const [s, e] of local) for (const t of [s - ATTACK, s, e, e + RELEASE]) if (t > 0 && t < D) times.add(round(t));
  const sorted = [...times].map(round).sort((a, b) => a - b);
  const points = sorted.filter((t, i) => i === 0 || t > sorted[i - 1]).map((t) => ({ t, v: round(o.level * duck(t) * fade(t)) }));
  // Drop the points on a straight line between their neighbours.
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const a = points[i - 1];
    const b = points[i + 1];
    return Math.abs(a.v + ((b.v - a.v) * (p.t - a.t)) / (b.t - a.t) - p.v) > 0.001;
  });
}

/** The lane within HyperFrames' limit: a long talk merges its passages until it fits. */
export function fittedLane(words: CaptionWord[], at: number, o: DuckOptions): LanePoint[] {
  let gap = HOLD_GAP;
  let lane = duckLane(speechSpans(words, at, gap), o);
  while (lane.length > MAX_POINTS) {
    gap *= 1.5;
    lane = duckLane(speechSpans(words, at, gap), o);
  }
  return lane;
}

/**
 * The music's opening tag with the lane, in place of any earlier one, and
 * its level as data-volume so the next mix starts from it.
 */
export function withLane(html: string, clip: AudioClip, lane: LanePoint[], level: number): string {
  const json = JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: lane }] });
  const bare = clip.tag.replace(new RegExp(`\\s(?:${AUTOMATION_ATTR}|data-volume)\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '');
  const tag = bare.replace(/\s*\/?>$/, (end) => ` data-volume="${level}" ${AUTOMATION_ATTR}='${json}'${end.trim() === '/>' ? ' />' : '>'}`);
  return html.slice(0, clip.index) + tag + html.slice(clip.index + clip.tag.length);
}
