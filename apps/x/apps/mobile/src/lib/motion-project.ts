// BAARALI(10/10/2026): what the phone reads of a motion project and of the
// agent's files, without React Native (tested in Node). motion.ts adds the
// workspace URLs, the share sheet, Photos and the motion tools.

/** Pinned to the version the Mac's studio and the render service use. */
const HF_VERSION = '0.8.141';
const PLAYER_JS = `https://cdn.jsdelivr.net/npm/@hyperframes/player@${HF_VERSION}/dist/hyperframes-player.global.js`;
const RUNTIME_JS = `https://cdn.jsdelivr.net/npm/@hyperframes/core@${HF_VERSION}/dist/hyperframe.runtime.iife.js`;

export type FileKind = 'motion' | 'image' | 'video' | 'pdf' | 'other';

export function fileKind(path: string): FileKind {
  if (/(?:^|\/)motion\/[^/]+\/index\.html$/.test(path)) return 'motion';
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) return 'image';
  if (/\.(mp4|mov|webm)$/i.test(path)) return 'video';
  if (/\.pdf$/i.test(path)) return 'pdf';
  return 'other';
}

/** `motion/<project>` of a project's index.html (workspace or absolute path), else null. */
export function motionProject(path: string): string | null {
  const m = /(?:^|\/)(motion\/[^/]+)\/index\.html$/.exec(path);
  return m ? m[1] : null;
}

/** A path as the agent gives it, relative to the workspace. */
export function workspacePath(path: string): string {
  const i = path.indexOf('/motion/');
  return path.startsWith('/') && i >= 0 ? path.slice(i + 1) : path.replace(/^\/+/, '');
}

export interface Composition {
  title: string;
  width: number;
  height: number;
  duration: number;
  /** On paper: the trim in mm. */
  print: [number, number] | null;
  scenes: Array<{ start: number; end: number }>;
}

/** What the studio shows of a composition, read from its HTML. */
export function readComposition(html: string): Composition | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0];
  if (!root) return null;
  const num = (attr: string) => Number(new RegExp(`\\b${attr}\\s*=\\s*["']?([\\d.]+)`, 'i').exec(root)?.[1]);
  const width = num('data-width'), height = num('data-height'), duration = num('data-duration');
  if (!(width > 0 && height > 0 && duration > 0)) return null;
  const paper = /\bdata-print-mm="(\d+)x(\d+)"/.exec(root);
  const scenes: Composition['scenes'] = [];
  for (const m of html.matchAll(/<section\b([^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*)>/gi)) {
    const start = Number(/\bdata-start="([\d.]+)"/.exec(m[1])?.[1]);
    const length = Number(/\bdata-duration="([\d.]+)"/.exec(m[1])?.[1]);
    if (Number.isFinite(start) && length > 0) scenes.push({ start, end: Math.min(duration, start + length) });
  }
  scenes.sort((a, b) => a.start - b.start);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  return { title, width, height, duration, print: paper ? [Number(paper[1]), Number(paper[2])] : null, scenes };
}

/** The other formats `reformat` made of a project: siblings named <project>-1x1, -16x9, -A4… */
export function siblingFormats(project: string, folders: string[]): Array<{ label: string; project: string }> {
  const SUFFIX = /-(1x1|16x9|4x5|A3|A4|A5|A6|carte)$/;
  const base = project.replace(/^motion\//, '').replace(SUFFIX, '');
  const out = folders
    .filter((f) => f === base || (f.startsWith(`${base}-`) && SUFFIX.test(f) && f.replace(SUFFIX, '') === base))
    .map((f) => ({ label: SUFFIX.exec(f)?.[1].replace('x', ':') ?? '9:16', project: `motion/${f}` }));
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The page the web view loads: HyperFrames' player (the Mac's), fed the
 * composition with its runtime. The player keeps the agent's page in an
 * opaque sandbox; its files are fetched with the key in the URL, the only
 * way an image or a clip inside it can carry it. The player reports its time
 * to the app, and plays, pauses and seeks on the app's messages.
 */
export function playerPage(html: string, projectUrl: (rel: string) => string): string {
  const withFiles = html.replace(/\b(src|href)="(?!https?:|data:|#|\/\/)([^"]+)"/g, (_m, attr: string, rel: string) => `${attr}="${projectUrl(rel)}"`);
  const head = `<script data-hyperframes-preview-runtime src="${RUNTIME_JS}"></script>`;
  const doc = /<head\b[^>]*>/i.test(withFiles) ? withFiles.replace(/<head\b[^>]*>/i, (m) => m + head) : head + withFiles;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}hyperframes-player{display:block;width:100%;height:100%}</style>
<script src="${PLAYER_JS}"></script></head><body>
<hyperframes-player id="p" sandbox-origin="opaque"></hyperframes-player>
<script>
  var p = document.getElementById('p');
  p.setAttribute('srcdoc', ${JSON.stringify(doc).replace(/<\/script/gi, '<\\/script')});
  function tell(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  // Five times a second, only when something changed.
  var last = '';
  setInterval(function(){
    var m = { t: Math.round((p.currentTime || 0) * 10) / 10, playing: !p.paused, ready: !!p.ready };
    var k = JSON.stringify(m);
    if (k !== last) { last = k; tell(m); }
  }, 200);
  window.studio = function(m){
    if (m.seek !== undefined) p.seek(m.seek);
    if (m.play === true) p.play();
    if (m.play === false) p.pause();
  };
</script></body></html>`;
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1).replace('.', ',')}`;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

