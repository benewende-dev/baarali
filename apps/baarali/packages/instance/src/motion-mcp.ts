import fs from 'node:fs/promises';
import path from 'node:path';
import { compose, contrast, DEFAULT_BRAND, FORMATS, PALETTE_LIMIT, TEMPLATES, type BrandKit, type Format } from './motion-templates.js';
import type { ToolDef, ToolResult } from './media-mcp.js';

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
/** How long `render` and `render_status` wait in one call; a 10 s video takes about 30 s. */
export const RENDER_WAIT_MS = 75_000;
const RENDER_POLL_MS = 4_000;
/** As the render service. */
const MAX_EXPORT_BYTES = 150 * 1024 * 1024;
const EXPORTS_DIR = 'exports';

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
        format: { type: 'string', enum: Object.keys(FORMATS), description: '9:16 for TikTok, Reels and WhatsApp Status (default); 1:1 or 4:5 for a feed; 16:9 for YouTube or a screen.' },
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
    name: 'render',
    description:
      'Export a motion project as a video file the user can post: mp4 (1080p, the default), mp4-light (720p, small, for WhatsApp), gif (no sound, for a message), webm (keeps the transparent background of an overlay such as bas-de-titre). Runs `check` first. Uses the minutes of export included in the plan, then a few media credits. Waits up to 75 s, then saves the file in the project’s exports/ folder and returns its path; if it is still rendering, call render_status.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project folder, e.g. motion/promo-week-end.' },
        format: { type: 'string', enum: [...EXPORT_FORMATS], description: 'Default mp4.' },
        fps: { type: 'number', enum: [30, 60], description: '30 (default). 60 only when asked for very smooth motion: it counts double.' },
      },
      required: ['project'],
    },
  },
  {
    name: 'render_status',
    description: 'Follow an export started by `render` (waits up to 75 s). When ready, saves the file in the project’s exports/ folder and returns its path.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The export id returned by render.' },
        project: { type: 'string', description: 'The project folder it belongs to.' },
        format: { type: 'string', enum: [...EXPORT_FORMATS] },
      },
      required: ['id', 'project'],
    },
  },
  {
    name: 'export_minutes',
    description: 'The minutes of export the plan includes this month, how many are used, when they come back, and the media credit balance for exports beyond them.',
    inputSchema: { type: 'object', properties: {} },
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

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });
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
  if (/\.animate\(/.test(html) && !/\bfill\s*:\s*['"]both['"]/.test(html)) {
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
    const { html, duration } = compose(meta.template, { format: meta.format, title: meta.title, brand, values: meta.values, logoSrc, speed: meta.speed });
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
        `- ${t.id} — ${t.name}: ${t.use} ${t.duration} s${t.transparent ? ', transparent background' : ''}.\n  slots: ${t.slots.map((s) => `${s.key}${s.list ? ' (one per line)' : ''} e.g. "${s.example.replace(/\n/g, ' / ')}"`).join('; ')}`,
      ).join('\n'));
    }

    if (name === 'new_project') {
      const template = TEMPLATES.find((t) => t.id === args.template);
      if (!template) return text(`Unknown template. Call list_templates; ids: ${TEMPLATES.map((t) => t.id).join(', ')}.`, true);
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 80) : template.name;
      const format = (typeof args.format === 'string' && args.format in FORMATS ? args.format : '9:16') as Format;
      const values = Object.fromEntries(
        Object.entries((args.values ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 600)]),
      );
      const speed = typeof args.speed === 'number' && Number.isFinite(args.speed) ? args.speed : undefined;
      const meta: ProjectMeta = { template: template.id, title, format, values, ...(speed ? { speed } : {}), createdAt: new Date(deps.now()).toISOString() };
      const { dir, duration } = await write(meta);
      const missing = template.slots.filter((s) => !(s.key in values) && s.example).map((s) => s.key);
      const brand = await readBrand();
      return text([
        `Created ${rel(dir)}/index.html — ${template.name}, ${format} (${FORMATS[format].width}×${FORMATS[format].height}), ${duration} s.`,
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

      if (name === 'export_minutes') {
        const res = await api('/allowance');
        const data = await readJson(res);
        if (!res.ok) return text(`Could not read the export minutes (${res.status}).`, true);
        return text(`Export minutes this month: ${minutes(data.used_seconds)} used of ${minutes(data.total_seconds)}, back on ${String(data.resets_at).slice(0, 10)}. Beyond them: ${data.credits_per_minute} media credits a minute; balance ${data.balance} credits.`);
      }

      const dir = projectDir(args.project);
      if (!dir) return text('Give the project folder, e.g. motion/promo-week-end.', true);
      const format = (args.format ?? 'mp4') as ExportFormat;
      if (!EXPORT_FORMATS.includes(format)) return text(`Format is one of ${EXPORT_FORMATS.join(', ')}.`, true);

      /** Waits for the export, then saves it beside the project. */
      const follow = async (id: string, intro: string): Promise<ToolResult> => {
        const until = deps.now() + RENDER_WAIT_MS;
        for (;;) {
          const res = await api(`/renders/${encodeURIComponent(id)}`);
          const data = await readJson(res);
          if (res.status === 404) return text(`No export ${id}.`, true);
          if (data.status === 'failed') {
            return text(`${intro}The export failed: ${data.error ?? 'unknown error'}. Its minutes and credits were given back. Fix the composition if the error names it, call check, and render again.`, true);
          }
          if (data.status === 'done') {
            const file = await api(`/renders/${encodeURIComponent(id)}/file`);
            if (!file.ok) return text(`${intro}The export is done but its file could not be fetched (${file.status}); render it again.`, true);
            const out = path.join(dir, EXPORTS_DIR, `${path.basename(dir)}${format === 'mp4' ? '' : `-${format}`}.${EXPORT_EXTENSIONS[format]}`);
            await fs.mkdir(path.dirname(out), { recursive: true });
            await fs.writeFile(out, Buffer.from(await file.arrayBuffer()));
            return text(`${intro}Exported: ${rel(out)}. Show it to the user in a \`\`\`filepath block (${rel(out)}); it plays and downloads in the app, on the phone as on the computer.`);
          }
          if (deps.now() >= until) {
            const pct = Math.round((Number(data.progress) || 0) * 100);
            return text(`${intro}Still rendering (${data.queued ? 'waiting for a free machine' : `${pct} %`}). Call render_status with id ${id} and project ${rel(dir)}${format === 'mp4' ? '' : ` and format ${format}`}.`);
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
        return text(`Not exported: fix these first.\n${errors.map((f) => `- ${f.code}: ${f.message} Fix: ${f.fix}`).join('\n')}`, true);
      }
      const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
      const seconds = Number(/\bdata-duration\s*=\s*["']?([\d.]+)/i.exec(root)?.[1]);
      if (!Number.isFinite(seconds) || seconds <= 0) return text('The composition root has no data-duration.', true);
      const fps = args.fps === 60 ? 60 : 30;

      // The folder as it is, without its earlier exports.
      const files: Array<{ path: string; data: string }> = [];
      let total = 0;
      const walk = async (sub: string) => {
        for (const entry of await fs.readdir(path.join(dir, sub), { withFileTypes: true })) {
          const relPath = sub ? `${sub}/${entry.name}` : entry.name;
          if (entry.name.startsWith('.') || (!sub && (entry.name === EXPORTS_DIR || entry.name === 'project.json'))) continue;
          if (entry.isDirectory()) await walk(relPath);
          else if (entry.isFile()) {
            const bytes = await fs.readFile(path.join(dir, relPath));
            total += bytes.length;
            files.push({ path: relPath, data: bytes.toString('base64') });
          }
        }
      };
      await walk('');
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
          return text(`Not exported: the export minutes of the plan are used up (${minutes(e.allowance?.used_seconds ?? 0)} of ${minutes(e.allowance?.total_seconds ?? 0)}, back on ${String(e.allowance?.resets_at ?? '').slice(0, 10)}) and this export costs ${e.cost} media credits; the balance is ${e.balance}. The user can buy a media credit pack, or wait for the minutes to come back.`, true);
        }
        return text(`Not exported: ${e.message ?? `error ${res.status}`}.`, true);
      }
      const paid = data.credits > 0
        ? `${minutes(data.included_seconds)} from the plan and ${data.credits} media credits`
        : `${minutes(data.included_seconds)} from the plan's export minutes`;
      return follow(String(data.id), `Export ${data.id} started (${paid}; ${minutes(data.allowance?.used_seconds ?? 0)} of ${minutes(data.allowance?.total_seconds ?? 0)} used this month).\n`);
    }

    return text(`Unknown tool: ${name}`, true);
  }

  return { tools: MOTION_TOOLS, run };
}
