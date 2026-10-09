import { escapeHtml } from './motion-templates.js';

// Word-by-word captions synced to a voice (Studio Motion step 3, style A
// « karaoké » validated on mockup 09/10/2026): the voice is transcribed with
// each word's time (the control plane's /v1/voice/transcribe?words=true),
// kept in the project's captions.json, which the agent may correct, and laid
// over the video as one clip. Two lines at a time, the spoken word in the
// highlight colour; figures and the brand's name stay highlighted. Its own
// script, Web Animations only, so it works on a page edited by hand.

export const CAPTIONS_FILE = 'captions.json';
export const CAPTIONS_START = '<!-- baarali:captions -->';
export const CAPTIONS_END = '<!-- /baarali:captions -->';
export const POSITIONS = ['bottom', 'middle', 'top'] as const;
export type Position = (typeof POSITIONS)[number];

export interface CaptionWord {
  text: string;
  /** Seconds from the start of the voice. */
  start: number;
  end: number;
}

export interface CaptionsFile {
  /** The voice, relative to the project folder. */
  audio: string;
  /** When the voice starts in the video, in seconds. */
  at: number;
  position: Position;
  words: CaptionWord[];
}

/** A voice in the composition: the first <audio>, or a <video> that keeps its sound, with its start. */
export function findVoice(html: string): { src: string; at: number } | null {
  for (const m of html.matchAll(/<(audio|video)\b([^>]*)>/gi)) {
    const attrs = m[2];
    if (m[1].toLowerCase() === 'video' && !/data-has-audio\s*=\s*["']true["']/i.test(attrs)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src || /^(https?:|data:)/.test(src)) continue;
    const at = Number(/\bdata-start\s*=\s*["']?([\d.]+)/i.exec(attrs)?.[1] ?? 0);
    return { src, at: Number.isFinite(at) ? at : 0 };
  }
  return null;
}

/** The composition's size and length, read on its root. */
export function rootOf(html: string): { width: number; height: number; duration: number } | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0];
  if (!root) return null;
  const num = (attr: string) => Number(new RegExp(`\\b${attr}\\s*=\\s*["']?([\\d.]+)`, 'i').exec(root)?.[1]);
  const [width, height, duration] = [num('data-width'), num('data-height'), num('data-duration')];
  return [width, height, duration].every((n) => Number.isFinite(n) && n > 0) ? { width, height, duration } : null;
}

export interface Page {
  start: number;
  end: number;
  lines: number[][];
}

/**
 * Words into pages of two lines: a line holds about `maxChars` characters; a
 * sentence's end or a pause of more than 0.6 s starts a new page, so a page
 * never shows words said far apart. Each page stays until the next begins, or half a second
 * after its last word.
 */
export function paginate(words: CaptionWord[], maxChars: number): Page[] {
  const pages: Page[] = [];
  let lines: number[][] = [];
  let line: number[] = [];
  let len = 0;
  const close = () => {
    if (line.length) lines.push(line);
    if (lines.length) pages.push({ start: words[lines[0][0]].start, end: 0, lines });
    lines = [];
    line = [];
    len = 0;
  };
  words.forEach((w, i) => {
    const pause = i > 0 ? w.start - words[i - 1].end : 0;
    if (pause > 0.6) close();
    if (line.length && len + 1 + w.text.length > maxChars) {
      lines.push(line);
      line = [];
      len = 0;
      if (lines.length === 2) close();
    }
    line.push(i);
    len += (len ? 1 : 0) + w.text.length;
    if (/[.!?…]["»”]?$/.test(w.text)) close();
  });
  close();
  pages.forEach((p, i) => {
    const last = words[p.lines[p.lines.length - 1].slice(-1)[0]].end;
    p.end = i + 1 < pages.length ? Math.min(pages[i + 1].start, last + 0.5) : last + 0.5;
  });
  return pages;
}

/** Figures, prices and the brand's name keep the highlight colour. */
export function isKeyWord(text: string, brandName: string): boolean {
  const bare = text.replace(/[.,;:!?«»"“”()]/g, '').trim();
  if (/\d/.test(bare) || /^(F?CFA|FCFA|XOF|€|\$|%)$/i.test(bare)) return true;
  const brand = brandName.trim().toLowerCase();
  return brand.length > 1 && brand.split(/\s+/).includes(bare.toLowerCase());
}

const POSITION_CSS: Record<Position, string> = {
  // Above TikTok's and Reels' buttons, which take the bottom 15%.
  bottom: 'bottom:17cqh',
  middle: 'top:50%;transform:translateY(-50%)',
  top: 'top:11cqh',
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The captions layer: one clip over the whole video, between markers so a new version replaces it. */
export function captionsBlock(file: CaptionsFile, opts: { width: number; height: number; duration: number; brandName: string }): string {
  const D = opts.duration;
  const words = file.words
    .map((w) => ({ text: w.text.trim(), start: w.start + file.at, end: w.end + file.at }))
    .filter((w) => w.text && w.start < D)
    .map((w) => ({ ...w, end: Math.min(Math.max(w.end, w.start + 0.05), D) }));
  // Landscape fits longer lines.
  const pages = paginate(words, opts.width > opts.height ? 38 : 22);
  const html = pages
    .map((p, n) => `<div class="bc-page" id="bc-p${n}">${p.lines
      .map((l) => l.map((i) => `<span class="bc-w${isKeyWord(words[i].text, opts.brandName) ? ' bc-key' : ''}" id="bc-w${i}">${escapeHtml(words[i].text)}</span>`).join(' '))
      .join('<br>')}</div>`)
    .join('');
  const timing = {
    d: D,
    pages: pages.map((p) => [round(p.start), round(Math.min(p.end, D))]),
    words: words.map((w) => [round(w.start), round(w.end)]),
  };
  return `${CAPTIONS_START}
<style>
  #baarali-captions{position:absolute;inset:0;pointer-events:none;z-index:50}
  #baarali-captions .bc-page{position:absolute;left:6cqw;right:6cqw;${POSITION_CSS[file.position]};text-align:center;opacity:0;font:900 5.6cqmin/1.22 var(--display, system-ui, sans-serif);color:var(--ink, #fff);text-shadow:0 .4cqmin 1.6cqmin rgba(0,0,0,.65)}
  #baarali-captions .bc-key{color:var(--highlight, #ffbe3c)}
</style>
<div id="baarali-captions" class="clip" data-start="0" data-duration="${D}" data-track-index="90">${html}</div>
<script>
(function(){
  // Captions synced to the voice (captions.json): seeked by HyperFrames like every Web Animation.
  var T = ${JSON.stringify(timing)};
  var ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#ffffff';
  var hot = getComputedStyle(document.documentElement).getPropertyValue('--highlight').trim() || '#ffbe3c';
  function at(el, prop, from, to, s, e){
    var a = Math.max(0, Math.min(1, s / T.d)), b = Math.max(a, Math.min(1, e / T.d));
    var k = [{offset:0}, {offset:a}, {offset:a}, {offset:b}, {offset:b}, {offset:1}];
    [from, from, to, to, from, from].forEach(function(v, i){ k[i][prop] = v; });
    el.animate(k, {duration:T.d * 1000, fill:'both', easing:'linear'}).pause();
  }
  T.pages.forEach(function(p, i){ at(document.getElementById('bc-p' + i), 'opacity', 0, 1, p[0], p[1]); });
  T.words.forEach(function(w, i){
    var el = document.getElementById('bc-w' + i);
    if (el && !el.classList.contains('bc-key')) at(el, 'color', ink, hot, w[0], w[1]);
  });
})();
</script>
${CAPTIONS_END}`;
}

/** The layer put just before the root closes, or in place of the previous one. */
export function injectCaptions(html: string, block: string): string {
  const start = html.indexOf(CAPTIONS_START);
  const end = html.indexOf(CAPTIONS_END);
  if (start >= 0 && end > start) return html.slice(0, start) + block + html.slice(end + CAPTIONS_END.length);
  // The root's closing tag: the last </div> before </body> when the root is a div, as the templates write it.
  const body = html.lastIndexOf('</body>');
  const close = html.lastIndexOf('</div>', body >= 0 ? body : html.length);
  if (close < 0) return html + '\n' + block;
  return html.slice(0, close) + block + '\n' + html.slice(close);
}
