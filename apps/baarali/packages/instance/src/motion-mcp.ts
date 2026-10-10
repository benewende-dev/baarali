import fs from 'node:fs/promises';
import path from 'node:path';
import { compose, contrast, DEFAULT_BRAND, FORMATS, isPrint, PALETTE_LIMIT, PRINT_SIZES, TEMPLATES, type BrandKit, type Format } from './motion-templates.js';
import type { ToolDef, ToolResult } from './media-mcp.js';
import { CAPTIONS_FILE, CAPTIONS_START, captionsBlock, findVoice, injectCaptions, POSITIONS, rootOf, type CaptionsFile, type CaptionWord, type Position } from './motion-captions.js';
import { audioClips, fittedLane, isMusic, speechSpans, withLane } from './motion-mix.js';

// The Studio Motion's tools (decided 08/10/2026): an MCP server the instance
// registers beside baarali-media, so every chat — the assistant, each
// baarasseur, the Mac and the phone — can make motion design on request.
// A project is a HyperFrames composition folder in the workspace,
// motion/<slug>/index.html, which the agent then edits with its file tools.
// The brand kit is config/brand.json. Rendering to MP4 comes with the render
// service (the next step); `check` is the structural part of HyperFrames'
// lint that needs no dependency, the full lint runs before each render.
// `render` sends the folder through the control plane to the render service
// (packages/render): minutes included in the plan, then media credits.

export const MOTION_DIR = 'motion';
export const BRAND_FILE = 'config/brand.json';

export interface MotionToolsDeps {
  workDir: string;
  now: () => number;
  /** The control plane, for exports; unset: `render` says export is unavailable. */
  control?: { url: string; token: string; fetch: typeof fetch; sleep: (ms: number) => Promise<void> };
}

export const EXPORT_FORMATS = ['mp4', 'mp4-light', 'gif', 'webm'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];
const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { mp4: 'mp4', 'mp4-light': 'mp4', gif: 'gif', webm: 'webm' };
/**
 * How long `render` and `render_status` wait in one call. Under the core's
 * MCP client, which gives up on a tool after 60 s: at 75 s (until
 * 08/10/2026) a long render came back to the agent as an error, and it
 * started the export again.
 */
export const RENDER_WAIT_MS = 45_000;
const RENDER_POLL_MS = 4_000;
/** As the render service. */
const MAX_EXPORT_BYTES = 150 * 1024 * 1024;
const EXPORTS_DIR = 'exports';
const PREVIEWS_DIR = 'previews';
export const MAX_PREVIEW_FRAMES = 6;
/**
 * The core's MCP client gives up on a tool after 60 s. A cold render
 * machine, its browser and the review fit in it most of the time; past this,
 * the agent is told to call again on the machine now warm.
 */
const PREVIEW_TIMEOUT_MS = 55_000;
/** The page needs no sound to be seen: the voice and the music stay home. */
const SOUND_FILES = /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i;

/**
 * When to look at a composition: once per scene, at 70 % of it (its
 * entrances have landed, its exit has not started), evenly chosen when there
 * are more scenes than frames; without scenes, across the whole video.
 */
export function previewTimes(html: string, max = MAX_PREVIEW_FRAMES): number[] {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
  const duration = Number(/\bdata-duration\s*=\s*["']?([\d.]+)/i.exec(root)?.[1]) || 0;
  const scenes: number[] = [];
  for (const m of html.matchAll(/<(section|div)\b([^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*)>/gi)) {
    const start = Number(/\bdata-start="([\d.]+)"/.exec(m[2])?.[1]);
    const length = Number(/\bdata-duration="([\d.]+)"/.exec(m[2])?.[1]);
    if (Number.isFinite(start) && length > 0) scenes.push(Math.round((start + length * 0.7) * 10) / 10);
  }
  const unique = [...new Set(scenes)].sort((a, b) => a - b);
  if (unique.length === 0) return duration > 0 ? [0.15, 0.4, 0.65, 0.9].map((f) => Math.round(duration * f * 10) / 10) : [0];
  if (unique.length <= max) return unique;
  return Array.from({ length: max }, (_, i) => unique[Math.round((i * (unique.length - 1)) / (max - 1))]);
}

/**
 * The frames a poster takes: those asked for, else the template's pages
 * (data-poster-at), else the last frame — a video's final pose. Null when
 * the root has no duration.
 */
export function posterTimes(html: string, asked?: unknown): number[] | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
  const duration = Number(/\bdata-duration\s*=\s*["']?([\d.]+)/i.exec(root)?.[1]);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const last = Math.floor((duration - 1 / 30) * 100) / 100;
  const keep = (ts: number[]) => [...new Set(ts.filter((t) => Number.isFinite(t) && t >= 0).map((t) => Math.min(t, last)))].slice(0, 4);
  const given = Array.isArray(asked) ? keep(asked.filter((t): t is number => typeof t === 'number')) : [];
  if (given.length) return given;
  const pages = keep((/\bdata-poster-at="([\d.,]+)"/.exec(root)?.[1] ?? '').split(',').filter(Boolean).map(Number));
  return pages.length ? pages : [last];
}

/** A project folder as the render service receives it, without its exports, previews and sidecar files. */
async function packProject(dir: string, opts: { sound: boolean }): Promise<{ files: Array<{ path: string; data: string }>; total: number }> {
  const files: Array<{ path: string; data: string }> = [];
  let total = 0;
  const walk = async (sub: string) => {
    for (const entry of await fs.readdir(path.join(dir, sub), { withFileTypes: true })) {
      const relPath = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.') || (!sub && [EXPORTS_DIR, PREVIEWS_DIR, 'project.json', CAPTIONS_FILE].includes(entry.name))) continue;
      if (entry.isDirectory()) await walk(relPath);
      else if (entry.isFile() && (opts.sound || !SOUND_FILES.test(entry.name))) {
        const bytes = await fs.readFile(path.join(dir, relPath));
        total += bytes.length;
        files.push({ path: relPath, data: bytes.toString('base64') });
      }
    }
  };
  await walk('');
  return { files, total };
}

export const MOTION_TOOLS: ToolDef[] = [
  {
    name: 'brand_kit',
    description:
      "Read the user's brand kit (name, logo, colours, other brand colours, fonts, tone), or change it with `set`. Every new motion project uses it. Ask the user for their brand once, then keep it here.",
    inputSchema: {
      type: 'object',
      properties: {
        set: {
          type: 'object',
          description: 'Only the fields to change.',
          properties: {
            name: { type: 'string', description: 'The brand or business name, as it is written.' },
            logo: { type: ['string', 'null'], description: 'Workspace path of the logo (SVG or PNG), or null to remove it.' },
            colors: {
              type: 'object',
              properties: {
                background: { type: 'string', description: '#rrggbb' },
                ink: { type: 'string', description: '#rrggbb, the text on the background' },
                accent: { type: 'string', description: '#rrggbb' },
                highlight: { type: 'string', description: '#rrggbb, for the key figure or word' },
              },
            },
            palette: {
              type: 'array',
              items: { type: 'string' },
              description: `The brand's other colours, #rrggbb, up to ${PALETTE_LIMIT}; the whole list replaces the old one. For chart series, shapes and free edits (CSS --brand-1, --brand-2…).`,
            },
            fonts: { type: 'object', properties: { display: { type: 'string', description: 'A Google Fonts family for titles' }, text: { type: 'string', description: 'A Google Fonts family for text' } } },
            tone: { type: 'string', enum: ['energetic', 'warm', 'premium'] },
          },
        },
      },
    },
  },
  {
    name: 'list_templates',
    description: 'List the motion templates, what each is for, its slots (with examples) and its length.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'new_project',
    description:
      'Start a motion project from a template, filled with the given slot values and the brand kit, in a format. Writes motion/<slug>/index.html (a HyperFrames composition) and returns its path. Then edit that file with the file tools for anything the template does not do, and call `check`.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'A template id from list_templates.' },
        title: { type: 'string', description: 'A short title for the project, in the user’s words.' },
        format: { type: 'string', enum: Object.keys(FORMATS), description: '9:16 for TikTok, Reels and WhatsApp Status; 1:1 or 4:5 for a feed; 16:9 for YouTube, a banner or a screen. Paper, for a poster to print: A3, A4, A5, A6, carte (business card 85 × 55 mm). Default: the template’s own (9:16 for videos).' },
        values: { type: 'object', description: 'Slot key → text. A list slot takes one item per line. Missing slots keep the template example: always fill them from the user’s request.' },
        speed: { type: 'number', description: 'Rhythm: 0.8 calm, 1 normal, 1.2 punchy. Default from the brand tone.' },
      },
      required: ['template', 'title'],
    },
  },
  {
    name: 'reformat',
    description: 'Make the same template project in another format (e.g. the 1:1 and 16:9 versions of a 9:16 promo), as a sibling project. Hand edits made to the original are not carried over: say so.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        format: { type: 'string', enum: Object.keys(FORMATS) },
      },
      required: ['project', 'format'],
    },
  },
  {
    name: 'poster',
    description:
      'Export a motion project as a still image: a poster, a status, a post, a flyer, a business card. On a screen format (9:16, 1:1, 4:5, 16:9), a PNG at full size (1080 px wide) for WhatsApp and the networks. On paper (A3, A4, A5, A6, carte), a PDF for the printer — vector, at the true size in millimetres, 3 mm of bleed and crop marks — and a PNG at 300 dpi cut to size. Takes the frame given by `at`; by default the poster templates’ own pages (a card’s two sides), else the last frame of the video (its final pose). For several formats, call reformat, then poster on each project. Call preview first, as for a video. Free within the plan’s usage.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/nuit-du-faso-jazz-a3.' },
        at: { type: 'array', items: { type: 'number' }, description: 'The times to take, in seconds, one page each (up to 4). Default: the template’s pages, else the last frame.' },
      },
      required: ['project'],
    },
  },
  {
    name: 'render',
    description:
      'Export a motion project as a video file the user can post: mp4 (1080p, the default), mp4-light (720p, small, for WhatsApp), gif (no sound, for a message), webm (keeps the transparent background of an overlay such as bas-de-titre). Runs `check` first. Uses the minutes of export included in the plan, then a few media credits. Waits up to 45 s, then saves the file in the project’s exports/ folder and returns its path; if it is still rendering, call render_status, never render again.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        format: { type: 'string', enum: [...EXPORT_FORMATS], description: 'Default mp4.' },
        fps: { type: 'number', enum: [30, 60], description: '30 (default). 60 only when asked for very smooth motion: it counts double.' },
        wait: { type: 'boolean', description: 'Leave unset. false is for the app: it returns at once and follows the export itself.' },
      },
      required: ['project'],
    },
  },
  {
    name: 'render_status',
    description: 'Follow an export started by `render` (waits up to 45 s; call it again while it is still rendering). When ready, saves the file in the project’s exports/ folder and returns its path.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The export id returned by render.' },
        project: { type: 'string', description: 'The project folder it belongs to.' },
        format: { type: 'string', enum: [...EXPORT_FORMATS] },
        wait: { type: 'boolean', description: 'Leave unset. false is for the app: it returns at once and follows the export itself.' },
      },
      required: ['id', 'project'],
    },
  },
  {
    name: 'export_minutes',
    description: 'The minutes of export the plan includes this month (this week on the Semaine plan), how many are used, when they come back, and the media credit balance for exports beyond them.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'captions',
    description:
      "Add word-by-word captions synced to the voice of a motion project: two lines at a time, the spoken word lit in the brand's highlight colour, figures and the brand name always highlighted. Transcribes the project's voice-over (its <audio> clip, or a <video> with data-has-audio) once, with each word's time, and keeps the words in the project's captions.json. To correct a word (a name, a price), edit its `text` in captions.json and call captions again: free, no new transcription. Transcription is counted in the usage, about 0.01 $ a minute of voice.",
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        audio: { type: 'string', description: 'The voice to caption, if not the project’s own <audio> clip: a file in the project (assets/voix.mp3) or in the workspace. Up to 25 MB.' },
        at: { type: 'number', description: 'When that voice starts in the video, in seconds. Default: the start of its clip, or 0.' },
        position: { type: 'string', enum: [...POSITIONS], description: 'bottom (default, above the networks’ buttons), middle or top.' },
        retranscribe: { type: 'boolean', description: 'Transcribe again even though captions.json exists (the voice changed).' },
      },
      required: ['project'],
    },
  },
  {
    name: 'mix',
    description:
      "Mix a motion project's music under its voice: the music comes down while the voice speaks, back up in its real pauses, and fades out at the end. Takes the voice's timing from captions.json (free when the video has captions), or transcribes the voice once (about 0.01 $ a minute) and keeps the words there. Writes a volume lane on the music clip, which the preview plays and the export renders.",
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        voice: { type: 'string', description: 'The id of the voice clip, when the project has several (an <audio>, or a <video> with data-has-audio). Default: the audio clip that is not music.' },
        music: { type: 'string', description: 'The id of the music clip, when it cannot be told apart (default: the <audio> whose id or file says music).' },
        level: { type: 'number', description: 'The music level away from the voice, 0–1. Default: its data-volume, or 1.' },
        under_voice: { type: 'number', description: 'The share of that level kept under the voice, 0–1. Default 0.25 (−12 dB): the voice clearly in front.' },
        fade_out: { type: 'number', description: 'Seconds of fade at the end of the music. Default 1.5 when it plays to the end of the video, else 0.5.' },
        retranscribe: { type: 'boolean', description: 'Transcribe the voice again (it changed but kept its file name).' },
      },
      required: ['project'],
    },
  },
  {
    name: 'preview',
    description:
      "See the video before the user does: takes still frames of a motion project (by default one per scene, once its entrances have landed) and has an art director review them — text cut off or too small, overlaps, misalignment, a pointer off its target, empty or crowded frames. Returns the review in words, with how to fix each defect, and saves the frames in the project's previews/ folder. Call it after building or changing a project and fix what it names before showing the video. Free; counted in the usage like a short model call.",
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        at: { type: 'array', items: { type: 'number' }, description: `Up to ${MAX_PREVIEW_FRAMES} times to look at, in seconds. Default: one per scene, at 70 % of it.` },
        brief: { type: 'string', description: 'What the video is meant to be, in one sentence (the user’s request): the review judges it against that.' },
      },
      required: ['project'],
    },
  },
  {
    name: 'check',
    description:
      'Check a motion project before showing or rendering it: the composition root, the timed clips, the media files, and the animation rules (Web Animations or CSS only; GSAP is not allowed). Returns the problems with how to fix each.',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' } },
      required: ['project'],
    },
  },
];

/** What Deepgram's pre-recorded API reads, by extension. */
const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};
/** As the control plane's /v1/voice/transcribe. */
const MAX_VOICE_BYTES = 25 * 1024 * 1024;

/** The words of a captions.json the agent may have edited: the well-formed ones, in time order. */
function cleanWords(raw: unknown): CaptionWord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is CaptionWord => !!w && typeof w === 'object' && typeof (w as CaptionWord).text === 'string' && Number.isFinite((w as CaptionWord).start) && Number.isFinite((w as CaptionWord).end))
    .map((w) => ({ text: w.text.slice(0, 60), start: w.start, end: w.end }))
    .sort((a, b) => a.start - b.start);
}

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });
/** A text for the agent, with the same answer as data for the app's studio. */
const answer = (t: string, data: Record<string, unknown>, isError = false): ToolResult => ({ ...text(t, isError), structuredContent: data });
const HEX = /^#[0-9a-f]{6}$/i;
const FONT = /^[A-Za-z0-9 ]{2,40}$/;

/** What would be hard to read in a video, from the brand's own colours. */
export function legibility(brand: BrandKit): string[] {
  const { background, ink, highlight } = brand.colors;
  const out: string[] = [];
  const text = contrast(ink, background);
  if (text < 4.5) out.push(`Warning: the text (ink ${ink}) on the background ${background} has a contrast of ${text.toFixed(1)}:1, under 4.5:1 — hard to read on a phone. Suggest a darker or lighter ink or background to the user.`);
  const key = contrast(highlight, background);
  if (key < 3) out.push(`Warning: the highlight ${highlight} on the background ${background} has a contrast of ${key.toFixed(1)}:1, under 3:1 — the key figures will not stand out. Suggest another highlight, or a palette colour.`);
  return out;
}

export const projectSlug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'motion';

interface ProjectMeta {
  template: string;
  title: string;
  format: Format;
  values: Record<string, string>;
  speed?: number;
  createdAt: string;
}

export interface Finding { severity: 'error' | 'warning'; code: string; message: string; fix: string }

/**
 * HyperFrames' structural rules that need no dependency (the full lint runs
 * in the render service): the root, the clips, local media, and no GSAP.
 */
export async function checkComposition(html: string, projectDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const add = (severity: Finding['severity'], code: string, message: string, fix: string) => findings.push({ severity, code, message, fix });
  const root = /<[a-z]+\b[^>]*\bdata-composition-id="[^"]+"[^>]*>/i.exec(html)?.[0];
  if (!root) add('error', 'missing_root', 'No element carries data-composition-id.', 'Wrap the video in <div id="root" data-composition-id="main" data-start="0" data-duration="…" data-width="…" data-height="…">.');
  else {
    for (const attr of ['data-width', 'data-height', 'data-start']) {
      if (!new RegExp(`\\b${attr}="`).test(root)) add('error', `root_${attr.slice(5)}`, `The root has no ${attr}.`, `Add ${attr} to the root element.`);
    }
    if (!/\bdata-duration="\d+(\.\d+)?"/.test(root)) add('error', 'root_duration', 'The root has no explicit data-duration (Web Animations need one).', 'Add data-duration="<seconds>" to the root.');
    if (!/\bdata-no-timeline\b/.test(root) && !/window\.__timelines/.test(html)) add('warning', 'missing_data_no_timeline', 'No timeline is registered and the root lacks data-no-timeline: every render would wait 45 s.', 'Add data-no-timeline to the root.');
  }
  if (/gsap/i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
    add('error', 'gsap_not_allowed', 'The composition uses GSAP, which Baarali does not ship (its licence forbids no-code animation builders).', 'Rewrite the motion with element.animate(…) (the hf()/hfEl() helpers) or CSS @keyframes.');
  }
  const ids = new Set<string>();
  for (const m of html.matchAll(/<([a-z]+)\b([^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*)>/gi)) {
    const attrs = m[2];
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (!id) add('error', 'clip_without_id', `A <${m[1]} class="clip"> has no id.`, 'Give every clip a unique id.');
    else if (ids.has(id)) add('error', 'duplicate_id', `Two clips share the id "${id}".`, 'Make each clip id unique.');
    else ids.add(id);
    for (const attr of ['data-start', 'data-duration', 'data-track-index']) {
      if (!new RegExp(`\\b${attr}="`).test(attrs)) add('error', 'clip_timing', `Clip ${id ?? m[1]} has no ${attr}.`, `Add ${attr} to it.`);
    }
    if (m[1].toLowerCase() === 'video' && !/\bmuted\b/.test(attrs) && !/data-has-audio="true"/.test(attrs)) {
      add('warning', 'video_missing_muted', `Video ${id ?? ''} says neither muted nor data-has-audio="true".`, 'Add muted for silent footage, or data-has-audio="true" to keep its sound.');
    }
  }
  if (findVoice(html)) {
    for (const clip of audioClips(html)) {
      if (isMusic(clip) && !clip.automated) add('warning', 'music_not_mixed', `The music ${clip.id ?? clip.src} plays at full level under the voice.`, 'Call mix: it lowers the music while the voice speaks.');
    }
  }
  // The kit's hfEl chooses the fill itself (motion-kit.ts).
  if (/\.animate\(/.test(html) && !/\bfill\s*:\s*['"]both['"]/.test(html) && !/function hfEl\(/.test(html)) {
    add('warning', 'waapi_fill', 'Animations without fill:"both" lose their state when seeked.', 'Create every animation with fill:"both" (hfEl does).');
  }
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#)/.test(ref)) continue;
    // The render service receives the project folder alone.
    const target = path.resolve(projectDir, ref);
    if (target !== projectDir && !target.startsWith(projectDir + path.sep)) {
      add('error', 'media_outside_project', `The file ${ref} is outside the project folder: the export would miss it.`, 'Copy it into the project (assets/) and point to assets/<name>.');
      continue;
    }
    try {
      await fs.access(path.resolve(projectDir, ref));
    } catch {
      add('error', 'missing_media', `The file ${ref} is not in the project.`, 'Copy it into the project folder (assets/) or fix the path.');
    }
  }
  return findings;
}

export function createMotionTools(deps: MotionToolsDeps) {
  const abs = (rel: string) => path.join(deps.workDir, rel);

  async function readBrand(): Promise<BrandKit> {
    try {
      const raw = JSON.parse(await fs.readFile(abs(BRAND_FILE), 'utf8')) as Partial<BrandKit>;
      return {
        ...DEFAULT_BRAND,
        ...raw,
        colors: { ...DEFAULT_BRAND.colors, ...(raw.colors ?? {}) },
        palette: Array.isArray(raw.palette) ? raw.palette.filter((c) => typeof c === 'string' && HEX.test(c)).slice(0, PALETTE_LIMIT) : [],
        fonts: { ...DEFAULT_BRAND.fonts, ...(raw.fonts ?? {}) },
      };
    } catch {
      return DEFAULT_BRAND;
    }
  }

  /** A project folder given by the agent, kept inside motion/. */
  function projectDir(project: unknown): string | null {
    if (typeof project !== 'string' || !project.trim()) return null;
    const rel = project.trim().replace(/^\/+/, '').replace(/\/index\.html$/, '');
    const dir = path.resolve(deps.workDir, rel.startsWith(`${MOTION_DIR}/`) ? rel : `${MOTION_DIR}/${rel}`);
    return dir.startsWith(path.join(deps.workDir, MOTION_DIR) + path.sep) ? dir : null;
  }

  async function freeDir(base: string): Promise<string> {
    for (let i = 1; i < 100; i++) {
      const dir = abs(path.join(MOTION_DIR, i === 1 ? base : `${base}-${i}`));
      try {
        await fs.access(dir);
      } catch {
        return dir;
      }
    }
    return abs(path.join(MOTION_DIR, `${base}-${deps.now()}`));
  }

  /** The voice's words with their times, from the control plane; a refusal as a tool result. */
  async function transcribe(voicePath: string): Promise<CaptionWord[] | ToolResult> {
    const type = AUDIO_TYPES[path.extname(voicePath).toLowerCase()];
    if (!type) return text(`The voice must be one of ${Object.keys(AUDIO_TYPES).join(', ')}.`, true);
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(voicePath);
    } catch {
      return text(`No file at ${path.relative(deps.workDir, voicePath)}.`, true);
    }
    if (bytes.length > MAX_VOICE_BYTES) return text('The voice file is over 25 MB: give the voice-over alone (an mp3), not the whole footage.', true);
    if (!deps.control) return text('Transcription is not available here.', true);
    const res = await deps.control.fetch(`${deps.control.url}/v1/voice/transcribe?words=true`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deps.control.token}`, 'content-type': type },
      body: new Uint8Array(bytes),
    });
    const data = (await res.json().catch(() => ({}))) as { words?: unknown; error?: { code?: string; message?: string } };
    if (!res.ok) {
      if (data.error?.code === 'quota_reached') return text('Not transcribed: the usage limit of the plan is reached for now. Say so to the user.', true);
      return text(`The transcription failed (${data.error?.message ?? res.status}). Try again in a moment.`, true);
    }
    const words = cleanWords(data.words);
    if (words.length === 0) return text('No speech was heard in this voice: check that it is the right file and that it has sound.', true);
    return words;
  }

  /** The project's captions.json, if it is readable. */
  async function readCaptions(dir: string): Promise<CaptionsFile | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(dir, CAPTIONS_FILE), 'utf8')) as CaptionsFile;
    } catch {
      return null;
    }
  }

  async function write(meta: ProjectMeta): Promise<{ dir: string; duration: number }> {
    const brand = await readBrand();
    const dir = await freeDir(`${projectSlug(meta.title)}${meta.format === '9:16' ? '' : `-${meta.format.replace(':', 'x')}`}`);
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
    // The logo goes with the project: the render service receives the folder alone.
    let logoSrc: string | null = null;
    if (brand.logo) {
      try {
        const src = path.resolve(deps.workDir, brand.logo);
        if (src.startsWith(deps.workDir + path.sep)) {
          const name = `logo${path.extname(src).toLowerCase() || '.png'}`;
          await fs.copyFile(src, path.join(dir, 'assets', name));
          logoSrc = `assets/${name}`;
        }
      } catch {
        // A logo moved away: the brand's initial stands in.
      }
    }
    // A picture slot names a workspace image: it goes with the project too.
    const values = { ...meta.values };
    /** The image's src in the project, or '' when it is not a workspace image. */
    const bring = async (given: string, base: string): Promise<string> => {
      const src = path.resolve(deps.workDir, given);
      if (!src.startsWith(deps.workDir + path.sep) || !/\.(png|jpe?g|webp|svg|gif)$/i.test(src)) return '';
      try {
        const name = `${base}${path.extname(src).toLowerCase()}`;
        await fs.copyFile(src, path.join(dir, 'assets', name));
        return `assets/${name}`;
      } catch {
        // Moved away: the template does without it.
        return '';
      }
    };
    for (const slot of TEMPLATES.find((t) => t.id === meta.template)?.slots ?? []) {
      if (slot.image) {
        const given = values[slot.key]?.trim();
        values[slot.key] = given ? await bring(given, slot.key) : '';
      } else if (slot.imageField !== undefined && values[slot.key]) {
        // A list of `name | price | photo` lines: each line's photo goes too.
        const out: string[] = [];
        for (const [i, line] of values[slot.key].split('\n').entries()) {
          const f = line.split('|').map((x) => x.trim());
          if (f[slot.imageField]) f[slot.imageField] = await bring(f[slot.imageField], `${slot.key}-${i + 1}`);
          out.push(f.join(' | '));
        }
        values[slot.key] = out.join('\n');
      }
    }
    const { html, duration } = compose(meta.template, { format: meta.format, title: meta.title, brand, values, logoSrc, speed: meta.speed });
    await fs.writeFile(path.join(dir, 'index.html'), html);
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(meta, null, 2) + '\n');
    return { dir, duration };
  }

  const rel = (dir: string) => path.relative(deps.workDir, dir);

  async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (name === 'brand_kit') {
      const current = await readBrand();
      const set = args.set as Partial<BrandKit> | undefined;
      if (!set || typeof set !== 'object') {
        return text(`Brand kit (${BRAND_FILE}):\n${JSON.stringify(current, null, 2)}${current.name ? '' : '\nNo brand yet: ask the user for their business name, logo and colours, then set them.'}`);
      }
      const next: BrandKit = { ...current, colors: { ...current.colors }, palette: [...current.palette], fonts: { ...current.fonts } };
      if (typeof set.name === 'string') next.name = set.name.trim().slice(0, 40);
      if (set.logo === null) next.logo = null;
      else if (typeof set.logo === 'string') {
        const logo = path.resolve(deps.workDir, set.logo);
        if (!logo.startsWith(deps.workDir + path.sep)) return text('The logo must be a file in the workspace.', true);
        try {
          await fs.access(logo);
        } catch {
          return text(`No file at ${set.logo}.`, true);
        }
        next.logo = path.relative(deps.workDir, logo);
      }
      for (const [k, v] of Object.entries(set.colors ?? {})) {
        if (!(k in next.colors)) continue;
        if (typeof v !== 'string' || !HEX.test(v)) return text(`Colour ${k} must be #rrggbb.`, true);
        next.colors[k as keyof BrandKit['colors']] = v.toLowerCase();
      }
      if (set.palette !== undefined) {
        if (!Array.isArray(set.palette) || set.palette.length > PALETTE_LIMIT) return text(`The palette is a list of up to ${PALETTE_LIMIT} colours.`, true);
        const bad = set.palette.find((c) => typeof c !== 'string' || !HEX.test(c));
        if (bad !== undefined) return text(`Palette colour ${String(bad)} must be #rrggbb.`, true);
        next.palette = [...new Set(set.palette.map((c) => c.toLowerCase()))];
      }
      for (const [k, v] of Object.entries(set.fonts ?? {})) {
        if (!(k in next.fonts)) continue;
        if (typeof v !== 'string' || !FONT.test(v)) return text(`Font ${k} must be a Google Fonts family name.`, true);
        next.fonts[k as keyof BrandKit['fonts']] = v;
      }
      if (set.tone !== undefined) {
        if (!['energetic', 'warm', 'premium'].includes(set.tone)) return text('Tone is energetic, warm or premium.', true);
        next.tone = set.tone;
      }
      await fs.mkdir(path.dirname(abs(BRAND_FILE)), { recursive: true });
      await fs.writeFile(abs(BRAND_FILE), JSON.stringify(next, null, 2) + '\n');
      return text([`Brand kit saved:\n${JSON.stringify(next, null, 2)}`, ...legibility(next)].join('\n'));
    }

    if (name === 'list_templates') {
      return text(TEMPLATES.map((t) =>
        `- ${t.id} — ${t.name}: ${t.use} ${t.poster ? `Poster (still; default format ${t.format ?? '9:16'})` : `${t.duration} s`}${t.transparent ? ', transparent background' : ''}.\n  slots: ${t.slots.map((s) => (s.image ? `${s.key} (the workspace path of an image, optional)` : `${s.key}${s.list ? ' (one per line)' : ''}${s.imageField !== undefined ? ` (fields split by |; field ${s.imageField + 1} is the workspace path of an image, optional)` : ''} e.g. "${s.example.replace(/\n/g, ' / ')}"`)).join('; ')}`,
      ).join('\n'));
    }

    if (name === 'new_project') {
      const template = TEMPLATES.find((t) => t.id === args.template);
      if (!template) return text(`Unknown template. Call list_templates; ids: ${TEMPLATES.map((t) => t.id).join(', ')}.`, true);
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 80) : template.name;
      const format = (typeof args.format === 'string' && args.format in FORMATS ? args.format : (template.format ?? '9:16')) as Format;
      const values = Object.fromEntries(
        Object.entries((args.values ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 600)]),
      );
      const speed = typeof args.speed === 'number' && Number.isFinite(args.speed) ? args.speed : undefined;
      const meta: ProjectMeta = { template: template.id, title, format, values, ...(speed ? { speed } : {}), createdAt: new Date(deps.now()).toISOString() };
      const { dir, duration } = await write(meta);
      const missing = template.slots.filter((s) => !(s.key in values) && s.example).map((s) => s.key);
      const brand = await readBrand();
      return text([
        `Created ${rel(dir)}/index.html — ${template.name}, ${format} (${isPrint(format) ? `${PRINT_SIZES[format].join(' × ')} mm, 3 mm of bleed` : `${FORMATS[format].width}×${FORMATS[format].height}`}), ${duration} s.`,
        template.poster || isPrint(format) ? 'A poster: call preview, then poster to export it (PNG, and the printer’s PDF on paper).' : '',
        missing.length ? `These slots kept the template's example text: ${missing.join(', ')}. Fill them from the user's request unless they fit.` : '',
        brand.name ? '' : 'The brand kit is empty: the default colours were used. Ask the user for their brand and call brand_kit.',
        `Show it to the user with the path in a \`\`\`filepath block (${rel(dir)}/index.html); it plays in the app.`,
      ].filter(Boolean).join('\n'));
    }

    if (name === 'reformat') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      const format = args.format as Format;
      if (!(format in FORMATS)) return text(`Format is one of ${Object.keys(FORMATS).join(', ')}.`, true);
      let meta: ProjectMeta;
      try {
        meta = JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8')) as ProjectMeta;
      } catch {
        return text('This project was not made from a template (no project.json): adapt its index.html by hand, changing data-width and data-height on the root.', true);
      }
      const made = await write({ ...meta, format, createdAt: new Date(deps.now()).toISOString() });
      return text(`Created ${rel(made.dir)}/index.html in ${format}. Hand edits made to ${rel(dir)} were not carried over.`);
    }

    if (name === 'captions') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const root = rootOf(html);
      if (!root) return text('The composition root has no data-width, data-height or data-duration: call check and fix it first.', true);
      const existing = await readCaptions(dir);
      if (args.position !== undefined && !POSITIONS.includes(args.position as Position)) return text(`Position is one of ${POSITIONS.join(', ')}.`, true);
      const position = (args.position as Position | undefined) ?? (existing && POSITIONS.includes(existing.position) ? existing.position : 'bottom');

      let file: CaptionsFile;
      const reuse = existing && cleanWords(existing.words).length > 0 && args.audio === undefined && args.retranscribe !== true;
      if (reuse) {
        file = { audio: String(existing!.audio ?? ''), at: Number.isFinite(existing!.at) ? existing!.at : 0, position, words: cleanWords(existing!.words) };
      } else {
        // The voice: the one named, else the composition's own.
        const own = findVoice(html);
        let voicePath: string;
        let at: number;
        if (typeof args.audio === 'string' && args.audio.trim()) {
          const named = args.audio.trim();
          const inProject = path.resolve(dir, named);
          voicePath = inProject.startsWith(dir + path.sep) ? inProject : path.resolve(deps.workDir, named);
          if (!voicePath.startsWith(deps.workDir + path.sep)) return text('The voice must be a file in the workspace.', true);
          const sameClip = own && path.resolve(dir, own.src) === voicePath ? own.at : null;
          at = typeof args.at === 'number' && Number.isFinite(args.at) ? args.at : (sameClip ?? 0);
        } else if (own) {
          voicePath = path.resolve(dir, own.src);
          at = typeof args.at === 'number' && Number.isFinite(args.at) ? args.at : own.at;
        } else {
          return text('This project has no voice to caption: add the voice-over as an <audio> clip (copied into assets/), or give `audio`. For text without a voice, the sous-titres template times the words evenly.', true);
        }
        const words = await transcribe(voicePath);
        if (!Array.isArray(words)) return words;
        file ={ audio: path.relative(dir, voicePath), at, position, words };
      }

      const brand = await readBrand();
      await fs.writeFile(path.join(dir, 'index.html'), injectCaptions(html, captionsBlock(file, { ...root, brandName: brand.name })));
      await fs.writeFile(path.join(dir, CAPTIONS_FILE), JSON.stringify(file, null, 2) + '\n');
      const spoken = file.words[file.words.length - 1].end - file.words[0].start;
      const beyond = file.words.filter((w) => w.start + file.at >= root.duration).length;
      return text([
        `${reuse ? 'Captions rebuilt from' : 'Captions added:'} ${file.words.length} words over ${spoken.toFixed(1)} s, synced to ${file.audio} (from ${file.at} s in the video), ${position}.`,
        beyond ? `${beyond} words fall after the end of the video (${root.duration} s) and are not shown: lengthen data-duration on the root, then call captions again.` : '',
        `The words are in ${rel(dir)}/${CAPTIONS_FILE}. Read them: the transcription may misspell names, places or prices. Correct a word by editing its "text" there, then call captions again (free).`,
        'Call check, then show the project.',
      ].filter(Boolean).join('\n'));
    }

    if (name === 'mix') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const root = rootOf(html);
      if (!root) return text('The composition root has no data-width, data-height or data-duration: call check and fix it first.', true);
      const id = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
      const voiceId = id(args.voice);
      const voice = findVoice(html, voiceId);
      if (!voice) {
        return text(voiceId
          ? `No clip with the id "${voiceId}" holds a voice in the project (an <audio> of the project, or a <video> with data-has-audio="true").`
          : 'This project has no voice to lower the music under: add the voice-over as an <audio> clip (copied into assets/), or give `voice`, the id of its clip.', true);
      }
      const clips = audioClips(html);
      const others = clips.filter((c) => c.kind === 'audio' && !(c.src === voice.src && c.id === voice.id));
      const musicId = id(args.music);
      const named = others.filter(isMusic);
      const music = musicId ? others.find((c) => c.id === musicId) : named.length === 1 ? named[0] : named.length === 0 && others.length === 1 ? others[0] : undefined;
      if (!music) {
        if (musicId) return text(`No <audio> clip with the id "${musicId}" besides the voice.`, true);
        if (others.length === 0) return text('This project has no music to mix: add the music bed as an <audio> clip (copied into assets/), with id="musique".', true);
        return text(`Several audio clips could be the music (${others.map((c) => c.id ?? c.src).join(', ')}): give \`music\`, the id of the one to lower under the voice.`, true);
      }
      if (music.start === null) return text('The music starts relative to another clip: give its clip a data-start in seconds, then call mix again.', true);
      const musicStart = music.start;
      const playing = Math.min(music.duration ?? Infinity, root.duration - music.start);
      if (!(playing > 0)) return text('The music starts after the end of the video: move its data-start.', true);
      const share = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
      const level = share(args.level, music.volume === null ? 1 : Math.min(1, music.volume));
      const underVoice = share(args.under_voice, 0.25);
      const endsWithVideo = music.duration === null || music.start + music.duration >= root.duration - 0.05;
      const fadeOut = typeof args.fade_out === 'number' && Number.isFinite(args.fade_out) ? Math.min(10, Math.max(0, args.fade_out)) : endsWithVideo ? 1.5 : 0.5;

      // The voice's words: those the captions transcribed, when they are of this voice.
      const voicePath = path.resolve(dir, voice.src);
      if (!voicePath.startsWith(deps.workDir + path.sep)) return text('The voice must be a file in the workspace.', true);
      const existing = await readCaptions(dir);
      const known = existing && typeof existing.audio === 'string' && path.resolve(dir, existing.audio) === voicePath ? cleanWords(existing.words) : [];
      let words = known;
      let transcribed = false;
      if (known.length === 0 || args.retranscribe === true) {
        const heard = await transcribe(voicePath);
        if (!Array.isArray(heard)) return heard;
        words = heard;
        transcribed = true;
        const position = existing && POSITIONS.includes(existing.position) ? existing.position : 'bottom';
        await fs.writeFile(path.join(dir, CAPTIONS_FILE), JSON.stringify({ audio: path.relative(dir, voicePath), at: voice.at, position, words } satisfies CaptionsFile, null, 2) + '\n');
      }

      const lane = fittedLane(words, voice.at, { clipStart: music.start, clipDuration: playing, level, underVoice, fadeIn: 0.2, fadeOut });
      await fs.writeFile(path.join(dir, 'index.html'), withLane(html, music, lane, level));
      const passages = speechSpans(words, voice.at).filter(([s, e]) => e > musicStart && s < musicStart + playing).length;
      const db = underVoice > 0 ? `${Math.round(20 * Math.log10(underVoice))} dB` : 'silence';
      return answer([
        `Mixed: the music ${music.id ?? music.src} plays at ${level}, comes down to ${Math.round(level * underVoice * 100) / 100} (${db}) under the voice in ${passages} passage(s) and back up in its pauses, and fades out over its last ${fadeOut} s.`,
        transcribed
          ? `The voice was transcribed for its timing (counted in the usage, about 0.01 $ a minute); the words are kept in ${rel(dir)}/${CAPTIONS_FILE}, so captions now cost nothing more.${html.includes(CAPTIONS_START) && existing ? ' The captions on the video are of the previous voice: call captions again.' : ''}`
          : `Timing from the voice's words in ${CAPTIONS_FILE}: nothing was transcribed.`,
        'The lane is the data-automation attribute of the music clip: after moving the voice or the music, call mix again. Louder or softer: `level` (0–1) and `under_voice` (the share kept under the voice, 0–1).',
      ].join('\n'), { mix: { music: music.id ?? music.src, level, underVoice, fadeOut, passages, transcribed } });
    }

    if (name === 'preview') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      if (!deps.control) return text('Preview is not available here.', true);
      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const errors = (await checkComposition(html, dir)).filter((f) => f.severity === 'error');
      if (errors.length > 0) return text(`Fix these first, then preview:\n${errors.map((f) => `- ${f.code}: ${f.message} Fix: ${f.fix}`).join('\n')}`, true);
      const asked = Array.isArray(args.at) ? args.at.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0) : [];
      const times = (asked.length > 0 ? [...new Set(asked)] : previewTimes(html)).slice(0, MAX_PREVIEW_FRAMES);
      let brief = typeof args.brief === 'string' ? args.brief.trim() : '';
      if (!brief) {
        try {
          brief = String((JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8')) as ProjectMeta).title ?? '');
        } catch {
          // Made by hand: judged on its own.
        }
      }
      const { files, total } = await packProject(dir, { sound: false });
      if (total > MAX_EXPORT_BYTES) return text(`The project is ${Math.round(total / 1024 / 1024)} MB without its sound; previews take 150 MB at most. Use lighter footage.`, true);

      const body = JSON.stringify({ files });
      const query = new URLSearchParams({ times: times.join(','), ...(brief ? { brief: brief.slice(0, 600) } : {}) });
      let res: Response;
      try {
        res = await deps.control.fetch(`${deps.control.url}/v1/motion/review?${query}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${deps.control.token}`, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
          body,
          signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
        });
      } catch {
        return text('The preview took too long (the render machine was starting). Call preview again: it is warm now.', true);
      }
      const data = (await res.json().catch(() => ({}))) as { stills?: Array<{ t: number; data: string }>; review?: string | null; error?: { code?: string; message?: string } };
      if (!res.ok || !Array.isArray(data.stills)) {
        const code = data.error?.code;
        if (code === 'quota_reached') return text('No preview: the usage limit of the plan is reached for now.', true);
        if (code === 'preview_busy') return text('The preview machine is busy: call preview again in a minute.', true);
        if (code === 'too_many_previews') return text('Enough previews for this hour: show the video to the user as it is now.', true);
        return text(`No preview: ${data.error?.message ?? `error ${res.status}`}.`, true);
      }

      // The latest look only: earlier frames would mislead.
      const out = path.join(dir, PREVIEWS_DIR);
      await fs.rm(out, { recursive: true, force: true });
      await fs.mkdir(out, { recursive: true });
      const saved: Array<{ t: number; file: string }> = [];
      for (const still of data.stills) {
        const file = path.join(out, `${still.t.toFixed(1).replace('.', '_')}s.jpg`);
        await fs.writeFile(file, Buffer.from(still.data, 'base64'));
        saved.push({ t: still.t, file: rel(file) });
      }
      const frames = saved.map((s) => `${s.t} s → ${s.file}`).join('\n');
      const review = typeof data.review === 'string' ? data.review : null;
      return answer([
        `Looked at ${saved.length} frame(s) of ${rel(dir)}:\n${frames}`,
        review
          ? `The art director's review:\n${review}\n\nFix each defect it names in index.html (one it gets wrong, such as a frame caught mid-transition, can be left), then call preview again on the same times. Two rounds at most, then show the video.`
          : 'The frames are saved, but the review could not be made this time. If you can read images, look at them; otherwise call preview once more.',
      ].join('\n\n'), { preview: { stills: saved, review } });
    }

    if (name === 'poster') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/nuit-du-faso-jazz.', true);
      if (!deps.control) return text('Posters are not available here.', true);
      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const errors = (await checkComposition(html, dir)).filter((f) => f.severity === 'error');
      if (errors.length > 0) return text(`Fix these first, then export the poster:\n${errors.map((f) => `- ${f.code}: ${f.message} Fix: ${f.fix}`).join('\n')}`, true);
      const times = posterTimes(html, args.at);
      if (!times) return text('The composition root has no data-duration.', true);
      const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
      const paper = /\bdata-print-mm="(\d+)x(\d+)"/.exec(root);
      let title = path.basename(dir);
      try {
        title = String((JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8')) as ProjectMeta).title ?? title);
      } catch {
        // Made by hand: the folder names it.
      }
      const { files, total } = await packProject(dir, { sound: false });
      if (total > MAX_EXPORT_BYTES) return text(`The project is ${Math.round(total / 1024 / 1024)} MB without its sound; posters take 150 MB at most. Use lighter pictures.`, true);
      const body = JSON.stringify({ files });
      let res: Response;
      try {
        res = await deps.control.fetch(`${deps.control.url}/v1/motion/poster?${new URLSearchParams({ times: times.join(','), title: title.slice(0, 120) })}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${deps.control.token}`, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
          body,
          signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
        });
      } catch {
        return text('The poster took too long (the render machine was starting). Call poster again: it is warm now.', true);
      }
      const data = (await res.json().catch(() => ({}))) as { pngs?: Array<{ t: number; data: string }>; pdf?: string | null; error?: { code?: string; message?: string } };
      if (!res.ok || !Array.isArray(data.pngs)) {
        const code = data.error?.code;
        if (code === 'quota_reached') return text('No poster: the usage limit of the plan is reached for now.', true);
        if (code === 'preview_busy') return text('The render machine is busy: call poster again in a minute.', true);
        if (code === 'too_many_posters') return text('Enough posters for this hour: try again later.', true);
        return text(`No poster: ${data.error?.message ?? `error ${res.status}`}.`, true);
      }
      const base = path.basename(dir);
      const out = path.join(dir, EXPORTS_DIR);
      await fs.mkdir(out, { recursive: true });
      const saved: Array<{ file: string; kind: 'pdf' | 'png'; label: string }> = [];
      const many = data.pngs.length > 1;
      const sides = data.pngs.length === 2 && paper ? ['recto', 'verso'] : null;
      if (paper && typeof data.pdf === 'string') {
        const file = path.join(out, `${base}.pdf`);
        await fs.writeFile(file, Buffer.from(data.pdf, 'base64'));
        saved.push({ file: rel(file), kind: 'pdf', label: `PDF for the printer, ${paper[1]} × ${paper[2]} mm, 3 mm bleed, crop marks${many ? `, ${data.pngs.length} pages` : ''}` });
      }
      for (const [i, png] of data.pngs.entries()) {
        const suffix = many ? `-${sides ? sides[i] : i + 1}` : '';
        const file = path.join(out, `${base}${suffix}${paper ? '-300dpi' : ''}.png`);
        await fs.writeFile(file, Buffer.from(png.data, 'base64'));
        saved.push({ file: rel(file), kind: 'png', label: paper ? `PNG 300 dpi, cut to size${suffix ? ` (${suffix.slice(1)})` : ''}` : `PNG${suffix ? ` (${suffix.slice(1)})` : ''}` });
      }
      return answer([
        `Poster of ${rel(dir)} at ${times.join(', ')} s:`,
        ...saved.map((f) => `- ${f.file} — ${f.label}`),
        `Show each file to the user in a \`\`\`filepath block; it opens and downloads in the app.${paper ? ' Tell them the PDF is the one for the print shop.' : ''}`,
      ].join('\n'), { poster: { files: saved, print: paper ? { width: Number(paper[1]), height: Number(paper[2]), bleed: 3 } : null } });
    }

    if (name === 'check') {
      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const findings = await checkComposition(html, dir);
      if (findings.length === 0) return text(`${rel(dir)}: no problem found.`);
      const errors = findings.filter((f) => f.severity === 'error').length;
      return text(
        `${rel(dir)}: ${errors} error(s), ${findings.length - errors} warning(s).\n` +
          findings.map((f) => `- ${f.severity} ${f.code}: ${f.message} Fix: ${f.fix}`).join('\n'),
        errors > 0,
      );
    }

    if (name === 'render' || name === 'render_status' || name === 'export_minutes') {
      if (!deps.control) return text('Video export is not available here.', true);
      const control = deps.control;
      const api = (route: string, init: RequestInit = {}) =>
        control.fetch(`${control.url}/v1/motion${route}`, { ...init, headers: { authorization: `Bearer ${control.token}`, ...((init.headers as Record<string, string>) ?? {}) } });
      const readJson = async (res: Response) => (await res.json().catch(() => ({}))) as Record<string, any>;
      const minutes = (s: number) => `${Math.round((s / 60) * 10) / 10} min`;
      // Monthly plans count the calendar month; Semaine counts each paid week.
      const period = (a: Record<string, any> | undefined) => (a?.period === 'week' ? 'this week' : 'this month');

      if (name === 'export_minutes') {
        const res = await api('/allowance');
        const data = await readJson(res);
        if (!res.ok) return text(`Could not read the export minutes (${res.status}).`, true);
        return answer(`Export minutes ${period(data)}: ${minutes(data.used_seconds)} used of ${minutes(data.total_seconds)}, back on ${String(data.resets_at).slice(0, 10)}. Beyond them: ${data.credits_per_minute} media credits a minute, counted to the second; balance ${data.balance} credits.`, {
          allowance: { period: data.period === 'week' ? 'week' : 'month', usedSeconds: Number(data.used_seconds) || 0, totalSeconds: Number(data.total_seconds) || 0, resetsAt: String(data.resets_at ?? ''), creditsPerMinute: Number(data.credits_per_minute) || 0, balance: Number(data.balance) || 0 },
        });
      }

      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      const format = (args.format ?? 'mp4') as ExportFormat;
      if (!EXPORT_FORMATS.includes(format)) return text(`Format is one of ${EXPORT_FORMATS.join(', ')}.`, true);

      // The agent waits for its export; the app's studio asks once and polls itself.
      const wait = args.wait !== false;
      const state = (id: string, status: string, more: Record<string, unknown> = {}) => ({ export: { id, format, status, ...more } });

      /** Waits for the export, then saves it beside the project. */
      const follow = async (id: string, intro: string): Promise<ToolResult> => {
        const until = deps.now() + (wait ? RENDER_WAIT_MS : 0);
        for (;;) {
          const res = await api(`/renders/${encodeURIComponent(id)}`);
          const data = await readJson(res);
          if (res.status === 404) return answer(`No export ${id}.`, state(id, 'unknown'), true);
          if (data.status === 'failed') {
            return answer(`${intro}The export failed: ${data.error ?? 'unknown error'}. Its minutes and credits were given back. Fix the composition if the error names it, call check, and render again.`, state(id, 'failed', { error: String(data.error ?? 'unknown error') }), true);
          }
          if (data.status === 'done') {
            const file = await api(`/renders/${encodeURIComponent(id)}/file`);
            if (!file.ok) {
              const code = ((await readJson(file)).error as Record<string, unknown> | undefined)?.code;
              if (code === 'lost') return answer(`${intro}The export finished but its file was lost before it reached the workspace. It was refunded, minutes and credits: render it again, at no extra cost.`, state(id, 'lost'), true);
              return answer(`${intro}The export is done but its file could not be fetched (${file.status}); render it again.`, state(id, 'failed', { error: `file ${file.status}` }), true);
            }
            const out = path.join(dir, EXPORTS_DIR, `${path.basename(dir)}${format === 'mp4' ? '' : `-${format}`}.${EXPORT_EXTENSIONS[format]}`);
            await fs.mkdir(path.dirname(out), { recursive: true });
            await fs.writeFile(out, Buffer.from(await file.arrayBuffer()));
            return answer(`${intro}Exported: ${rel(out)}. Show it to the user in a \`\`\`filepath block (${rel(out)}); it plays and downloads in the app, on the phone as on the computer.`, state(id, 'done', { progress: 1, file: rel(out) }));
          }
          if (deps.now() >= until) {
            const pct = Math.round((Number(data.progress) || 0) * 100);
            return answer(`${intro}Still rendering (${data.queued ? 'waiting for a free machine' : `${pct} %`}). Do not call render again: it would export twice. Call render_status with id ${id} and project ${rel(dir)}${format === 'mp4' ? '' : ` and format ${format}`}.`, state(id, data.queued ? 'queued' : 'rendering', { progress: pct / 100 }));
          }
          await control.sleep(RENDER_POLL_MS);
        }
      };

      if (name === 'render_status') {
        if (typeof args.id !== 'string' || !args.id) return text('Give the id returned by render.', true);
        return follow(args.id, '');
      }

      let html: string;
      try {
        html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
      } catch {
        return text(`No index.html in ${rel(dir)}.`, true);
      }
      const errors = (await checkComposition(html, dir)).filter((f) => f.severity === 'error');
      if (errors.length > 0) {
        return answer(`Not exported: fix these first.\n${errors.map((f) => `- ${f.code}: ${f.message} Fix: ${f.fix}`).join('\n')}`, { refused: { code: 'composition_errors', errors: errors.map((f) => f.message) } }, true);
      }
      const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
      if (/\bdata-print-mm=/.test(root)) {
        return answer('Not exported: this project is on paper (a print format). Export it with poster; for a video of it, call reformat to 9:16, 1:1, 4:5 or 16:9 first.', { refused: { code: 'print_format', message: 'print format' } }, true);
      }
      const seconds = Number(/\bdata-duration\s*=\s*["']?([\d.]+)/i.exec(root)?.[1]);
      if (!Number.isFinite(seconds) || seconds <= 0) return text('The composition root has no data-duration.', true);
      const fps = args.fps === 60 ? 60 : 30;

      // The folder as it is, without its earlier exports.
      const { files, total } = await packProject(dir, { sound: true });
      if (total > MAX_EXPORT_BYTES) return text(`The project is ${Math.round(total / 1024 / 1024)} MB; exports take 150 MB at most. Use shorter or lighter footage.`, true);

      const body = JSON.stringify({ files });
      const res = await api(`/renders?${new URLSearchParams({ format, fps: String(fps), seconds: String(seconds) })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
        body,
      });
      const data = await readJson(res);
      if (res.status !== 202) {
        const e = (data.error ?? {}) as Record<string, any>;
        if (e.code === 'insufficient_media_credits') {
          return answer(`Not exported: the export minutes of the plan are used up (${minutes(e.allowance?.used_seconds ?? 0)} of ${minutes(e.allowance?.total_seconds ?? 0)}, back on ${String(e.allowance?.resets_at ?? '').slice(0, 10)}) and this export costs ${e.cost} media credits; the balance is ${e.balance}. The user can buy a media credit pack, or wait for the minutes to come back.`, { refused: { code: 'insufficient_media_credits', cost: Number(e.cost) || 0, balance: Number(e.balance) || 0 } }, true);
        }
        return answer(`Not exported: ${e.message ?? `error ${res.status}`}.`, { refused: { code: String(e.code ?? res.status), message: String(e.message ?? '') } }, true);
      }
      const paid = data.credits > 0
        ? `${minutes(data.included_seconds)} from the plan and ${data.credits} media credits`
        : `${minutes(data.included_seconds)} from the plan's export minutes`;
      return follow(String(data.id), `Export ${data.id} started (${paid}; ${minutes(data.allowance?.used_seconds ?? 0)} of ${minutes(data.allowance?.total_seconds ?? 0)} used ${period(data.allowance)}).\n`);
    }

    return text(`Unknown tool: ${name}`, true);
  }

  return { tools: MOTION_TOOLS, run };
}
