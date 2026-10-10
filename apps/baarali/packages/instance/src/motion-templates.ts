// The Studio Motion's templates (decided 08/10/2026, mockup v2 validated the
// same day): HyperFrames compositions (Apache-2.0, heygen-com/hyperframes)
// the agent starts from, then edits like any HTML file. Every motion is the
// Web Animations API, created at load, paused, and seeked by HyperFrames'
// waapi adapter — never GSAP, whose licence forbids no-code animation
// builders. Sizes are container units of the root, so one template fits
// every format; colours and fonts are the brand kit's CSS variables.

import { KIT_CSS, KIT_JS } from './motion-kit.js';
import { qrSvg, qrTarget } from './qr.js';

/**
 * Paper (decided 10/10/2026, step 3 « affiches »): the trim size in
 * millimetres. The page is BLEED_MM larger on each side, the printer's
 * margin for error when cutting; a CSS pixel is 1/96 inch, so the PDF comes
 * out at the true size.
 */
export const PRINT_SIZES = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  carte: [85, 55],
} as const;
export const BLEED_MM = 3;
const printPx = (mm: number) => Math.round(((mm + 2 * BLEED_MM) * 96) / 25.4);

export const FORMATS = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
  ...(Object.fromEntries(Object.entries(PRINT_SIZES).map(([k, [w, h]]) => [k, { width: printPx(w), height: printPx(h) }])) as Record<keyof typeof PRINT_SIZES, { width: number; height: number }>),
};
export type Format = keyof typeof FORMATS;
export type PrintFormat = keyof typeof PRINT_SIZES;
export const isPrint = (f: string): f is PrintFormat => f in PRINT_SIZES;

export interface BrandKit {
  name: string;
  /** Workspace path of the logo (SVG or PNG), if any. */
  logo: string | null;
  /** The four roles every template is built on, so text stays legible. */
  colors: { background: string; ink: string; accent: string; highlight: string };
  /** The brand's other colours (up to PALETTE_LIMIT): chart series, shapes, free edits. */
  palette: string[];
  fonts: { display: string; text: string };
  /** energetic | warm | premium: the default rhythm. */
  tone: 'energetic' | 'warm' | 'premium';
}

export const DEFAULT_BRAND: BrandKit = {
  name: '',
  logo: null,
  colors: { background: '#0a1630', ink: '#ffffff', accent: '#1a6dff', highlight: '#ffbe3c' },
  palette: [],
  fonts: { display: 'Inter', text: 'Inter' },
  tone: 'energetic',
};

export const PALETTE_LIMIT = 6;

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `hex`. */
export const textOn = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111');

export interface Slot {
  key: string;
  label: string;
  example: string;
  /** Several values, one per line. */
  list?: boolean;
  /** A picture: the workspace path of an image, copied into the project's assets/; empty leaves it out. */
  image?: boolean;
  /** In a list of `a | b | c` lines, the field (from 0) that names a workspace image, copied the same way. */
  imageField?: number;
}

export interface Template {
  id: string;
  name: string;
  use: string;
  /** Seconds, before a slot (a countdown's count) changes it. */
  duration: number;
  /** Rendered over a transparent background: an overlay for a video. */
  transparent?: boolean;
  /** A still image first (step 3): exported with `poster`, its entrance a bonus. */
  poster?: boolean;
  /** The format when none is asked for. */
  format?: Format;
  slots: Slot[];
  /** `pages`: the times `poster` takes, one page each (a card's two sides); default the last frame. */
  body: (v: Values, ctx: Ctx) => { html: string; script: string; css?: string; duration?: number; pages?: number[] };
}

type Values = Record<string, string>;
interface Ctx {
  brand: BrandKit;
  /** The logo's src relative to index.html, or null. */
  logoSrc: string | null;
  speed: number;
  /** The frame in pixels, for layouts that move by whole cards. */
  width: number;
  height: number;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const lines = (s: string | undefined) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
/** The `a | b | c` fields of a list line. */
const fields = (s: string | undefined) => (s ?? '').split('|').map((f) => f.trim());
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const num = (s: string | undefined, fallback: number) => {
  const n = Number(String(s ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : fallback;
};

/** The logo, or the brand's initial on an accent tile. */
function logoMark(ctx: Ctx, cls: string, id: string): string {
  if (ctx.logoSrc) return `<img id="${id}" class="${cls}" src="${escapeHtml(ctx.logoSrc)}" alt="">`;
  const initial = escapeHtml((ctx.brand.name.trim()[0] ?? 'B').toUpperCase());
  return `<span id="${id}" class="${cls} tile">${initial}</span>`;
}

/** Words with their highlight: *between stars*, over one word or several. */
function starred(ws: string[]): Array<{ w: string; hot: boolean }> {
  let open = false;
  return ws.map((raw) => {
    const starts = raw.startsWith('*');
    const ends = /\*[.,!?;:]*$/.test(raw) && (raw.length > 1 || open);
    const hot = open || starts;
    if (starts && !ends) open = true;
    else if (ends) open = false;
    return { w: raw.replace(/\*/g, ''), hot };
  });
}

const wordSpans = (text: string, cls: string) => words(text).map((w) => `<span class="${cls}">${escapeHtml(w)}</span>`).join(' ');

// Posters (step 3, mockup validated 10/10/2026): a still first, printed or posted.
const QR_LABEL = 'QR code : numéro WhatsApp avec l’indicatif (+226 70 00 00 00) ou lien ; vide pour aucun';
const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>';
const PHONE_SVG = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>';
/** A title's size in cqmin: `big` up to `fits` characters, smaller as it grows. */
const fitSize = (t: string, big: number, fits: number) => +(big * Math.min(1, Math.sqrt(fits / Math.max(1, t.length)))).toFixed(2);
/** The poster's frame keeps clear of the cut: the bleed plus 5 mm, or 7 % of the short side on a screen. */
const POSTER_CSS = `
  .pz{position:absolute;inset:max(calc(var(--bleed) + 5mm), 7cqmin);display:flex;flex-direction:column}
  .pz-brand{display:flex;align-items:center;gap:2cqmin;font:800 3.6cqmin var(--text)}
  .pz-brand .mark{width:9cqmin;height:9cqmin;font-size:5cqmin;border-radius:2.2cqmin}
  .qr-tile{flex:none;background:#fff;color:#111;border-radius:2cqmin;padding:1.2cqmin;display:flex;flex-direction:column;align-items:center;gap:.6cqmin}
  .qr-tile svg{display:block;width:100%;height:auto}
  .qr-tile small{font:700 2.4cqmin/1.2 var(--text);text-align:center;padding-bottom:.6cqmin}`;

/** The logo and the brand's name, when the kit has one. */
function brandLine(ctx: Ctx, cls: string, id: string): string {
  if (!ctx.brand.name && !ctx.logoSrc) return '';
  return `<div class="${cls}" id="${id}">${logoMark(ctx, 'mark', `${id}-logo`)}${ctx.brand.name ? `<span>${escapeHtml(ctx.brand.name)}</span>` : ''}</div>`;
}

/** A QR code on its white tile (scanners want dark on light); '' when `raw` is neither a number nor a link. */
function qrTile(raw: string | undefined, caption: string | undefined, id: string): string {
  const target = qrTarget(raw ?? '');
  if (!target) return '';
  return `<div class="qr-tile" id="${id}">${qrSvg(target, { dark: '#111111', light: '#ffffff' })}${caption ? `<small>${escapeHtml(caption)}</small>` : ''}</div>`;
}

export const TEMPLATES: Template[] = [
  {
    id: 'annonce-choc',
    name: 'Annonce choc',
    use: 'A promotion or an announcement: hook, the big figure, details, call to action.',
    duration: 10,
    slots: [
      { key: 'hook', label: 'Accroche', example: 'Ce week-end seulement' },
      { key: 'big', label: 'Le chiffre', example: '-20%' },
      { key: 'sub', label: 'Sous le chiffre', example: 'sur tous les forfaits internet' },
      { key: 'points', label: 'Avantages', example: '4G illimitée la nuit\nFibre à la maison\nSans engagement', list: true },
      { key: 'cta', label: 'Appel à l’action', example: 'J’en profite' },
      { key: 'until', label: 'Échéance', example: 'Jusqu’à dimanche 23 h' },
    ],
    body: (v, ctx) => ({
      html: `
  <section id="s-hook" class="clip scene" data-start="0" data-duration="1.4" data-track-index="1">
    <div class="brandline">${logoMark(ctx, 'mark', 'hook-logo')}<b>${escapeHtml(ctx.brand.name)}</b></div>
    <h1 class="hook">${wordSpans(v.hook, 'w')}</h1>
  </section>
  <section id="s-big" class="clip scene" data-start="1.3" data-duration="3.3" data-track-index="2">
    <div class="big">${escapeHtml(v.big)}</div>
    <div class="rule"></div>
    <p class="sub">${escapeHtml(v.sub)}</p>
  </section>
  <section id="s-points" class="clip scene" data-start="4.5" data-duration="3.1" data-track-index="3">
    ${((ps) => ps.map((p, i) => `<p class="point" style="top:${44 - ps.length * 6 + i * 13}cqh"><i>✓</i>${escapeHtml(p)}</p>`).join('\n    '))(lines(v.points).slice(0, 4))}
  </section>
  <section id="s-cta" class="clip scene" data-start="7.5" data-duration="2.5" data-track-index="4">
    <div class="signature">${logoMark(ctx, 'mark', 'cta-logo')}<b>${escapeHtml(ctx.brand.name)}</b></div>
    <div class="cta">${escapeHtml(v.cta)} →</div>
    <p class="until">${escapeHtml(v.until)}</p>
  </section>`,
      css: `
  .brandline{position:absolute;left:8cqw;top:7cqh;display:flex;align-items:center;gap:2cqmin;font-weight:800;font-size:4.4cqmin}
  .hook{position:absolute;left:8cqw;right:8cqw;top:30cqh;margin:0;font:900 11cqmin/1 var(--display);letter-spacing:-.03em}
  .hook .w{display:inline-block}
  .big{position:absolute;left:0;right:0;top:22cqh;text-align:center;font:900 32cqmin/1 var(--display);letter-spacing:-.06em;color:var(--highlight)}
  .rule{position:absolute;left:20cqw;right:20cqw;top:60cqh;height:1cqmin;background:var(--highlight);transform-origin:left}
  .sub{position:absolute;left:8cqw;right:8cqw;top:64cqh;margin:0;text-align:center;font-size:5.4cqmin;opacity:.85}
  .point{position:absolute;left:8cqw;right:8cqw;margin:0;display:flex;align-items:center;gap:3cqmin;font:700 6cqmin var(--display)}
  .point i{font-style:normal;width:9cqmin;height:9cqmin;border-radius:50%;display:grid;place-items:center;border:.5cqmin solid var(--accent);color:var(--accent);font-size:4.5cqmin;flex:none}
  .signature{position:absolute;left:0;right:0;top:22cqh;display:flex;justify-content:center;align-items:center;gap:2cqmin;font:900 7cqmin var(--display)}
  .signature .mark{width:10cqmin;height:10cqmin}
  .cta{position:absolute;left:10cqw;right:10cqw;top:46cqh;background:var(--ink);color:var(--background);text-align:center;border-radius:3cqmin;padding:4cqmin;font:900 6cqmin var(--display)}
  .until{position:absolute;left:8cqw;right:8cqw;top:66cqh;margin:0;text-align:center;font-weight:700;font-size:5cqmin;color:var(--highlight)}`,
      script: `
  hf('.brandline', [{opacity:0, transform:'translateY(-2cqh)'}, {opacity:1, transform:'none'}], {at:0.1, d:0.5});
  hf('.hook .w', [{opacity:0, transform:'translateY(8cqh) rotate(4deg)'}, {opacity:1, transform:'none'}], {at:0.25, d:0.6, stagger:0.12});
  hf('#s-hook', [{opacity:1}, {opacity:0, transform:'translateY(-5cqh)'}], {at:1.05, d:0.35, ease:'in'});
  hf('.big', [{opacity:0, transform:'scale(.4)'}, {opacity:1, transform:'none'}], {at:1.35, d:0.8, ease:'spring'});
  hf('.rule', [{transform:'scaleX(0)'}, {transform:'none'}], {at:1.85, d:0.6, ease:'snap'});
  hf('.sub', [{opacity:0, transform:'translateY(3cqh)'}, {opacity:.85, transform:'none'}], {at:2.1, d:0.6});
  hf('#s-big', [{opacity:1}, {opacity:0, transform:'scale(1.12)'}], {at:4.25, d:0.4, ease:'in'});
  hf('.point', [{opacity:0, transform:'translateX(-12cqw)'}, {opacity:1, transform:'none'}], {at:4.6, d:0.55, stagger:0.18});
  hf('#s-points', [{opacity:1}, {opacity:0, transform:'translateX(10cqw)'}], {at:7.25, d:0.35, ease:'in'});
  hf('.signature', [{opacity:0, transform:'scale(.6)'}, {opacity:1, transform:'none'}], {at:7.55, d:0.6, ease:'spring'});
  hf('.cta', [{opacity:0, transform:'scale(.4)'}, {opacity:1, transform:'none'}], {at:7.75, d:0.6, ease:'spring'});
  hf('.cta', [{transform:'none'}, {transform:'scale(1.06)'}, {transform:'none'}], {at:8.6, d:0.8, ease:'inout', n:2});
  hf('.until', [{opacity:0, transform:'translateY(3cqh)'}, {opacity:1, transform:'none'}], {at:8.0, d:0.5});`,
    }),
  },
  {
    id: 'logo-anime',
    name: 'Logo animé',
    use: 'A logo sting: the opening or closing seconds of a video.',
    duration: 4,
    slots: [{ key: 'tagline', label: 'Signature', example: 'L’internet qui vous suit partout' }],
    body: (v, ctx) => ({
      html: `
  <section id="s-logo" class="clip scene" data-start="0" data-duration="4" data-track-index="1">
    <div class="burst"></div>
    <div class="lockup">${logoMark(ctx, 'mark big-mark', 'logo')}<b class="name">${escapeHtml(ctx.brand.name)}</b></div>
    <p class="tagline">${escapeHtml(v.tagline)}</p>
  </section>`,
      css: `
  .burst{position:absolute;left:50%;top:46%;width:40cqmin;height:40cqmin;margin:-20cqmin;border-radius:50%;border:1cqmin solid var(--accent)}
  .lockup{position:absolute;left:0;right:0;top:38%;display:flex;justify-content:center;align-items:center;gap:3cqmin}
  .big-mark{width:16cqmin;height:16cqmin;font-size:9cqmin;border-radius:4cqmin}
  .name{font:900 10cqmin var(--display);letter-spacing:-.02em}
  .tagline{position:absolute;left:8cqw;right:8cqw;top:62%;margin:0;text-align:center;font-size:4.6cqmin;opacity:.8}`,
      script: `
  hf('.burst', [{opacity:.9, transform:'scale(.2)'}, {opacity:0, transform:'scale(2.4)'}], {at:0.15, d:1.1, ease:'out'});
  hf('#logo', [{opacity:0, transform:'scale(0) rotate(-90deg)'}, {opacity:1, transform:'none'}], {at:0.2, d:0.8, ease:'spring'});
  hf('.name', [{opacity:0, clipPath:'inset(0 100% 0 0)'}, {opacity:1, clipPath:'inset(0 0 0 0)'}], {at:0.7, d:0.7, ease:'snap'});
  hf('.tagline', [{opacity:0, transform:'translateY(2cqh)'}, {opacity:.8, transform:'none'}], {at:1.3, d:0.6});
  hf('#s-logo', [{opacity:1}, {opacity:0}], {at:3.55, d:0.45, ease:'in'});`,
    }),
  },
  {
    id: 'chiffres-cles',
    name: 'Chiffres clés',
    use: 'Results or figures: a title, then up to four bars that grow with their numbers counting.',
    duration: 8,
    slots: [
      { key: 'title', label: 'Titre', example: 'Nos chiffres de septembre' },
      { key: 'items', label: 'Chiffres (libellé : valeur)', example: 'Clients : 1250\nCommandes : 3400\nVilles : 12', list: true },
    ],
    body: (v, ctx) => {
      // One colour per figure when the brand has more than its accent.
      const series = [ctx.brand.colors.accent, ...ctx.brand.palette];
      const items = lines(v.items).slice(0, 4).map((l) => {
        const [label, value] = l.split(/[:=]/);
        return { label: (label ?? '').trim(), value: Math.max(0, Math.round(num(value, 0))) };
      });
      const max = Math.max(1, ...items.map((i) => i.value));
      return {
        html: `
  <section id="s-stats" class="clip scene" data-start="0" data-duration="8" data-track-index="1">
    <h1 class="title">${escapeHtml(v.title)}</h1>
    ${items.map((it, i) => `<div class="stat" style="top:${30 + i * 15}cqh">
      <span class="label">${escapeHtml(it.label)}</span>
      <span class="count" style="--to:${it.value}"></span>
      <span class="track"><span class="bar" style="width:${Math.max(3, Math.round((it.value / max) * 100))}%;background:${series[i % series.length]}"></span></span>
    </div>`).join('\n    ')}
  </section>`,
        css: `
  @property --n{syntax:'<integer>';inherits:false;initial-value:0}
  .title{position:absolute;left:8cqw;right:8cqw;top:10cqh;margin:0;font:900 8cqmin/1.05 var(--display);letter-spacing:-.02em}
  .stat{position:absolute;left:8cqw;right:8cqw;display:grid;grid-template-columns:1fr auto;align-items:baseline;row-gap:1.5cqmin}
  .label{font-size:4.4cqmin;opacity:.85}
  .count{font:900 6cqmin var(--display);color:var(--highlight);counter-reset:n var(--n);text-align:right}
  .count::after{content:counter(n)}
  .track{grid-column:1/-1;height:2.2cqmin;border-radius:2cqmin;background:color-mix(in srgb, var(--ink) 15%, transparent);overflow:hidden}
  .bar{display:block;height:100%;background:var(--accent);border-radius:2cqmin;transform-origin:left}`,
        script: `
  hf('.title', [{opacity:0, transform:'translateY(4cqh)'}, {opacity:1, transform:'none'}], {at:0.2, d:0.7});
  hf('.stat', [{opacity:0, transform:'translateY(3cqh)'}, {opacity:1, transform:'none'}], {at:0.8, d:0.5, stagger:0.25});
  hf('.bar', [{transform:'scaleX(0)'}, {transform:'none'}], {at:1.0, d:1.6, stagger:0.25, ease:'out'});
  document.querySelectorAll('.count').forEach(function(el, i){
    var to = Number(getComputedStyle(el).getPropertyValue('--to')) || 0;
    hfEl(el, [{'--n':0}, {'--n':to}], {at:1.0 + i * 0.25, d:1.6, ease:'out'});
  });
  hf('#s-stats', [{opacity:1}, {opacity:0}], {at:7.5, d:0.5, ease:'in'});`,
      };
    },
  },
  {
    id: 'bas-de-titre',
    name: 'Bas de titre',
    use: 'A lower third over a video: a name and a role. Transparent background, for a WebM overlay.',
    duration: 6,
    transparent: true,
    slots: [
      { key: 'name', label: 'Nom', example: 'Aminata Ouédraogo' },
      { key: 'role', label: 'Fonction', example: 'Gérante, Boutique du Centre' },
    ],
    body: (v) => ({
      html: `
  <section id="s-third" class="clip scene" data-start="0" data-duration="6" data-track-index="1">
    <div class="third"><span class="accent"></span><div class="plate"><b class="name">${escapeHtml(v.name)}</b><span class="role">${escapeHtml(v.role)}</span></div></div>
  </section>`,
      css: `
  .third{position:absolute;left:6cqw;bottom:12cqh;display:flex;align-items:stretch}
  .accent{width:1.4cqmin;background:var(--accent)}
  .plate{background:var(--background);padding:2.4cqmin 4cqmin;display:flex;flex-direction:column;gap:.6cqmin}
  .name{font:800 4.6cqmin var(--display)}
  .role{font-size:3.2cqmin;opacity:.8}`,
      script: `
  hf('.accent', [{transform:'scaleY(0)'}, {transform:'none'}], {at:0.2, d:0.4, ease:'snap'});
  hf('.plate', [{clipPath:'inset(0 100% 0 0)'}, {clipPath:'inset(0 0 0 0)'}], {at:0.45, d:0.6, ease:'snap'});
  hf('.name', [{opacity:0, transform:'translateX(-3cqw)'}, {opacity:1, transform:'none'}], {at:0.7, d:0.5});
  hf('.role', [{opacity:0}, {opacity:.8}], {at:0.95, d:0.5});
  hf('.third', [{opacity:1, transform:'none'}, {opacity:0, transform:'translateX(-4cqw)'}], {at:5.4, d:0.5, ease:'in'});`,
    }),
  },
  {
    id: 'sous-titres',
    name: 'Sous-titres',
    use: 'Word-by-word captions, over a video or a plain background; key words in the highlight colour (write them *between stars*).',
    duration: 8,
    slots: [
      { key: 'text', label: 'Texte', example: 'Livraison *offerte* dès 50 sacs de ciment, partout à Ouaga' },
      { key: 'video', label: 'Vidéo de fond (chemin, facultatif)', example: '' },
    ],
    body: (v, ctx) => {
      const ws = words(v.text);
      const per = Math.max(0.22, Math.min(0.6, 7 / Math.max(1, ws.length))) / ctx.speed;
      const duration = Math.max(3, Math.ceil(ws.length * per + 1.2));
      const spans = ws.map((w) => {
        const hot = /^\*.*\*[.,!?]?$/.test(w);
        return `<span class="cw${hot ? ' hot' : ''}">${escapeHtml(w.replace(/\*/g, ''))}</span>`;
      }).join(' ');
      return {
        duration,
        html: `${v.video ? `
  <video id="bg" class="clip" src="${escapeHtml(v.video)}" data-start="0" data-duration="${duration}" data-track-index="0" data-has-audio="true" playsinline></video>` : ''}
  <section id="s-captions" class="clip scene" data-start="0" data-duration="${duration}" data-track-index="1">
    <p class="captions">${spans}</p>
  </section>`,
        css: `
  #bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .captions{position:absolute;left:7cqw;right:7cqw;bottom:16cqh;margin:0;text-align:center;font:900 7cqmin/1.25 var(--display);text-shadow:0 .4cqmin 1.6cqmin rgba(0,0,0,.6)}
  .cw{display:inline-block}
  .hot{color:var(--highlight)}`,
        script: `
  hf('.cw', [{opacity:0, transform:'translateY(2cqh) scale(.9)'}, {opacity:1, transform:'none'}], {at:0.3, d:0.25, stagger:${per.toFixed(3)}, ease:'out'});
  hf('.hot', [{transform:'none'}, {transform:'scale(1.12)'}, {transform:'none'}], {at:0.3, d:0.5, stagger:${per.toFixed(3)}});
  hf('#s-captions', [{opacity:1}, {opacity:0}], {at:${(duration - 0.5).toFixed(2)}, d:0.5, ease:'in'});`,
      };
    },
  },
  {
    id: 'compte-a-rebours',
    name: 'Compte à rebours',
    use: 'A countdown to a launch, a live or an opening: the count, then the title and the date.',
    duration: 6,
    slots: [
      { key: 'from', label: 'Compter depuis', example: '3' },
      { key: 'title', label: 'Titre', example: 'Ouverture de la boutique' },
      { key: 'date', label: 'Date', example: 'Samedi 18 octobre · 10 h' },
    ],
    body: (v) => {
      const from = Math.max(1, Math.min(10, Math.round(num(v.from, 3))));
      const duration = from + 3;
      const digits = Array.from({ length: from }, (_, i) => from - i)
        .map((n, i) => `<div class="digit" data-i="${i}">${n}</div>`).join('');
      return {
        duration,
        html: `
  <section id="s-count" class="clip scene" data-start="0" data-duration="${from}" data-track-index="1">
    <svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg>
    ${digits}
  </section>
  <section id="s-reveal" class="clip scene" data-start="${from}" data-duration="3" data-track-index="2">
    <h1 class="title">${escapeHtml(v.title)}</h1>
    <p class="date">${escapeHtml(v.date)}</p>
  </section>`,
        css: `
  .ring{position:absolute;left:50%;top:44%;width:60cqmin;height:60cqmin;margin:-30cqmin;transform:rotate(-90deg)}
  .ring circle{fill:none;stroke:var(--highlight);stroke-width:3;stroke-dasharray:277;stroke-linecap:round}
  .digit{position:absolute;left:0;right:0;top:44%;transform:translateY(-50%);text-align:center;font:900 34cqmin/1 var(--display);opacity:0}
  .title{position:absolute;left:8cqw;right:8cqw;top:36%;margin:0;text-align:center;font:900 9cqmin/1.05 var(--display)}
  .date{position:absolute;left:8cqw;right:8cqw;top:58%;margin:0;text-align:center;font-weight:700;font-size:5cqmin;color:var(--highlight)}`,
        script: `
  hf('.ring circle', [{strokeDashoffset:0}, {strokeDashoffset:277}], {at:0, d:1, n:${from}, ease:'linear'});
  document.querySelectorAll('.digit').forEach(function(el, i){
    hfEl(el, [{opacity:0, transform:'translateY(-50%) scale(1.6)'}, {opacity:1, transform:'translateY(-50%) scale(1)', offset:.25}, {opacity:1, transform:'translateY(-50%) scale(1)', offset:.8}, {opacity:0, transform:'translateY(-50%) scale(.6)'}], {at:i, d:1, ease:'linear'});
  });
  hf('.title', [{opacity:0, transform:'scale(.6)'}, {opacity:1, transform:'none'}], {at:${from + 0.1}, d:0.7, ease:'spring'});
  hf('.date', [{opacity:0, transform:'translateY(3cqh)'}, {opacity:1, transform:'none'}], {at:${from + 0.5}, d:0.6});`,
      };
    },
  },
  {
    id: 'typo-cinetique',
    name: 'Typo cinétique',
    use: 'Kinetic type: a few short lines revealed one after another, letter by letter.',
    duration: 8,
    slots: [{ key: 'lines', label: 'Lignes', example: 'Bienvenue\nchez Sahel Net\nl’internet\nqui vous suit', list: true }],
    body: (v, ctx) => {
      const ls = lines(v.lines).slice(0, 5);
      const step = 1.3 / ctx.speed;
      const duration = Math.max(4, Math.ceil(ls.length * step + 2));
      const html = ls.map((l, i) => `<p class="line" style="top:${50 - (ls.length * 6) + i * 12}cqh">${[...l].map((c) => `<span class="ch">${c === ' ' ? '&nbsp;' : escapeHtml(c)}</span>`).join('')}</p>`).join('\n    ');
      return {
        duration,
        html: `
  <section id="s-type" class="clip scene" data-start="0" data-duration="${duration}" data-track-index="1">
    ${html}
  </section>`,
        css: `
  .line{position:absolute;left:8cqw;right:8cqw;margin:0;font:900 9cqmin/1 var(--display);letter-spacing:-.02em}
  .line:nth-child(even){color:var(--highlight)}
  .ch{display:inline-block}`,
        script: `
  document.querySelectorAll('.line').forEach(function(line, i){
    line.querySelectorAll('.ch').forEach(function(ch, j){
      hfEl(ch, [{opacity:0, transform:'translateY(3cqh) rotate(8deg)'}, {opacity:1, transform:'none'}], {at:0.3 + i * ${step.toFixed(2)} + j * 0.035, d:0.4, ease:'out'});
    });
  });
  hf('#s-type', [{opacity:1}, {opacity:0, transform:'scale(1.06)'}], {at:${(duration - 0.6).toFixed(2)}, d:0.6, ease:'in'});`,
      };
    },
  },
  {
    id: 'infographie',
    name: 'Infographie',
    use: 'One percentage told as a gauge: the ring fills while the number counts.',
    duration: 6,
    slots: [
      { key: 'percent', label: 'Pourcentage', example: '68' },
      { key: 'label', label: 'Ce qu’il mesure', example: 'de nos clients nous recommandent' },
      { key: 'source', label: 'Source (facultatif)', example: 'Enquête clients, septembre 2026' },
    ],
    body: (v) => {
      const p = Math.max(0, Math.min(100, Math.round(num(v.percent, 50))));
      return {
        html: `
  <section id="s-gauge" class="clip scene" data-start="0" data-duration="6" data-track-index="1">
    <svg class="gauge" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42"/></svg>
    <div class="pct" style="--to:${p}"></div>
    <p class="label">${escapeHtml(v.label)}</p>
    ${v.source ? `<p class="source">${escapeHtml(v.source)}</p>` : ''}
  </section>`,
        css: `
  @property --n{syntax:'<integer>';inherits:false;initial-value:0}
  .gauge{position:absolute;left:50%;top:38%;width:56cqmin;height:56cqmin;margin:-28cqmin;transform:rotate(-90deg)}
  .gauge circle{fill:none;stroke-width:9;stroke-linecap:round}
  .gauge .bg{stroke:color-mix(in srgb, var(--ink) 14%, transparent)}
  .gauge .fg{stroke:var(--accent);stroke-dasharray:264;stroke-dashoffset:264}
  .pct{position:absolute;left:0;right:0;top:38%;transform:translateY(-50%);text-align:center;font:900 15cqmin var(--display);counter-reset:n var(--n)}
  .pct::after{content:counter(n) '%'}
  .label{position:absolute;left:10cqw;right:10cqw;top:66%;margin:0;text-align:center;font:700 5.4cqmin/1.25 var(--display)}
  .source{position:absolute;left:10cqw;right:10cqw;bottom:6%;margin:0;text-align:center;font-size:3cqmin;opacity:.6}`,
        script: `
  hf('.gauge .fg', [{strokeDashoffset:264}, {strokeDashoffset:${(264 * (1 - p / 100)).toFixed(1)}}], {at:0.4, d:1.8, ease:'out'});
  hf('.pct', [{'--n':0}, {'--n':${p}}], {at:0.4, d:1.8, ease:'out'});
  hf('.label', [{opacity:0, transform:'translateY(3cqh)'}, {opacity:1, transform:'none'}], {at:1.6, d:0.6});
  hf('.source', [{opacity:0}, {opacity:.6}], {at:2.2, d:0.6});
  hf('#s-gauge', [{opacity:1}, {opacity:0}], {at:5.5, d:0.5, ease:'in'});`,
      };
    },
  },
  {
    id: 'presentation-produit',
    name: 'Présentation produit',
    use: 'A keynote-style launch film for a product, an app or a service: the name, three promise words, the product as the hero with its strengths, a demo (a request typed, the pointer clicking, the result), then the call to action. Best in 16:9 for a screen or YouTube; works in every format.',
    duration: 20,
    slots: [
      { key: 'name', label: 'Nom du produit', example: 'Sahel Net Fibre' },
      { key: 'tagline', label: 'Signature', example: 'L’internet qui ne vous lâche pas.' },
      { key: 'promise', label: 'Trois mots', example: 'Rapide.\nStable.\nIllimité.', list: true },
      { key: 'image', label: 'Photo du produit', example: '', image: true },
      { key: 'features', label: 'Atouts', example: 'Jusqu’à 500 Mb/s\nInstallée en 48 h\nAssistance 7j/7', list: true },
      { key: 'request', label: 'Demande tapée', example: 'Fibre 100 Mb/s à Ouaga 2000' },
      { key: 'action', label: 'Bouton', example: 'Commander' },
      { key: 'result', label: 'Résultat', example: 'Commande confirmée · installation jeudi' },
      { key: 'cta', label: 'Appel à l’action', example: 'sahelnet.bf' },
    ],
    body: (v, ctx) => {
      const promise = lines(v.promise).slice(0, 3);
      const features = lines(v.features).slice(0, 3);
      const hero = v.image
        ? `<img class="hero-img" id="hero" src="${escapeHtml(v.image)}" alt="">`
        : `<div class="hero-card" id="hero">${logoMark(ctx, 'mark', 'hero-logo')}<b>${escapeHtml(v.name)}</b></div>`;
      return {
        html: `
  <section id="s-open" class="clip scene" data-start="0" data-duration="3.3" data-track-index="1">
    <div class="center">
      ${logoMark(ctx, 'mark open-mark', 'open-logo')}
      <h1 class="pname" id="open-name">${escapeHtml(v.name)}</h1>
      <p class="ptag" id="open-tag">${escapeHtml(v.tagline)}</p>
    </div>
  </section>
  <section id="s-promise" class="clip scene" data-start="3.2" data-duration="4.1" data-track-index="2">
    <div class="center"><div class="words">${promise.map((w, i) => `<span class="pw${i === promise.length - 1 ? ' last' : ''}" id="pw${i}">${escapeHtml(w)}</span>`).join(' ')}</div></div>
  </section>
  <section id="s-hero" class="clip scene" data-start="7.2" data-duration="4.4" data-track-index="3">
    <div class="hero-wrap">${hero}</div>
    <ul class="feats">${features.map((f) => `<li><i></i>${escapeHtml(f)}</li>`).join('')}</ul>
  </section>
  <section id="s-demo" class="clip scene" data-start="11.5" data-duration="5" data-track-index="4">
    <div class="cam" id="cam">
      <div class="device">
        <div class="dbar"><i></i><i></i><i></i></div>
        <div class="dname">${logoMark(ctx, 'mark', 'demo-logo')}<b>${escapeHtml(v.name)}</b></div>
        <div class="field" id="field"></div>
        <div class="btn" id="btn">${escapeHtml(v.action)}</div>
        <div class="done" id="done"><i>✓</i>${escapeHtml(v.result)}</div>
      </div>
    </div>
  </section>
  <section id="s-end" class="clip scene" data-start="16.4" data-duration="3.6" data-track-index="5">
    <div class="center">
      ${logoMark(ctx, 'mark open-mark', 'end-logo')}
      <h1 class="pname" id="end-name">${escapeHtml(v.name)}</h1>
      <div class="endcta" id="end-cta">${escapeHtml(v.cta)}</div>
    </div>
  </section>`,
        css: `
  .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.4cqmin;padding:0 8cqw;text-align:center}
  .open-mark{width:13cqmin;height:13cqmin;font-size:7cqmin;border-radius:3.2cqmin}
  .pname{margin:0;font:800 10cqmin/1.04 var(--display);letter-spacing:-.045em;text-wrap:balance}
  .ptag{margin:0;font:500 4.2cqmin/1.25 var(--text);opacity:.65;letter-spacing:-.01em;text-wrap:balance}
  .words{display:flex;flex-wrap:wrap;justify-content:center;gap:0 3.4cqmin;font:800 13cqmin/1.08 var(--display);letter-spacing:-.05em}
  .pw.last{color:var(--highlight)}
  .hero-wrap{position:absolute;left:8cqw;right:8cqw;top:8cqh;height:52cqh;display:grid;place-items:center}
  .hero-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:3cqmin}
  .hero-card{width:min(76cqw,70cqh);aspect-ratio:16/10;border-radius:4cqmin;background:var(--accent);color:var(--on-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.5cqmin;font:800 6.4cqmin/1.05 var(--display);letter-spacing:-.03em;text-align:center;padding:0 4cqmin;box-sizing:border-box}
  .hero-card .mark{width:11cqmin;height:11cqmin;font-size:6cqmin;border-radius:2.6cqmin;background:var(--on-accent);color:var(--accent)}
  .feats{position:absolute;left:8cqw;right:8cqw;top:66cqh;margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:2.2cqmin 5cqmin;font:600 4.2cqmin/1.2 var(--text)}
  .feats li{display:flex;align-items:center;gap:1.6cqmin}
  .feats i{width:1.6cqmin;height:1.6cqmin;border-radius:50%;background:var(--highlight);flex:none}
  .cam{position:absolute;inset:0;display:grid;place-items:center;transform-origin:50% 50%}
  .device{position:relative;width:min(84cqw,120cqh);border-radius:3cqmin;background:color-mix(in srgb,var(--ink) 7%,var(--background));border:.2cqmin solid color-mix(in srgb,var(--ink) 16%,transparent);padding:7cqmin 5cqmin 5cqmin;box-sizing:border-box;display:flex;flex-direction:column;gap:3cqmin;box-shadow:0 4cqmin 8cqmin rgba(0,0,0,.35)}
  .dbar{position:absolute;left:3cqmin;top:2.4cqmin;display:flex;gap:1.2cqmin}
  .dbar i{width:1.6cqmin;height:1.6cqmin;border-radius:50%;background:color-mix(in srgb,var(--ink) 25%,transparent)}
  .dname{display:flex;align-items:center;gap:1.6cqmin;font:700 3.6cqmin var(--display)}
  .dname .mark{width:5.4cqmin;height:5.4cqmin;font-size:3cqmin;border-radius:1.4cqmin}
  .field{min-height:9cqmin;border-radius:2cqmin;background:var(--background);border:.2cqmin solid color-mix(in srgb,var(--ink) 18%,transparent);display:flex;align-items:center;padding:0 3cqmin;font:500 3.6cqmin var(--text)}
  .btn{align-self:flex-end;background:var(--accent);color:var(--on-accent);font:700 3.6cqmin var(--text);padding:2.2cqmin 4.4cqmin;border-radius:2cqmin}
  .done{display:flex;align-items:center;gap:2cqmin;font:600 3.6cqmin/1.2 var(--text);color:var(--ink)}
  .done i{font-style:normal;width:5.4cqmin;height:5.4cqmin;border-radius:50%;background:var(--highlight);color:var(--background);display:grid;place-items:center;font-size:3cqmin;font-weight:900;flex:none}
  .endcta{margin-top:1.6cqmin;background:var(--ink);color:var(--background);font:700 4.4cqmin var(--text);padding:2.4cqmin 5cqmin;border-radius:99cqmin}`,
        script: `
  // 1 · The name.
  kit.enter('#open-logo', 'pop', {at:.2, d:.7, ease:'spring'});
  kit.reveal('#open-name', {at:.5});
  kit.reveal('#open-tag', {at:1.1, stagger:.04});
  kit.float('#s-open .center', {at:0, d:3.3, amp:6});
  kit.exit('#s-open .center', 'blur', {at:2.9, d:.4});
  // 2 · Three words, one beat each; the last in the highlight.
  document.querySelectorAll('.pw').forEach(function(w, i){ kit.enter(w, 'blur', {at:3.35 + i * .75, d:.7, ease:'apple'}); });
  kit.float('#s-promise .words', {at:3.2, d:4.1, amp:5});
  kit.exit('#s-promise .words', 'fade', {at:6.95, d:.35});
  // 3 · The product, the hero; its strengths underneath.
  kit.enter('#hero', 'scale', {at:7.3, d:1, ease:'apple'});
  kit.float('.hero-wrap', {at:7.2, d:4.4, amp:8});
  kit.shine('#hero', {at:8.3, d:1.2});
  kit.enter('.feats li', 'rise', {at:8.6, stagger:.3});
  kit.exit('#s-hero .hero-wrap, #s-hero .feats', 'fade', {at:11.25, d:.35});
  // 4 · The demo: typed, pointed, clicked, done.
  kit.enter('.device', 'rise', {at:11.55, d:.8, ease:'apple'});
  var typed = kit.type('#field', ${JSON.stringify(v.request)}, {at:12.3, cps:22, caretUntil:14.3});
  var click = Math.max(13.9, Math.min(14.6, typed + .35));
  var b = kit.center('#btn');
  kit.cursor(null, [[12.6, b[0] + 260, b[1] + 220], [click - .15, b[0], b[1]]], {clicks:[click]});
  kit.enter('#btn', 'fade', {at:11.9, d:.4});
  hfEl(document.getElementById('btn'), [{scale:'1'}, {scale:'.94', offset:.4}, {scale:'1'}], {at:click, d:.3, ease:'inout'});
  kit.enter('#done', 'rise', {at:click + .35, d:.6, ease:'spring'});
  kit.camera('#cam', [[11.5, 1, 0, 0], [16.4, 1.08, 0, 0]]);
  // 5 · The call to action, held.
  kit.enter('#end-logo', 'pop', {at:16.5, d:.7, ease:'spring'});
  kit.reveal('#end-name', {at:16.75});
  kit.enter('#end-cta', 'scale', {at:17.4, d:.6, ease:'apple'});
  kit.shine('#end-cta', {at:18.2, d:1});`,
      };
    },
  },

  {
    id: 'revelation-produit',
    name: 'Révélation produit',
    use: 'A physical product revealed on a studio background (cosmetics, drink, clothing, phone): a title, the product as the hero with a light sweep, three strengths drawn to it, then the price landing and the call to action. Best with a cut-out product photo.',
    duration: 12,
    slots: [
      { key: 'title', label: 'Titre', example: 'Le soin de vos mains.' },
      { key: 'image', label: 'Photo du produit (détourée de préférence)', example: '', image: true },
      { key: 'name', label: 'Nom du produit', example: 'Beurre de karité pur' },
      { key: 'features', label: 'Atouts', example: 'Karité pur\nSans parfum\nFait à Bobo', list: true },
      { key: 'price', label: 'Prix', example: '3 500 FCFA' },
      { key: 'cta', label: 'Appel à l’action', example: 'Commander sur WhatsApp' },
    ],
    body: (v, ctx) => {
      const features = lines(v.features).slice(0, 3);
      const [amount, ...unit] = v.price.trim().split(/\s+(?=[^\d\s]+$)/);
      const hero = v.image
        ? `<img class="rp-img" id="rp-hero" src="${escapeHtml(v.image)}" alt="">`
        : `<div class="rp-card" id="rp-hero">${logoMark(ctx, 'mark', 'rp-logo')}<b>${escapeHtml(v.name)}</b></div>`;
      return {
        html: `
  <section id="s-rp" class="clip scene" data-start="0" data-duration="12" data-track-index="1">
    <h1 class="rp-title" id="rp-title">${escapeHtml(v.title)}</h1>
    <div class="rp-stage" id="rp-stage"><div class="rp-floor"></div><div class="rp-float">${hero}</div></div>
    <ul class="rp-feats">${features.map((f) => `<li><i></i><span>${escapeHtml(f)}</span></li>`).join('')}</ul>
    <div class="rp-price" id="rp-price"><b>${escapeHtml(amount ?? v.price)}</b>${unit.length ? `<small>${escapeHtml(unit.join(' '))}</small>` : ''}</div>
    <div class="rp-cta" id="rp-cta">${escapeHtml(v.cta)}</div>
  </section>`,
        css: `
  .rp-title{position:absolute;left:8cqw;right:8cqw;top:7cqh;margin:0;font:800 8.4cqmin/1.05 var(--display);letter-spacing:-.035em;text-wrap:balance}
  .rp-stage{position:absolute;left:10cqw;right:10cqw;top:24cqh;height:50cqh}
  .rp-float{position:absolute;inset:0 0 6cqh;display:grid;place-items:center}
  .rp-img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 3cqmin 4cqmin rgba(0,0,0,.25))}
  .rp-card{width:min(60cqw,40cqh);aspect-ratio:3/4;border-radius:5cqmin;background:var(--accent);color:var(--on-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3cqmin;padding:4cqmin;box-sizing:border-box;text-align:center;font:800 5.4cqmin/1.1 var(--display)}
  .rp-card .mark{width:11cqmin;height:11cqmin;font-size:6cqmin;border-radius:2.6cqmin;background:var(--on-accent);color:var(--accent)}
  .rp-floor{position:absolute;left:20%;right:20%;bottom:2cqh;height:3cqh;border-radius:50%;background:color-mix(in srgb,var(--ink) 14%,transparent)}
  .rp-feats{position:absolute;right:7cqw;top:30cqh;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7cqh;align-items:flex-end;font:700 4.4cqmin/1.15 var(--text)}
  .rp-feats li{display:flex;align-items:center;gap:2cqmin}
  .rp-feats i{display:block;width:12cqw;height:.4cqmin;background:var(--accent);transform-origin:right}
  .rp-feats span{max-width:32cqw;text-align:right}
  .rp-price{position:absolute;right:7cqw;top:8cqh;width:30cqmin;height:30cqmin;border-radius:50%;background:var(--accent);color:var(--on-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1}
  .rp-price b{font:900 7.4cqmin/1 var(--display);letter-spacing:-.03em}
  .rp-price small{font:700 3.2cqmin var(--text);margin-top:1cqmin;opacity:.85}
  .rp-cta{position:absolute;left:12cqw;right:12cqw;bottom:9cqh;background:var(--ink);color:var(--background);border-radius:99cqmin;text-align:center;padding:3cqmin;font:700 4.4cqmin var(--text)}`,
        script: `
  kit.reveal('#rp-title', {at:.2});
  kit.enter('#rp-hero', 'blur', {at:.5, d:1.3, ease:'apple'});
  kit.enter('.rp-floor', 'fade', {at:.8, d:1});
  kit.float('.rp-float', {at:0, d:12, amp:10});
  kit.shine('#rp-hero', {at:2.2, d:1.3});
  kit.exit('#rp-title', 'fade', {at:4.4, d:.4});
  // The product steps aside for its strengths, each drawn to it.
  hfEl(document.getElementById('rp-stage'), [{translate:'0 0', scale:'1'}, {translate:'-16cqw 0', scale:'.86'}], {at:4.6, d:1.1, ease:'apple'});
  document.querySelectorAll('.rp-feats li').forEach(function(li, i){
    hfEl(li.querySelector('i'), [{transform:'scaleX(0)'}, {transform:'none'}], {at:5.3 + i * .45, d:.5, ease:'snap'});
    kit.enter(li.querySelector('span'), 'left', {at:5.5 + i * .45, d:.5});
  });
  kit.exit('.rp-feats', 'fade', {at:8.6, d:.4});
  hfEl(document.getElementById('rp-stage'), [{translate:'-16cqw 0', scale:'.86'}, {translate:'0 -4cqh', scale:'.8'}], {at:8.7, d:.9, ease:'apple'});
  kit.enter('#rp-price', 'pop', {at:9.1, d:.7, ease:'spring'});
  kit.enter('#rp-cta', 'rise', {at:9.5, d:.6});
  kit.shine('#rp-cta', {at:10.4, d:1});`,
      };
    },
  },
  {
    id: 'temoignage',
    name: 'Témoignage client',
    use: 'A customer review told on screen: the quote appears word by word (key words *between stars* in the highlight colour), the stars light up, then the customer’s photo and name. Social proof.',
    duration: 10,
    slots: [
      { key: 'quote', label: 'Citation', example: 'Livré en *2 heures*, et la qualité est *parfaite*. Je recommande.' },
      { key: 'author', label: 'Nom du client', example: 'Aïcha K.' },
      { key: 'role', label: 'Qui il est', example: 'Cliente à Ouagadougou' },
      { key: 'photo', label: 'Photo du client', example: '', image: true },
      { key: 'rating', label: 'Note (1 à 5, vide pour aucune)', example: '5' },
    ],
    body: (v, ctx) => {
      const ws = words(v.quote).slice(0, 40);
      const rating = Math.round(Math.min(5, Math.max(0, num(v.rating, 0))));
      const initials = escapeHtml(words(v.author).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·');
      const per = Math.min(.16, 3.2 / Math.max(1, ws.length));
      const quoteEnd = 1.2 + ws.length * per;
      return {
        html: `
  <section id="s-tm" class="clip scene" data-start="0" data-duration="10" data-track-index="1">
    <div class="tm-mark" id="tm-mark">“</div>
    <div class="tm-body">
      <p class="tm-quote">${starred(ws).map(({ w, hot }) => `<span class="tw${hot ? ' hot' : ''}">${escapeHtml(w)}</span>`).join(' ')}</p>
      ${rating ? `<div class="tm-stars">${Array.from({ length: 5 }, (_, i) => `<span class="star${i < rating ? ' on' : ''}">★</span>`).join('')}</div>` : ''}
      <div class="tm-who" id="tm-who">${v.photo ? `<img class="tm-face" src="${escapeHtml(v.photo)}" alt="">` : `<span class="tm-face tm-initials">${initials}</span>`}<div><b>${escapeHtml(v.author)}</b><span>${escapeHtml(v.role)}</span></div></div>
    </div>
    <div class="tm-brand" id="tm-brand">${logoMark(ctx, 'mark', 'tm-logo')}<b>${escapeHtml(ctx.brand.name)}</b></div>
  </section>`,
        css: `
  .tm-mark{position:absolute;left:7cqw;top:5cqh;font:900 34cqmin/1 Georgia,'Times New Roman',serif;color:var(--highlight)}
  .tm-body{position:absolute;left:8cqw;right:8cqw;top:26cqh;bottom:14cqh;display:flex;flex-direction:column;justify-content:center;gap:5cqmin}
  .tm-quote{margin:0;font:700 6.6cqmin/1.28 var(--display);letter-spacing:-.015em}
  .tw{display:inline-block}
  .tw.hot{color:var(--highlight)}
  .tm-stars{display:flex;gap:1.6cqmin;font-size:6.4cqmin;line-height:1}
  .star{color:color-mix(in srgb,var(--ink) 22%,transparent)}
  .star.on{color:var(--highlight)}
  .tm-who{display:flex;align-items:center;gap:3.4cqmin}
  .tm-face{width:15cqmin;height:15cqmin;border-radius:50%;object-fit:cover;flex:none}
  .tm-initials{display:grid;place-items:center;background:var(--accent);color:var(--on-accent);font:800 5.4cqmin var(--display)}
  .tm-who b{display:block;font:700 4.6cqmin var(--text)}
  .tm-who span{font-size:3.8cqmin;opacity:.7}
  .tm-brand{position:absolute;left:8cqw;bottom:6cqh;display:flex;align-items:center;gap:2cqmin;font:700 3.8cqmin var(--display);opacity:.9}
  .tm-brand .mark{width:6cqmin;height:6cqmin;font-size:3.2cqmin;border-radius:1.5cqmin}`,
        script: `
  kit.enter('#tm-mark', 'drop', {at:.15, d:.8, ease:'spring'});
  hfEl(document.getElementById('tm-mark'), [{opacity:1}, {opacity:.25}], {at:1.1, d:.6});
  kit.enter('.tw', 'rise', {at:1.2, d:.45, stagger:${per.toFixed(3)}});
  hfEl(document.querySelector('.tm-quote'), [{scale:'1'}, {scale:'1.03'}], {at:1.2, d:8.8, ease:'linear'});
  kit.enter('.star', 'pop', {at:${(quoteEnd + .3).toFixed(2)}, d:.45, stagger:.12, ease:'spring'});
  kit.enter('#tm-who', 'rise', {at:${(quoteEnd + 1.2).toFixed(2)}, d:.6, ease:'apple'});
  kit.enter('#tm-brand', 'fade', {at:${(quoteEnd + 1.7).toFixed(2)}, d:.6});`,
      };
    },
  },
  {
    id: 'avant-apres',
    name: 'Avant / après',
    use: 'A transformation shown with two photos (renovation, hairdressing, cleaning, retouching, coaching): the before, a curtain wiping to the after, then back to the middle to compare, and a title. Needs both photos.',
    duration: 9,
    slots: [
      { key: 'before', label: 'Photo avant', example: '', image: true },
      { key: 'after', label: 'Photo après', example: '', image: true },
      { key: 'title', label: 'Titre', example: 'Salon refait en 3 jours.' },
      { key: 'cta', label: 'Appel à l’action', example: 'Devis gratuit · 70 00 00 00' },
      { key: 'labels', label: 'Étiquettes', example: 'AVANT\nAPRÈS', list: true },
    ],
    body: (v) => {
      const [lb, la] = [...lines(v.labels), 'AVANT', 'APRÈS'].filter(Boolean);
      const pic = (src: string, cls: string, label: string) =>
        src ? `<img class="ba-pic ${cls}" src="${escapeHtml(src)}" alt="">` : `<div class="ba-pic ${cls} ba-empty"><span>${escapeHtml(label)}</span></div>`;
      return {
        html: `
  <section id="s-ba" class="clip scene" data-start="0" data-duration="9" data-track-index="1">
    <div class="ba-frame" id="ba-frame">
      ${pic(v.before, 'ba-before', lb)}
      <div class="ba-after-wrap" id="ba-after">${pic(v.after, 'ba-after', la ?? 'APRÈS')}</div>
      <div class="ba-line" id="ba-line"><span class="ba-knob">⇆</span></div>
    </div>
    <span class="ba-tag ba-tag-b" id="ba-tag-b">${escapeHtml(lb)}</span>
    <span class="ba-tag ba-tag-a" id="ba-tag-a">${escapeHtml(la ?? 'APRÈS')}</span>
    <div class="ba-bottom" id="ba-bottom"><h1 class="ba-title" id="ba-title">${escapeHtml(v.title)}</h1><p class="ba-cta" id="ba-cta">${escapeHtml(v.cta)}</p></div>
  </section>`,
        css: `
  .ba-frame{position:absolute;inset:0;overflow:hidden}
  .ba-pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ba-empty{display:grid;place-items:center;font:900 12cqmin var(--display);letter-spacing:.06em}
  .ba-before.ba-empty{background:color-mix(in srgb,var(--ink) 30%,var(--background));color:var(--background)}
  .ba-after.ba-empty{background:var(--accent);color:var(--on-accent)}
  .ba-after-wrap{position:absolute;inset:0}
  .ba-line{position:absolute;top:0;bottom:0;left:0;width:.8cqmin;margin-left:-.4cqmin;background:#fff;box-shadow:0 0 3cqmin rgba(0,0,0,.45)}
  .ba-knob{position:absolute;top:50%;left:50%;width:11cqmin;height:11cqmin;margin:-5.5cqmin;border-radius:50%;background:#fff;color:#111;display:grid;place-items:center;font:900 5cqmin var(--text)}
  .ba-tag{position:absolute;top:6cqh;padding:1.6cqmin 3.4cqmin;border-radius:99cqmin;font:800 3.6cqmin var(--text);letter-spacing:.08em;background:rgba(0,0,0,.6);color:#fff}
  .ba-tag-b{left:6cqw}
  .ba-tag-a{right:6cqw;background:#fff;color:#111}
  .ba-bottom{position:absolute;left:0;right:0;bottom:0;padding:5cqh 8cqw 7cqh;background:var(--background);color:var(--ink);display:flex;flex-direction:column;gap:1.6cqmin}
  .ba-title{margin:0;font:800 8cqmin/1.05 var(--display);letter-spacing:-.03em;text-wrap:balance}
  .ba-cta{margin:0;font:600 4cqmin var(--text);color:var(--highlight)}`,
        script: `
  // The after is cut by a curtain whose edge is the line: both follow the same keys.
  var keys = [[0,100],[1.6,100],[3.4,0],[5.2,0],[6.4,50]];
  var span = 6.4, ease = EASES.inout;
  hfEl(document.getElementById('ba-after'), keys.map(function(k, i){ var f = {clipPath:'inset(0 0 0 ' + k[1] + '%)', offset:k[0] / span}; if (i < keys.length - 1) f.easing = ease; return f; }), {at:0, d:span, ease:'linear'});
  hfEl(document.getElementById('ba-line'), keys.map(function(k, i){ var f = {left:k[1] + '%', offset:k[0] / span}; if (i < keys.length - 1) f.easing = ease; return f; }), {at:0, d:span, ease:'linear'});
  // Hidden while the curtain rests against an edge.
  hfEl(document.getElementById('ba-line'), [{opacity:0, offset:0}, {opacity:0, offset:1.3 / 6.4}, {opacity:1, offset:1.6 / 6.4}, {opacity:1, offset:3.1 / 6.4}, {opacity:0, offset:3.4 / 6.4}, {opacity:0, offset:5.2 / 6.4}, {opacity:1, offset:5.5 / 6.4}, {opacity:1}], {at:0, d:6.4, ease:'linear'});
  kit.kenburns('.ba-frame', {at:0, d:9, to:1.06});
  kit.enter('#ba-tag-b', 'left', {at:.3, d:.5});
  kit.exit('#ba-tag-b', 'fade', {at:3, d:.3});
  kit.enter('#ba-tag-a', 'right', {at:3.3, d:.5});
  kit.shine('#ba-after', {at:3.7, d:1.2});
  kit.enter('#ba-tag-b', 'left', {at:6.3, d:.4});
  kit.enter('#ba-bottom', 'rise', {at:6.6, d:.7, ease:'apple'});
  kit.reveal('#ba-title', {at:6.8});
  kit.enter('#ba-cta', 'fade', {at:7.5, d:.5});`,
      };
    },
  },
  {
    id: 'offre-du-jour',
    name: 'Offre du jour',
    use: 'A flash deal for a WhatsApp Status or a story: the product pops, the old price is struck through, the new price lands with its discount stamp, and a countdown ticks to the end of the offer.',
    duration: 8,
    slots: [
      { key: 'product', label: 'Produit', example: 'Pagne wax 6 yards' },
      { key: 'image', label: 'Photo du produit', example: '', image: true },
      { key: 'old', label: 'Ancien prix', example: '15 000' },
      { key: 'new', label: 'Nouveau prix', example: '9 900' },
      { key: 'currency', label: 'Monnaie', example: 'F' },
      { key: 'left', label: 'Temps restant (hh:mm:ss)', example: '05:42:17' },
      { key: 'cta', label: 'Appel à l’action', example: 'Écrivez-nous sur WhatsApp' },
    ],
    body: (v, ctx) => {
      const before = num(v.old, 0);
      const after = num(v.new, 0);
      const off = before > 0 && after > 0 && after < before ? Math.round((1 - after / before) * 100) : 0;
      const [h, m, s] = [...v.left.split(':').map((x) => Math.max(0, Math.min(99, Math.round(num(x, 0))))), 0, 0, 0];
      const hero = v.image
        ? `<img class="od-img" id="od-hero" src="${escapeHtml(v.image)}" alt="">`
        : `<div class="od-card" id="od-hero">${logoMark(ctx, 'mark', 'od-logo')}</div>`;
      return {
        html: `
  <section id="s-od" class="clip scene" data-start="0" data-duration="8" data-track-index="1">
    <div class="od">
      <div class="od-top">${hero}</div>
      <div class="od-info">
        <h1 class="od-name" id="od-name">${escapeHtml(v.product)}</h1>
        <div class="od-prices">
          <span class="od-old" id="od-old">${escapeHtml(v.old)}<i id="od-strike"></i></span>
          <span class="od-new" id="od-new">${escapeHtml(v.new)}<small>${escapeHtml(v.currency)}</small></span>
          ${off ? `<div class="od-stamp" id="od-stamp">-${off} %</div>` : ''}
        </div>
        <div class="od-timer" id="od-timer"><div><b id="od-h"></b><small>heures</small></div><div><b id="od-m"></b><small>min</small></div><div><b id="od-s"></b><small>s</small></div></div>
        <p class="od-cta" id="od-cta">${escapeHtml(v.cta)}</p>
      </div>
    </div>
  </section>`,
        css: `
  .od{position:absolute;inset:6cqh 8cqw 7cqh;display:flex;flex-direction:column;gap:4cqmin}
  .od-top{flex:1 1 0;min-height:0;display:grid;place-items:center}
  .od-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:3cqmin}
  .od-card{height:100%;max-height:40cqmin;aspect-ratio:1;border-radius:5cqmin;background:var(--accent);display:grid;place-items:center}
  .od-card .mark{width:14cqmin;height:14cqmin;font-size:8cqmin;border-radius:3cqmin;background:var(--on-accent);color:var(--accent)}
  .od-info{display:flex;flex-direction:column;gap:3cqmin}
  .od-name{margin:0;font:800 7.4cqmin/1.05 var(--display);letter-spacing:-.03em;text-wrap:balance}
  .od-prices{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1cqmin}
  .od-old{position:relative;font:800 9cqmin/1 var(--display);opacity:.55}
  .od-old i{position:absolute;left:-3%;right:-3%;top:50%;height:1.2cqmin;background:var(--highlight);transform:rotate(-8deg)}
  .od-new{font:900 20cqmin/.95 var(--display);letter-spacing:-.05em;color:var(--highlight)}
  .od-new small{font-size:7cqmin;margin-left:1cqmin;letter-spacing:0}
  .od-stamp{position:absolute;right:0;top:0;rotate:10deg;border:.9cqmin solid var(--highlight);color:var(--highlight);border-radius:2cqmin;padding:1.4cqmin 3cqmin;font:900 6cqmin var(--display)}
  .od-timer{display:flex;gap:3cqmin}
  .od-timer div{flex:1;background:var(--ink);color:var(--background);border-radius:2.4cqmin;text-align:center;padding:2.4cqmin 0;font-variant-numeric:tabular-nums}
  .od-timer b{display:block;font:900 8cqmin/1 var(--display)}
  .od-timer small{display:block;font:600 2.8cqmin var(--text);margin-top:1cqmin;opacity:.8}
  .od-cta{margin:0;text-align:center;font:700 4.2cqmin var(--text)}
  @container (min-aspect-ratio: 5/4){
    .od{flex-direction:row;align-items:center;gap:6cqw}
    .od-top{flex:0 0 38%;height:100%}
    .od-card{max-height:none;width:100%;height:auto}
    .od-info{flex:1}
    .od-cta{text-align:left}
  }`,
        script: `
  kit.enter('#od-hero', 'pop', {at:.1, d:.7, ease:'spring'});
  kit.float('.od-top', {at:0, d:8, amp:8});
  kit.reveal('#od-name', {at:.4});
  kit.enter('#od-old', 'left', {at:1.3, d:.5});
  hfEl(document.getElementById('od-strike'), [{transform:'rotate(-8deg) scaleX(0)', transformOrigin:'left'}, {transform:'rotate(-8deg) scaleX(1)', transformOrigin:'left'}], {at:1.9, d:.35, ease:'snap'});
  kit.enter('#od-new', 'pop', {at:2.4, d:.7, ease:'spring'});
  if (document.getElementById('od-stamp')) hfEl(document.getElementById('od-stamp'), [{opacity:0, transform:'scale(2.2)'}, {opacity:1, transform:'none'}], {at:3, d:.35, ease:'snap'});
  kit.enter('#od-timer', 'rise', {at:3.6, d:.6});
  kit.count('#od-h', {at:3.6, d:.01, from:${h}, to:${h}, pad:true});
  kit.count('#od-m', {at:3.6, d:.01, from:${m}, to:${m}, pad:true});
  // The seconds tick down, one a second, as a real clock.
  kit.count('#od-s', {at:4.2, d:${Math.max(.01, Math.min(s, 3))}, from:${s}, to:${s - Math.min(s, 3)}, pad:true, ease:'linear'});
  kit.enter('#od-cta', 'fade', {at:4.4, d:.5});
  hfEl(document.getElementById('od-new'), [{scale:'1'}, {scale:'1.05'}, {scale:'1'}], {at:5.5, d:1, ease:'inout', n:2});`,
      };
    },
  },
  {
    id: 'catalogue',
    name: 'Catalogue en carrousel',
    use: 'New arrivals, a collection or a restock: 3 to 8 products slide by like a carousel swiped with a finger (the centre card large with its name and price, its neighbours peeking), then all of them in a grid with the call to action. About 2 s a product.',
    duration: 14,
    slots: [
      { key: 'kicker', label: 'Surtitre', example: 'Arrivage' },
      { key: 'title', label: 'Titre', example: 'Nouveautés de la semaine' },
      { key: 'products', label: 'Produits (nom | prix | photo)', example: 'Robe Faso Dan Fani | 18 000 F\nChemise bogolan | 12 500 F\nSac en cuir tressé | 9 000 F\nSandales en cuir | 6 500 F\nFoulard wax | 3 000 F', list: true, imageField: 2 },
      { key: 'cta', label: 'Appel à l’action', example: 'Commandez sur WhatsApp' },
    ],
    body: (v, ctx) => {
      const items = lines(v.products).slice(0, 8).map(fields).map(([name = '', price = '', img = '']) => ({ name, price, img }));
      if (!items.length) items.push({ name: v.title, price: '', img: '' });
      const n = items.length;
      const INTRO = 2.2, STEP = 2, SWIPE = .6;
      const at = (i: number) => INTRO + i * STEP;
      const gridAt = at(n) - .2;
      const duration = +(gridAt + 3.8).toFixed(2);
      // Sizes in pixels of this format: the carousel moves by whole cards.
      const cw = Math.round(Math.min(.56 * Math.min(ctx.width, ctx.height), .42 * ctx.height));
      const gap = Math.round(.06 * Math.min(ctx.width, ctx.height));
      const x = (j: number) => -(j * (cw + gap) + cw / 2);
      // Keys: card j held in the centre, then a swipe to the next one.
      const keys: Array<[number, number]> = [];
      for (let j = 0; j < n; j++) {
        keys.push([at(j), j]);
        if (j < n - 1) keys.push([at(j + 1) - SWIPE, j]);
      }
      const t0 = at(0), span = Math.max(.01, at(n - 1) - t0);
      const off = (t: number) => +((t - t0) / span).toFixed(4);
      const swipe = 'cubic-bezier(.3,1.25,.5,1)';
      const frames = (f: (j: number) => Record<string, string | number>) =>
        JSON.stringify(keys.map(([t, j], i) => ({ ...f(j), offset: off(t), ...(i < keys.length - 1 ? { easing: swipe } : {}) })));
      // The end grid: the column count that gives the largest tiles.
      const [gw, gh] = [ctx.width * .84, ctx.height * (ctx.width > ctx.height * 1.2 ? .5 : .56)];
      let cols = 1, side = 0;
      for (let c = 1; c <= n; c++) {
        const s = Math.min(gw / c, gh / Math.ceil(n / c)) - gap * .6;
        if (s > side) [cols, side] = [c, s];
      }
      const tint = (i: number) => `color-mix(in srgb,var(--accent) ${100 - (i % 4) * 20}%,var(--background))`;
      const pic = (p: { name: string; img: string }, i: number) =>
        p.img ? `<img src="${escapeHtml(p.img)}" alt="">` : `<span style="background:${tint(i)}">${escapeHtml((p.name.trim()[0] ?? '·').toUpperCase())}</span>`;
      return {
        duration,
        html: `
  <section id="s-ca-open" class="clip scene" data-start="0" data-duration="${INTRO}" data-track-index="1">
    <div class="ca-open"><span class="ca-kicker" id="ca-kicker">${escapeHtml(v.kicker)}</span><h1 class="ca-title" id="ca-title">${escapeHtml(v.title)}</h1></div>
  </section>
  <section id="s-ca-run" class="clip scene" data-start="${INTRO - .5}" data-duration="${(gridAt - INTRO + .8).toFixed(2)}" data-track-index="2">
    <div class="ca-count" id="ca-count"><b id="ca-n"></b><span> / ${n}</span></div>
    <div class="ca-stage" id="ca-stage"><div class="ca-track" id="ca-track">${items.map((p, i) => `
      <div class="ca-card" id="ca-c${i}"><div class="ca-pic">${pic(p, i)}</div><div class="ca-txt"><b>${escapeHtml(p.name)}</b>${p.price ? `<span>${escapeHtml(p.price)}</span>` : ''}</div></div>`).join('')}
    </div></div>
    <div class="ca-dots">${items.map((_, i) => `<i id="ca-d${i}"></i>`).join('')}</div>
  </section>
  <section id="s-ca-end" class="clip scene" data-start="${gridAt.toFixed(2)}" data-duration="${(duration - gridAt).toFixed(2)}" data-track-index="3">
    <div class="ca-end">
      <span class="ca-kicker">${escapeHtml(v.title)}</span>
      <div class="ca-grid">${items.map((p, i) => `<div class="ca-tile">${pic(p, i)}${p.price ? `<small>${escapeHtml(p.price)}</small>` : ''}</div>`).join('')}</div>
      <div class="ca-cta" id="ca-cta">${escapeHtml(v.cta)}</div>
    </div>
  </section>`,
        css: `
  .ca-open{position:absolute;inset:0 8cqw;display:flex;flex-direction:column;justify-content:center;gap:2.4cqmin}
  .ca-kicker{font:800 3.4cqmin var(--text);letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
  .ca-title{margin:0;font:800 10cqmin/1.02 var(--display);letter-spacing:-.035em;text-wrap:balance}
  .ca-count{position:absolute;right:8cqw;top:6cqh;font:800 4cqmin var(--text);font-variant-numeric:tabular-nums}
  .ca-count span{opacity:.55}
  .ca-stage{position:absolute;left:0;right:0;top:12cqh;bottom:14cqh;display:flex;align-items:center}
  .ca-track{position:relative;left:50%;display:flex;gap:${gap}px;align-items:center}
  .ca-card{flex:none;width:${cw}px;border-radius:${Math.round(cw * .07)}px;background:#fff;color:#141414;overflow:hidden;box-shadow:0 ${Math.round(cw * .05)}px ${Math.round(cw * .1)}px rgba(0,0,0,.18)}
  .ca-pic{aspect-ratio:4/5;display:grid}
  .ca-pic img,.ca-pic span,.ca-tile img,.ca-tile span{width:100%;height:100%;object-fit:cover;display:grid;place-items:center;color:var(--on-accent);font:900 ${Math.round(cw * .22)}px var(--display)}
  .ca-txt{padding:${Math.round(cw * .05)}px ${Math.round(cw * .065)}px ${Math.round(cw * .06)}px;display:flex;flex-direction:column;gap:${Math.round(cw * .015)}px}
  .ca-txt b{font:700 ${Math.round(cw * .068)}px/1.2 var(--text)}
  .ca-txt span{font:800 ${Math.round(cw * .085)}px/1 var(--display);color:var(--accent)}
  .ca-dots{position:absolute;left:0;right:0;bottom:8cqh;display:flex;justify-content:center;gap:1.6cqmin}
  .ca-dots i{display:block;width:2cqmin;height:2cqmin;border-radius:99px;background:currentColor;opacity:.25}
  .ca-end{position:absolute;inset:7cqh 8cqw 8cqh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqmin}
  .ca-grid{display:flex;flex-wrap:wrap;justify-content:center;max-width:${Math.ceil(cols * side + (cols - .5) * Math.round(gap * .6))}px;gap:${Math.round(gap * .6)}px}
  .ca-tile{position:relative;width:${Math.floor(side)}px;height:${Math.floor(side)}px;border-radius:${Math.round(side * .08)}px;overflow:hidden;display:grid}
  .ca-tile span{font-size:${Math.round(side * .3)}px}
  .ca-tile small{position:absolute;left:${Math.round(side * .06)}px;bottom:${Math.round(side * .06)}px;background:var(--background);color:var(--ink);border-radius:99px;padding:.4em .8em;font:800 ${Math.max(18, Math.round(side * .08))}px var(--text)}
  .ca-cta{background:var(--ink);color:var(--background);border-radius:99cqmin;padding:2.8cqmin 7cqmin;font:700 4.4cqmin var(--text);text-align:center}`,
        script: `
  kit.enter('#ca-kicker', 'fade', {at:.2, d:.5});
  kit.reveal('#ca-title', {at:.3});
  kit.exit('.ca-open', 'fade', {at:${INTRO - .45}, d:.4});
  kit.enter('#ca-stage', 'rise', {at:${INTRO - .5}, d:.7, ease:'apple'});
  kit.enter('#ca-count', 'fade', {at:${INTRO - .2}, d:.4});
  hfEl(document.getElementById('ca-track'), ${frames((j) => ({ translate: `${x(j)}px 0` }))}, {at:${t0}, d:${span}, ease:'linear'});
  ${items.map((_, i) => `hfEl(document.getElementById('ca-c${i}'), ${frames((j) => ({ scale: j === i ? '1' : '.82', opacity: j === i ? 1 : .5 }))}, {at:${t0}, d:${span}, ease:'linear'});
  hfEl(document.getElementById('ca-d${i}'), ${frames((j) => ({ width: j === i ? '6cqmin' : '2cqmin', opacity: j === i ? 1 : .25 }))}, {at:${t0}, d:${span}, ease:'linear'});
  kit.enter('#ca-c${i} .ca-txt > *', 'rise', {at:${(at(i) - .25).toFixed(2)}, d:.5, stagger:.12});
  kit.count('#ca-n', {at:${(i ? at(i) - .3 : t0 - .5).toFixed(2)}, d:.01, from:${i + 1}, to:${i + 1}});`).join('\n  ')}
  ${n > 1 ? `// A finger shows the swipe, once.
  var w = document.querySelector('[data-composition-id]').offsetWidth, y = kit.center('#ca-stage')[1];
  kit.cursor(null, [[${(at(1) - SWIPE - .5).toFixed(2)}, w * .72, y], [${(at(1) - SWIPE).toFixed(2)}, w * .72, y], [${at(1).toFixed(2)}, w * .3, y]], {clicks:[${(at(1) - SWIPE - .1).toFixed(2)}], hideAt:${(at(1) + .2).toFixed(2)}});` : ''}
  kit.exit('#ca-stage', 'fade', {at:${(gridAt - .1).toFixed(2)}, d:.3});
  kit.enter('.ca-end > .ca-kicker', 'fade', {at:${(gridAt + .1).toFixed(2)}, d:.4});
  kit.enter('.ca-tile', 'pop', {at:${(gridAt + .2).toFixed(2)}, d:.5, stagger:.08, ease:'spring'});
  kit.enter('#ca-cta', 'rise', {at:${(gridAt + .6 + n * .08).toFixed(2)}, d:.6});
  kit.shine('#ca-cta', {at:${(gridAt + 1.6 + n * .08).toFixed(2)}, d:1});`,
      };
    },
  },
  {
    id: 'menu',
    name: 'Menu animé',
    use: 'A restaurant’s, maquis’, bakery’s or caterer’s menu of the day: dishes by section, each sliding onto its dotted line up to its price, the dish of the day on its own card, then opening hours, delivery and the number. Also loops on a counter screen.',
    duration: 14,
    slots: [
      { key: 'place', label: 'Nom du lieu', example: 'Maquis Chez Awa' },
      { key: 'title', label: 'Titre', example: 'Le menu du jour' },
      { key: 'date', label: 'Date', example: 'Mercredi 15 octobre' },
      { key: 'menu', label: 'Menu (# rubrique, puis plat | prix)', example: '# Plats\nRiz gras | 1 500\nPoulet bicyclette | 3 500\nTô sauce gombo | 1 000\n# Boissons\nBissap | 300\nDégué | 500', list: true },
      { key: 'special', label: 'Plat du jour (nom | prix ; vide pour aucun)', example: 'Poisson braisé, attiéké | 2 500 F' },
      { key: 'image', label: 'Photo du plat du jour', example: '', image: true },
      { key: 'info', label: 'Infos pratiques', example: 'Ouvert de 11 h à 23 h\nLivraison à Ouaga 2000\n☎ 70 00 00 00', list: true },
    ],
    body: (v, ctx) => {
      const rows = lines(v.menu).slice(0, 16).map((l) => (l.startsWith('#') ? { sec: l.replace(/^#+\s*/, '') } : { dish: fields(l) }));
      const [sName = '', sPrice = ''] = fields(v.special);
      const info = lines(v.info).slice(0, 4);
      const listAt = 2.6;
      const listEnd = listAt + rows.length * .28 + 2.6;
      const specialAt = listEnd;
      const endAt = sName ? specialAt + 3.2 : listEnd;
      const duration = +(endAt + 3.4).toFixed(2);
      const twoCols = ctx.width > ctx.height * 1.2 && rows.length > 6;
      // A section stays whole in its column.
      const groups: Array<typeof rows> = [];
      for (const r of rows) ('sec' in r || !groups.length ? groups.push([r]) : groups[groups.length - 1].push(r));
      const perCol = twoCols ? Math.ceil(rows.length / 2) : rows.length;
      // The type fits the column: fewer lines, larger dishes (a line is about 1.9 em).
      const room = (ctx.height / Math.min(ctx.width, ctx.height)) * 100 * .78;
      // …and the longest line holds on one line (a character is about .6 em).
      const across = (ctx.width / Math.min(ctx.width, ctx.height)) * 100 * (twoCols ? .38 : .84);
      const longest = Math.max(10, ...rows.map((r) => ('sec' in r ? 0 : (r.dish[0] ?? '').length + (r.dish[1] ?? '').length)));
      const fs = Math.max(2.6, Math.min(6.6, room / (perCol * 1.9 + 1), across / (longest * .6 + 4)));
      return {
        duration,
        html: `
  <section id="s-mn-open" class="clip scene" data-start="0" data-duration="${listAt}" data-track-index="1">
    <div class="mn-open">
      <span class="mn-place" id="mn-place">${escapeHtml(v.place)}</span>
      <h1 class="mn-title" id="mn-title">${escapeHtml(v.title)}</h1>
      <span class="mn-date" id="mn-date">${escapeHtml(v.date)}</span>
    </div>
  </section>
  <section id="s-mn-list" class="clip scene" data-start="${listAt - .2}" data-duration="${(listEnd - listAt + .4).toFixed(2)}" data-track-index="2">
    <div class="mn-list${twoCols ? ' two' : ''}">${groups.map((g) => `<div class="mn-group">${g.map((r) => ('sec' in r
      ? `<div class="mn-row mn-sec">${escapeHtml(r.sec ?? '')}</div>`
      : `<div class="mn-row mn-dish"><span>${escapeHtml(r.dish[0] ?? '')}</span><i></i><b>${escapeHtml(r.dish[1] ?? '')}</b></div>`)).join('')}</div>`).join('')}</div>
  </section>${sName ? `
  <section id="s-mn-special" class="clip scene" data-start="${specialAt.toFixed(2)}" data-duration="${(endAt - specialAt + .2).toFixed(2)}" data-track-index="3">
    <div class="mn-sp-wrap">
      <span class="mn-place">Ne le ratez pas</span>
      <div class="mn-special" id="mn-special">${v.image ? `<img src="${escapeHtml(v.image)}" alt="">` : ''}<div class="mn-sp-txt"><small>Plat du jour</small><strong>${escapeHtml(sName)}</strong>${sPrice ? `<em>${escapeHtml(sPrice)}</em>` : ''}</div></div>
    </div>
  </section>` : ''}
  <section id="s-mn-end" class="clip scene" data-start="${endAt.toFixed(2)}" data-duration="${(duration - endAt).toFixed(2)}" data-track-index="4">
    <div class="mn-open">
      ${logoMark(ctx, 'mark mn-logo', 'mn-logo')}
      <span class="mn-place">${escapeHtml(v.place)}</span>
      <div class="mn-info">${info.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
    </div>
  </section>`,
        css: `
  .mn-open{position:absolute;inset:0 8cqw;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:2.6cqmin}
  .mn-place{font:800 3.4cqmin var(--text);letter-spacing:.16em;text-transform:uppercase}
  .mn-title{margin:0;font:800 11cqmin/1 var(--display);letter-spacing:-.035em;color:var(--highlight);text-wrap:balance}
  .mn-date{font:600 4.2cqmin var(--text);opacity:.75}
  .mn-list{position:absolute;inset:9cqh 8cqw;display:flex;flex-direction:column;justify-content:center;font-size:${fs.toFixed(2)}cqmin}
  .mn-list.two{display:block;columns:2;column-gap:8cqw;padding-top:6cqh}
  .mn-row{break-inside:avoid}
  .mn-sec{font:800 .78em var(--text);letter-spacing:.16em;text-transform:uppercase;color:var(--highlight);border-bottom:.2cqmin solid color-mix(in srgb,var(--ink) 25%,transparent);padding-bottom:.45em;margin:1em 0 .5em}
  .mn-group:first-child .mn-sec{margin-top:0}
  .mn-dish{display:flex;align-items:baseline;gap:.5em;font:600 1em/1.2 var(--text);padding:.32em 0;white-space:nowrap}
  .mn-group{break-inside:avoid}
  .mn-dish i{flex:1;min-width:2em;border-bottom:.12em dotted color-mix(in srgb,var(--ink) 45%,transparent);transform-origin:left}
  .mn-dish b{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
  .mn-sp-wrap{position:absolute;inset:8cqh 7cqw;display:flex;flex-direction:column;justify-content:center;gap:3cqmin}
  .mn-sp-wrap .mn-place{color:var(--highlight)}
  .mn-special{border-radius:4cqmin;background:var(--highlight);color:var(--on-highlight);overflow:hidden;display:flex;flex-direction:column}
  .mn-special img{width:100%;max-height:42cqh;object-fit:cover}
  .mn-sp-txt{padding:5cqmin;display:flex;flex-direction:column;gap:2cqmin}
  .mn-sp-txt small{font:800 3.4cqmin var(--text);letter-spacing:.14em;text-transform:uppercase}
  .mn-sp-txt strong{font:900 8.6cqmin/1.04 var(--display);letter-spacing:-.03em;text-wrap:balance}
  .mn-sp-txt em{font:900 9cqmin/1 var(--display);font-style:normal;align-self:flex-end}
  .mn-logo{width:12cqmin;height:12cqmin;font-size:6.4cqmin;border-radius:3cqmin}
  .mn-info{display:flex;flex-direction:column;gap:1.4cqmin;font:700 6cqmin/1.15 var(--display);letter-spacing:-.02em}
  .mn-info p{margin:0}
  .mn-info p:first-child{color:var(--highlight)}
  @container (min-aspect-ratio: 5/4){
    .mn-special{flex-direction:row;align-items:stretch}
    .mn-special img{width:45%;max-height:none}
    .mn-sp-txt{flex:1;justify-content:center}
  }`,
        script: `
  kit.enter('#mn-place', 'fade', {at:.2, d:.5});
  kit.reveal('#mn-title', {at:.4});
  kit.enter('#mn-date', 'rise', {at:1.2, d:.5});
  document.querySelectorAll('.mn-row').forEach(function(row, i){
    var t = ${listAt} + i * .28;
    if (row.classList.contains('mn-sec')) { kit.enter(row, 'fade', {at:t, d:.4}); return; }
    kit.enter(row.querySelector('span'), 'left', {at:t, d:.5});
    hfEl(row.querySelector('i'), [{transform:'scaleX(0)'}, {transform:'none'}], {at:t + .15, d:.5, ease:'inout'});
    kit.enter(row.querySelector('b'), 'pop', {at:t + .45, d:.4, ease:'spring'});
  });
  kit.exit('.mn-list', 'fade', {at:${(listEnd - .2).toFixed(2)}, d:.35});${sName ? `
  kit.enter('#s-mn-special .mn-place', 'fade', {at:${(specialAt + .1).toFixed(2)}, d:.4});
  kit.enter('#mn-special', 'pop', {at:${(specialAt + .2).toFixed(2)}, d:.7, ease:'spring'});
  kit.shine('#mn-special', {at:${(specialAt + 1.2).toFixed(2)}, d:1.2});
  kit.exit('.mn-sp-wrap', 'fade', {at:${(endAt - .2).toFixed(2)}, d:.35});` : ''}
  kit.enter('#mn-logo', 'pop', {at:${(endAt + .1).toFixed(2)}, d:.6, ease:'spring'});
  kit.enter('#s-mn-end .mn-place', 'fade', {at:${(endAt + .3).toFixed(2)}, d:.4});
  kit.enter('.mn-info p', 'rise', {at:${(endAt + .5).toFixed(2)}, d:.6, stagger:.2, ease:'apple'});`,
      };
    },
  },
  {
    id: 'evenement',
    name: 'Annonce d’événement',
    use: 'An event to announce (concert, conference, training, party, opening, match): the date drops like a calendar page, the title is typed, the place is pinned, the artists or speakers come in as chips, then the ticket and how to book. The countdown template makes the reminders of the following days.',
    duration: 10,
    slots: [
      { key: 'date', label: 'Date (jour et mois)', example: '25 octobre' },
      { key: 'when', label: 'Jour et heure', example: 'Samedi · 20 h' },
      { key: 'title', label: 'Titre', example: 'Nuit du Faso Jazz' },
      { key: 'place', label: 'Lieu', example: 'Institut français, Ouagadougou' },
      { key: 'guests', label: 'Invités (nom | photo ; 0 à 4)', example: 'Awa B.\nTrio Kora\nDJ Wend', list: true, imageField: 1 },
      { key: 'price', label: 'Billet (libellé | prix)', example: 'Billet | 5 000 F' },
      { key: 'booking', label: 'Réservation', example: 'Réservez au 70 00 00 00' },
    ],
    body: (v) => {
      const m = /^(\d{1,2})(?:er)?\s+(.+)$/i.exec(v.date.trim());
      const [day, month] = m ? [m[1], m[2]] : ['', v.date.trim()];
      const guests = lines(v.guests).slice(0, 4).map(fields);
      const [tLabel = '', tPrice = ''] = fields(v.price);
      const typed = 1.6, typeEnd = typed + Math.min(2.2, v.title.length / 16);
      return {
        html: `
  <section id="s-ev" class="clip scene" data-start="0" data-duration="10" data-track-index="1">
    <div class="ev">
      <div class="ev-date" id="ev-date"><small>${escapeHtml(month)}</small>${day ? `<b>${escapeHtml(day)}</b>` : ''}<span>${escapeHtml(v.when)}</span></div>
      <div class="ev-main">
        <h1 class="ev-title" id="ev-title"></h1>
        <p class="ev-place" id="ev-place"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>${escapeHtml(v.place)}</p>
        ${guests.length ? `<div class="ev-chips">${guests.map(([name = '', img = '']) => `<span class="ev-chip">${img ? `<img src="${escapeHtml(img)}" alt="">` : `<i>${escapeHtml((name.trim()[0] ?? '·').toUpperCase())}</i>`}${escapeHtml(name)}</span>`).join('')}</div>` : ''}
        ${tLabel || tPrice ? `<div class="ev-ticket" id="ev-ticket"><span>${escapeHtml(tPrice ? tLabel : '')}</span><b>${escapeHtml(tPrice || tLabel)}</b></div>` : ''}
        <p class="ev-book" id="ev-book">${escapeHtml(v.booking)}</p>
      </div>
    </div>
  </section>`,
        css: `
  .ev{position:absolute;inset:7cqh 8cqw 7cqh;display:flex;flex-direction:column;justify-content:center;gap:5cqmin}
  .ev>*,.ev-main>*{flex-shrink:0}
  .ev-date{align-self:flex-start;min-width:30cqmin;border-radius:4cqmin;overflow:hidden;text-align:center;background:var(--ink);color:var(--background);display:flex;flex-direction:column}
  .ev-date small{background:var(--accent);color:var(--on-accent);font:800 3.6cqmin var(--text);letter-spacing:.12em;text-transform:uppercase;padding:1.4cqmin 3cqmin}
  .ev-date b{font:900 17cqmin/1.05 var(--display);letter-spacing:-.04em}
  .ev-date span{font:700 3.4cqmin var(--text);padding:0 3cqmin 2.4cqmin;text-transform:uppercase;letter-spacing:.06em}
  .ev-main{display:flex;flex-direction:column;gap:3.4cqmin}
  .ev-title{margin:0;min-height:1.02em;font:800 10cqmin/1.02 var(--display);letter-spacing:-.035em;text-wrap:balance}
  .ev-place{margin:0;display:flex;align-items:center;gap:1.6cqmin;font:600 4.2cqmin/1.3 var(--text)}
  .ev-place svg{width:5cqmin;height:5cqmin;flex:none;color:var(--accent)}
  .ev-chips{display:flex;flex-wrap:wrap;gap:2cqmin}
  .ev-chip{display:flex;align-items:center;gap:1.8cqmin;background:color-mix(in srgb,var(--ink) 12%,transparent);border-radius:99cqmin;padding:1.2cqmin 3.2cqmin 1.2cqmin 1.2cqmin;font:600 3.8cqmin var(--text)}
  .ev-chip img,.ev-chip i{width:7cqmin;height:7cqmin;border-radius:50%;object-fit:cover;flex:none}
  .ev-chip i{display:grid;place-items:center;background:var(--accent);color:var(--on-accent);font:800 3.4cqmin var(--display);font-style:normal}
  .ev-ticket{display:flex;justify-content:space-between;align-items:center;border-radius:3cqmin;background:var(--accent);color:var(--on-accent);padding:3.2cqmin 4.4cqmin;font:700 4.4cqmin var(--text)}
  .ev-ticket b{font:900 6cqmin var(--display)}
  .ev-book{margin:0;font:600 4cqmin var(--text);opacity:.8}
  @container (min-aspect-ratio: 9/10) and (max-aspect-ratio: 5/4){
    .ev{gap:3cqmin}
    .ev-main{gap:2.6cqmin}
    .ev-date b{font-size:12cqmin}
    .ev-title{font-size:8.6cqmin}
  }
  @container (min-aspect-ratio: 5/4){
    .ev{flex-direction:row;align-items:center;gap:7cqw}
    .ev-date{align-self:center;min-width:38cqmin}
    .ev-date b{font-size:24cqmin}
    .ev-main{flex:1}
  }`,
        script: `
  // The calendar page lands in the middle, then takes its place.
  var d = document.getElementById('ev-date'), rr = document.querySelector('[data-composition-id]'), c = kit.center(d);
  var dx = rr.offsetWidth / 2 - c[0], dy = rr.offsetHeight / 2 - c[1];
  hfEl(d, [{translate:dx + 'px ' + dy + 'px', scale:'1.35'}, {translate:'0 0', scale:'1'}], {at:1.1, d:.9, ease:'apple'});
  kit.enter(d, 'drop', {at:.1, d:.8, ease:'spring'});
  kit.type('#ev-title', ${JSON.stringify(v.title)}, {at:${typed}, cps:${Math.max(16, v.title.length / 2.2).toFixed(1)}, caretUntil:${(typeEnd + .6).toFixed(2)}});
  kit.enter('#ev-place', 'left', {at:${(typeEnd + .2).toFixed(2)}, d:.6});
  hfEl(document.querySelector('#ev-place svg'), [{transform:'translateY(-120%)', opacity:0}, {transform:'none', opacity:1}], {at:${(typeEnd + .3).toFixed(2)}, d:.6, ease:'spring'});
  kit.enter('.ev-chip', 'pop', {at:${(typeEnd + 1).toFixed(2)}, d:.5, stagger:.18, ease:'spring'});
  kit.enter('#ev-ticket', 'right', {at:${(typeEnd + 1.4 + guests.length * .18).toFixed(2)}, d:.6, ease:'apple'});
  kit.shine('#ev-ticket', {at:${(typeEnd + 2.4 + guests.length * .18).toFixed(2)}, d:1});
  kit.enter('#ev-book', 'fade', {at:${(typeEnd + 1.9 + guests.length * .18).toFixed(2)}, d:.6});`,
      };
    },
  },
  {
    id: 'tutoriel',
    name: 'Tutoriel en étapes',
    use: '« How to order », « how to use », a recipe, a how-to: 3 to 6 steps, each with its big number counting up, a title, a sentence and an optional picture, a progress bar moving on; then the recap. About 3.5 s a step.',
    duration: 17,
    slots: [
      { key: 'kicker', label: 'Surtitre (vide : « En N étapes »)', example: '' },
      { key: 'title', label: 'Titre', example: 'Commander chez nous' },
      { key: 'steps', label: 'Étapes (titre | phrase | image)', example: 'Choisissez sur le catalogue | Faites une capture du modèle qui vous plaît.\nEnvoyez-la sur WhatsApp | Avec votre taille et votre quartier.\nRecevez chez vous | Livraison en 24 h, paiement à la livraison.', list: true, imageField: 2 },
      { key: 'cta', label: 'Appel à l’action', example: 'WhatsApp : 70 00 00 00' },
    ],
    body: (v) => {
      const steps = lines(v.steps).slice(0, 6).map(fields).map(([title = '', text = '', img = '']) => ({ title, text, img }));
      if (!steps.length) steps.push({ title: v.title, text: '', img: '' });
      const n = steps.length;
      const INTRO = 2.6, STEP = 3.6;
      const at = (i: number) => INTRO + i * STEP;
      const recapAt = at(n);
      const duration = +(recapAt + 3.6).toFixed(2);
      const kicker = v.kicker.trim() || `En ${n} étape${n > 1 ? 's' : ''}`;
      return {
        duration,
        html: `
  <section id="s-tu-open" class="clip scene" data-start="0" data-duration="${INTRO}" data-track-index="1">
    <div class="tu-open" id="tu-intro"><span class="tu-kicker" id="tu-kicker">${escapeHtml(kicker)}</span><h1 class="tu-title" id="tu-title">${escapeHtml(v.title)}</h1></div>
  </section>
  <div class="tu-bar" id="tu-bar"><i id="tu-fill"></i></div>${steps.map((s, i) => `
  <section id="s-tu-${i}" class="clip scene" data-start="${(at(i) - .1).toFixed(2)}" data-duration="${(STEP + .1).toFixed(2)}" data-track-index="${i + 2}">
    <div class="tu-step${s.img ? ' has-img' : ''}">
      ${s.img ? `<div class="tu-img"><img id="tu-img${i}" src="${escapeHtml(s.img)}" alt=""></div>` : ''}
      <div class="tu-txt"><b class="tu-n" id="tu-n${i}"></b><h2 id="tu-h${i}">${escapeHtml(s.title)}</h2>${s.text ? `<p id="tu-p${i}">${escapeHtml(s.text)}</p>` : ''}</div>
    </div>
  </section>`).join('')}
  <section id="s-tu-recap" class="clip scene" data-start="${recapAt.toFixed(2)}" data-duration="${(duration - recapAt).toFixed(2)}" data-track-index="${n + 2}">
    <div class="tu-open">
      <span class="tu-kicker">${escapeHtml(v.title)}</span>
      <ol class="tu-recap">${steps.map((s, i) => `<li><b>${i + 1}</b>${escapeHtml(s.title)}</li>`).join('')}</ol>
      <p class="tu-cta" id="tu-cta">${escapeHtml(v.cta)}</p>
    </div>
  </section>`,
        css: `
  .tu-open{position:absolute;inset:8cqh 8cqw;display:flex;flex-direction:column;justify-content:center;gap:3cqmin}
  .tu-kicker{font:800 3.6cqmin var(--text);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  .tu-title{margin:0;font:800 10.5cqmin/1.02 var(--display);letter-spacing:-.035em;text-wrap:balance}
  .tu-bar{position:absolute;left:8cqw;right:8cqw;top:6cqh;height:1.1cqmin;border-radius:99px;background:color-mix(in srgb,var(--ink) 16%,transparent);overflow:hidden;z-index:2}
  .tu-bar i{display:block;height:100%;width:100%;border-radius:99px;background:var(--accent);transform-origin:left;transform:scaleX(0)}
  .tu-step{position:absolute;inset:12cqh 8cqw 8cqh;display:flex;flex-direction:column;justify-content:center;gap:5cqmin}
  .tu-img{flex:1 1 0;min-height:0;display:grid;place-items:center}
  .tu-img img{max-width:100%;max-height:100%;object-fit:contain;border-radius:3cqmin}
  .tu-txt{display:flex;flex-direction:column;gap:2.6cqmin}
  .tu-n{font:900 26cqmin/.9 var(--display);letter-spacing:-.06em;color:var(--accent)}
  .has-img .tu-n{font-size:16cqmin}
  .tu-txt h2{margin:0;font:800 7.6cqmin/1.06 var(--display);letter-spacing:-.025em;text-wrap:balance}
  .tu-txt p{margin:0;font:500 4.4cqmin/1.45 var(--text);opacity:.75;max-width:38ch}
  .tu-recap{margin:1cqmin 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2.4cqmin}
  .tu-recap li{display:flex;align-items:center;gap:3cqmin;background:color-mix(in srgb,var(--ink) 8%,transparent);border-radius:3cqmin;padding:3cqmin 3.4cqmin;font:700 5.2cqmin/1.2 var(--text)}
  .tu-recap b{width:8.4cqmin;height:8.4cqmin;flex:none;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:800 4cqmin var(--display)}
  .tu-cta{margin:1cqmin 0 0;font:700 4.4cqmin var(--text);color:var(--accent)}
  @container (min-aspect-ratio: 5/4){
    .tu-step{flex-direction:row-reverse;align-items:center;gap:6cqw}
    .tu-img{height:100%;flex:0 0 42%}
    .tu-txt{flex:1}
    .tu-recap{display:grid;grid-template-columns:1fr 1fr}
  }`,
        script: `
  kit.enter('#tu-kicker', 'fade', {at:.2, d:.5});
  kit.reveal('#tu-title', {at:.4});
  kit.exit('#tu-intro', 'fade', {at:${INTRO - .45}, d:.4});
  kit.enter('#tu-bar', 'fade', {at:${INTRO - .3}, d:.4});
  ${steps.map((s, i) => `hfEl(document.getElementById('tu-fill'), [{transform:'scaleX(${(i / n).toFixed(4)})'}, {transform:'scaleX(${((i + 1) / n).toFixed(4)})'}], {at:${(at(i) + .2).toFixed(2)}, d:.8, ease:'inout'});
  kit.count('#tu-n${i}', {at:${at(i).toFixed(2)}, d:.6, from:${i}, to:${i + 1}, pad:true, ease:'linear'});
  kit.enter('#tu-n${i}', 'left', {at:${at(i).toFixed(2)}, d:.5});
  kit.reveal('#tu-h${i}', {at:${(at(i) + .3).toFixed(2)}, stagger:.05});${s.text ? `
  kit.enter('#tu-p${i}', 'rise', {at:${(at(i) + .8).toFixed(2)}, d:.6});` : ''}${s.img ? `
  kit.enter('#tu-img${i}', 'scale', {at:${(at(i) + .2).toFixed(2)}, d:.8, ease:'apple'});
  kit.kenburns('#tu-img${i}', {at:${(at(i) + 1).toFixed(2)}, d:${STEP - 1}, to:1.05});` : ''}
  kit.exit('#s-tu-${i} .tu-step', 'left', {at:${(at(i + 1) - .4).toFixed(2)}, d:.35});`).join('\n  ')}
  kit.exit('#tu-bar', 'fade', {at:${(recapAt + .2).toFixed(2)}, d:.4});
  kit.enter('#s-tu-recap .tu-kicker', 'fade', {at:${(recapAt + .1).toFixed(2)}, d:.4});
  kit.enter('.tu-recap li', 'left', {at:${(recapAt + .3).toFixed(2)}, d:.5, stagger:.2, ease:'apple'});
  kit.enter('.tu-recap b', 'pop', {at:${(recapAt + .5).toFixed(2)}, d:.4, stagger:.2, ease:'spring'});
  kit.enter('#tu-cta', 'rise', {at:${(recapAt + .7 + n * .2).toFixed(2)}, d:.6});`,
      };
    },
  },
  {
    id: 'paiement-mobile',
    name: 'Payer par mobile money',
    use: 'Reassures a customer who hesitates to pay from afar: a phone shows how to pay by mobile money, operator by operator — the code dialled key by key, the merchant’s name, number and amount, the secret code always as dots, then the confirmation. Operator names as text, no operator logo. The codes and numbers must be the user’s own: never guess one. About 6 s an operator.',
    duration: 15,
    slots: [
      { key: 'title', label: 'Titre', example: 'Payez en 30 secondes' },
      { key: 'merchant', label: 'Nom du marchand', example: 'Boutique Awa' },
      { key: 'operators', label: 'Opérateurs (nom | code ou « appli » | numéro)', example: 'Orange Money | *144# | 70 00 00 00\nMoov Money | *555# | 60 00 00 00', list: true },
      { key: 'amount', label: 'Montant (facultatif)', example: '9 900 F' },
      { key: 'after', label: 'Après le paiement', example: 'Envoyez la capture sur WhatsApp' },
    ],
    body: (v, ctx) => {
      const ops = lines(v.operators).slice(0, 3).map(fields).map(([name = '', code = '', number = '']) => ({ name, code, number }));
      if (!ops.length) ops.push({ name: 'Mobile money', code: '', number: '' });
      const n = ops.length;
      const INTRO = 2.6, OP = 6.2;
      const at = (i: number) => INTRO + i * OP;
      const duration = +(at(n) + .4).toFixed(2);
      const wide = ctx.width > ctx.height * 1.2;
      const ph = Math.round(wide ? ctx.height * .76 : Math.min(ctx.height * .58, ctx.width * 1.25));
      const pw = Math.round(ph * .49);
      const u = pw / 100; // the phone's own unit
      const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
      const dial = (code: string) => /^[\d*#\s]+$/.test(code.trim()) && code.trim() !== '';
      return {
        duration,
        html: `
  <section id="s-pm-open" class="clip scene" data-start="0" data-duration="${INTRO}" data-track-index="1">
    <div class="pm-open"><span class="pm-kicker" id="pm-kicker">${escapeHtml(v.merchant)}</span><h1 class="pm-title" id="pm-title">${escapeHtml(v.title)}</h1><p class="pm-ops" id="pm-ops">${ops.map((o) => escapeHtml(o.name)).join(' · ')}</p></div>
  </section>
  <section id="s-pm-run" class="clip scene" data-start="${INTRO - .3}" data-duration="${(duration - INTRO + .3).toFixed(2)}" data-track-index="2">
    <div class="pm">
      ${n > 1 ? `<div class="pm-tabs">${ops.map((o, i) => `<span id="pm-tab${i}">${escapeHtml(o.name)}</span>`).join('')}</div>` : `<div class="pm-tabs one"><span class="on">${escapeHtml(ops[0].name)}</span></div>`}
      <div class="pm-body">
        <div class="pm-phone" id="pm-phone"><div class="pm-screen">${ops.map((o, i) => `
          <div class="pm-op" id="pm-op${i}">
            <div class="pm-st pm-st1" id="pm-a${i}">
              <div class="pm-dialled" id="pm-code${i}"></div>
              ${dial(o.code) ? `<div class="pm-keys">${KEYS.map((k) => `<i data-k="${k === '*' ? 'star' : k === '#' ? 'hash' : k}">${k}</i>`).join('')}</div>` : ''}
            </div>
            <div class="pm-st pm-st2" id="pm-b${i}">
              <div class="pm-row"><span>Marchand</span><b>${escapeHtml(v.merchant)}</b></div>
              ${o.number ? `<div class="pm-row"><span>Numéro</span><b>${escapeHtml(o.number)}</b></div>` : ''}
              ${v.amount ? `<div class="pm-row"><span>Montant</span><b>${escapeHtml(v.amount)}</b></div>` : ''}
              <div class="pm-pin">${'<i></i>'.repeat(4)}</div>
            </div>
            <div class="pm-st pm-st3" id="pm-c${i}">
              <div class="pm-ok"><svg viewBox="0 0 24 24"><path id="pm-tick${i}" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg></div>
              ${v.amount ? `<div class="pm-row"><span>Payé</span><b>${escapeHtml(v.amount)}</b></div>` : ''}
            </div>
          </div>`).join('')}
        </div></div>
        <div class="pm-caps">${ops.map((_, i) => `
          <div class="pm-cap" id="pm-k${i}a"><small>Étape 1</small>${dial(ops[i].code) ? 'Composez le code' : `Ouvrez l’appli ${escapeHtml(ops[i].name)}`}</div>
          <div class="pm-cap" id="pm-k${i}b"><small>Étape 2</small>Vérifiez le nom, puis votre code secret</div>
          <div class="pm-cap" id="pm-k${i}c"><small>Étape 3</small>${escapeHtml(v.after)}</div>`).join('')}
        </div>
      </div>
    </div>
  </section>`,
        css: `
  .pm-open{position:absolute;inset:0 8cqw;display:flex;flex-direction:column;justify-content:center;gap:2.6cqmin}
  .pm-kicker{font:800 3.4cqmin var(--text);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  .pm-title{margin:0;font:800 10.5cqmin/1.02 var(--display);letter-spacing:-.035em;text-wrap:balance}
  .pm-ops{margin:0;font:600 4.2cqmin var(--text);opacity:.75}
  .pm{position:absolute;inset:6cqh 8cqw 6cqh;display:flex;flex-direction:column;gap:3cqh}
  .pm-tabs{display:flex;gap:2cqmin}
  .pm-tabs span{flex:1;text-align:center;border-radius:99cqmin;padding:1.8cqmin 0;font:700 3.6cqmin var(--text);background:color-mix(in srgb,var(--ink) 10%,transparent)}
  .pm-tabs.one span,.pm-tabs span.on{background:var(--ink);color:var(--background)}
  .pm-body{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:3cqh}
  .pm-phone{flex:none;width:${pw}px;height:${ph}px;border-radius:${Math.round(14 * u)}px;background:#111;padding:${Math.round(4 * u)}px;box-sizing:border-box;box-shadow:0 ${Math.round(6 * u)}px ${Math.round(14 * u)}px rgba(0,0,0,.25)}
  .pm-screen{position:relative;width:100%;height:100%;border-radius:${Math.round(10 * u)}px;background:#fafafa;color:#141414;overflow:hidden}
  .pm-op,.pm-st{position:absolute;inset:0}
  .pm-st{padding:${Math.round(9 * u)}px ${Math.round(7 * u)}px;display:flex;flex-direction:column;gap:${Math.round(4 * u)}px}
  .pm-dialled{margin-top:${Math.round(14 * u)}px;min-height:1.2em;text-align:center;font:800 ${Math.round(13 * u)}px/1.2 var(--display);letter-spacing:.02em}
  .pm-st1 .pm-dialled:only-child{font-size:${Math.round(9 * u)}px;margin-top:${Math.round(40 * u)}px}
  .pm-keys{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:${Math.round(3 * u)}px ${Math.round(5 * u)}px}
  .pm-keys i{aspect-ratio:1;border-radius:50%;background:#e9e9ec;display:grid;place-items:center;font:600 ${Math.round(7 * u)}px var(--text);font-style:normal}
  .pm-row{display:flex;justify-content:space-between;gap:${Math.round(3 * u)}px;background:#fff;border:1px solid #e4e4e7;border-radius:${Math.round(3 * u)}px;padding:${Math.round(4.4 * u)}px ${Math.round(5 * u)}px;font:500 ${Math.round(6.4 * u)}px var(--text)}
  .pm-row b{font-weight:800;text-align:right}
  .pm-st2{padding-top:${Math.round(18 * u)}px}
  .pm-pin{display:flex;justify-content:center;gap:${Math.round(5 * u)}px;margin-top:${Math.round(8 * u)}px}
  .pm-pin i{width:${Math.round(5 * u)}px;height:${Math.round(5 * u)}px;border-radius:50%;background:#141414}
  .pm-st3{align-items:stretch;justify-content:center}
  .pm-ok{width:${Math.round(32 * u)}px;height:${Math.round(32 * u)}px;margin:0 auto ${Math.round(6 * u)}px;border-radius:50%;background:#16a34a;color:#fff;display:grid;place-items:center}
  .pm-ok svg{width:60%;height:60%}
  .pm-caps{position:relative;align-self:stretch;flex:1;min-height:0}
  .pm-cap{position:absolute;left:0;right:0;top:0;font:800 5.6cqmin/1.15 var(--display);letter-spacing:-.02em;text-align:center;text-wrap:balance}
  .pm-cap small{display:block;font:700 3.2cqmin var(--text);letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:1cqmin}
  @container (min-aspect-ratio: 5/4){
    .pm-body{flex-direction:row;justify-content:center;gap:7cqw}
    .pm-caps{flex:0 1 46cqw;align-self:center;height:30cqh}
    .pm-cap{text-align:left;top:50%;translate:0 -50%}
    .pm-tabs{align-self:center;width:70cqw}
  }`,
        script: `
  kit.enter('#pm-kicker', 'fade', {at:.2, d:.5});
  kit.reveal('#pm-title', {at:.35});
  kit.enter('#pm-ops', 'rise', {at:1.2, d:.5});
  kit.exit('.pm-open', 'fade', {at:${INTRO - .45}, d:.4});
  kit.enter('#pm-phone', 'rise', {at:${INTRO - .3}, d:.8, ease:'apple'});
  kit.enter('.pm-tabs', 'drop', {at:${INTRO - .2}, d:.5});
  // The tabs' colours, read once: an animation takes values, not var().
  var tab = document.querySelector('.pm-tabs span'), cs = getComputedStyle(document.getElementById('root'));
  var off = tab ? {bg:getComputedStyle(tab).backgroundColor, fg:getComputedStyle(tab).color} : null, on = {bg:cs.getPropertyValue('--ink').trim(), fg:cs.getPropertyValue('--background').trim()};
  function seen(el, a, b){ hfEl(el, [{opacity:0}, {opacity:1}], {at:a, d:.3}); if (b !== null) hfEl(el, [{opacity:1}, {opacity:0}], {at:b, d:.3}); }
  ${ops.map((o, i) => {
    const t = at(i), last = i === n - 1;
    const code = o.code.trim();
    const cps = Math.max(4, code.length / 1.6);
    const on = "{background:on.bg, color:on.fg}", off = "{background:off.bg, color:off.fg}";
    return `${n > 1 ? `hfEl(document.getElementById('pm-tab${i}'), [${off}, ${on}], {at:${(t - .2).toFixed(2)}, d:.3});${last ? '' : `
  hfEl(document.getElementById('pm-tab${i}'), [${on}, ${off}], {at:${(t + OP - .2).toFixed(2)}, d:.3});`}
  ` : ''}seen(document.getElementById('pm-op${i}'), ${(t - .15).toFixed(2)}, ${last ? 'null' : (t + OP - .3).toFixed(2)});
  seen(document.getElementById('pm-a${i}'), ${(t - .15).toFixed(2)}, ${(t + 2.5).toFixed(2)});
  ${dial(code) ? `kit.type('#pm-code${i}', ${JSON.stringify(code)}, {at:${(t + .3).toFixed(2)}, cps:${cps.toFixed(1)}, caretUntil:${(t + 2.4).toFixed(2)}});
  ${JSON.stringify(Array.from(code.replace(/\s/g, ''))).replace(/"/g, "'")}.forEach(function(ch, j){
    var k = document.querySelector('#pm-op${i} [data-k="' + (ch === '*' ? 'star' : ch === '#' ? 'hash' : ch) + '"]');
    if (k) hfEl(k, [{background:'#e9e9ec', scale:'1'}, {background:'#c7c7cc', scale:'.9', offset:.4}, {background:'#e9e9ec', scale:'1'}], {at:${(t + .3).toFixed(2)} + j / ${cps.toFixed(1)}, d:.25, ease:'inout'});
  });` : `kit.type('#pm-code${i}', ${JSON.stringify(`Appli ${o.name}`)}, {at:${(t + .3).toFixed(2)}, cps:14, caret:false});`}
  seen(document.getElementById('pm-b${i}'), ${(t + 2.6).toFixed(2)}, ${(t + 4.4).toFixed(2)});
  kit.enter('#pm-b${i} .pm-row', 'rise', {at:${(t + 2.7).toFixed(2)}, d:.4, stagger:.2});
  kit.enter('#pm-b${i} .pm-pin i', 'pop', {at:${(t + 3.5).toFixed(2)}, d:.25, stagger:.12});
  seen(document.getElementById('pm-c${i}'), ${(t + 4.5).toFixed(2)}, null);
  kit.enter('#pm-c${i} .pm-ok', 'pop', {at:${(t + 4.5).toFixed(2)}, d:.5, ease:'spring'});
  hfEl(document.getElementById('pm-tick${i}'), [{strokeDasharray:'1', strokeDashoffset:'1'}, {strokeDasharray:'1', strokeDashoffset:'0'}], {at:${(t + 4.8).toFixed(2)}, d:.5, ease:'inout'});
  kit.enter('#pm-c${i} .pm-row', 'rise', {at:${(t + 5).toFixed(2)}, d:.4});
  seen(document.getElementById('pm-k${i}a'), ${t.toFixed(2)}, ${(t + 2.5).toFixed(2)});
  seen(document.getElementById('pm-k${i}b'), ${(t + 2.6).toFixed(2)}, ${(t + 4.4).toFixed(2)});
  seen(document.getElementById('pm-k${i}c'), ${(t + 4.5).toFixed(2)}, ${last ? 'null' : (t + OP - .3).toFixed(2)});`;
  }).join('\n  ')}`,
      };
    },
  },
  {
    id: 'affiche-evenement',
    name: 'Affiche d’événement',
    use: 'A poster for an event (concert, conference, training, party, match), to print or to post: the date as a calendar page, the title, the place, the artists or speakers, the ticket and a QR code that opens WhatsApp to book. The still version of evenement.',
    poster: true,
    format: 'A3',
    duration: 4,
    slots: [
      { key: 'date', label: 'Date (jour et mois)', example: '25 octobre' },
      { key: 'when', label: 'Jour et heure', example: 'Samedi · 20 h' },
      { key: 'title', label: 'Titre', example: 'Nuit du Faso Jazz' },
      { key: 'place', label: 'Lieu', example: 'Institut français, Ouagadougou' },
      { key: 'guests', label: 'Invités (un par ligne, 0 à 6)', example: 'Awa B.\nTrio Kora\nDJ Wend', list: true },
      { key: 'price', label: 'Billet (libellé | prix)', example: 'Billet | 5 000 F' },
      { key: 'booking', label: 'Réservation', example: 'Réservations : 70 00 00 00' },
      { key: 'qr', label: QR_LABEL, example: '' },
    ],
    body: (v, ctx) => {
      const m = /^(\d{1,2})(?:er)?\s+(.+)$/i.exec(v.date.trim());
      const [day, month] = m ? [m[1], m[2]] : ['', v.date.trim()];
      const guests = lines(v.guests).slice(0, 6);
      const [tLabel = '', tPrice = ''] = fields(v.price);
      const tfs = fitSize(v.title, 15, 14);
      return {
        html: `
  <section id="s-pe" class="clip scene" data-start="0" data-duration="4" data-track-index="1">
    <div class="pz pe">
      <div class="pe-top">
        <div class="pe-date" id="pe-date"><small>${escapeHtml(month)}</small>${day ? `<b>${escapeHtml(day)}</b>` : ''}${v.when ? `<span>${escapeHtml(v.when)}</span>` : ''}</div>
        ${brandLine(ctx, 'pz-brand', 'pe-brand')}
      </div>
      <h1 class="pe-title" id="pe-title">${escapeHtml(v.title)}</h1>
      ${v.place ? `<p class="pe-place" id="pe-place">${PIN_SVG}${escapeHtml(v.place)}</p>` : ''}
      ${guests.length ? `<p class="pe-guests" id="pe-guests">${guests.map(escapeHtml).join('<i>·</i>')}</p>` : ''}
      <div class="pe-foot">
        <div class="pe-buy">
          ${tLabel || tPrice ? `<div class="pe-ticket" id="pe-ticket"><span>${escapeHtml(tPrice ? tLabel : '')}</span><b>${escapeHtml(tPrice || tLabel)}</b></div>` : ''}
          ${v.booking ? `<p class="pe-book" id="pe-book">${escapeHtml(v.booking)}</p>` : ''}
        </div>
        ${qrTile(v.qr, 'Scannez pour réserver', 'pe-qr')}
      </div>
    </div>
  </section>`,
        css: `${POSTER_CSS}
  .pe{gap:3.6cqmin}
  .pe-top{display:flex;justify-content:space-between;align-items:flex-start;gap:4cqmin}
  .pe-date{min-width:30cqmin;border-radius:3.4cqmin;overflow:hidden;text-align:center;background:var(--ink);color:var(--background);display:flex;flex-direction:column}
  .pe-date small{background:var(--accent);color:var(--on-accent);font:800 3.6cqmin var(--text);letter-spacing:.12em;text-transform:uppercase;padding:1.4cqmin 3cqmin}
  .pe-date b{font:900 19cqmin/1.05 var(--display);letter-spacing:-.04em}
  .pe-date span{font:700 3.4cqmin var(--text);padding:0 3cqmin 2.4cqmin;text-transform:uppercase;letter-spacing:.06em}
  .pe-title{margin:auto 0 0;font:900 ${tfs}cqmin/.98 var(--display);letter-spacing:-.04em;text-wrap:balance}
  .pe-place{margin:0;display:flex;align-items:center;gap:1.6cqmin;font:600 4.4cqmin/1.3 var(--text)}
  .pe-place svg{width:5.4cqmin;height:5.4cqmin;flex:none;color:var(--accent)}
  .pe-guests{margin:0;font:700 4.6cqmin/1.35 var(--display);color:var(--highlight)}
  .pe-guests i{font-style:normal;opacity:.6;margin:0 .45em}
  .pe-foot{margin-top:auto;display:flex;align-items:flex-end;gap:4cqmin}
  .pe-buy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2.4cqmin}
  .pe-ticket{display:flex;justify-content:space-between;align-items:center;gap:3cqmin;border-radius:3cqmin;background:var(--accent);color:var(--on-accent);padding:3.2cqmin 4.4cqmin;font:700 4.6cqmin var(--text)}
  .pe-ticket b{font:900 7cqmin var(--display);white-space:nowrap}
  .pe-book{margin:0;font:600 4cqmin/1.3 var(--text);opacity:.85}
  .pe .qr-tile{width:24cqmin}
  @container (min-aspect-ratio: 9/10) and (max-aspect-ratio: 5/4){
    .pe{gap:2.4cqmin}
    .pe-date b{font-size:12cqmin}
    .pe-title{font-size:${(tfs * .72).toFixed(2)}cqmin}
    .pe .qr-tile{width:19cqmin}
  }
  @container (min-aspect-ratio: 5/4){
    .pe{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:1fr auto auto auto 1fr;column-gap:6cqw;row-gap:2.6cqmin}
    .pe-top{display:contents}
    .pe-date{grid-column:1;grid-row:1 / 6;align-self:center;min-width:36cqmin}
    .pe-date b{font-size:22cqmin}
    .pe .pz-brand{grid-column:3;grid-row:1;justify-self:end}
    .pe-title{grid-column:2 / 4;grid-row:2;margin:0;font-size:${(tfs * .78).toFixed(2)}cqmin}
    .pe-place{grid-column:2 / 4;grid-row:3}
    .pe-guests{grid-column:2 / 4;grid-row:4}
    .pe-foot{grid-column:2 / 4;grid-row:5;align-self:end}
    .pe .qr-tile{width:20cqmin}
  }`,
        script: `
  kit.enter('#pe-date', 'drop', {at:.1, d:.7, ease:'spring'});
  kit.enter('#pe-brand', 'fade', {at:.3, d:.5});
  kit.reveal('#pe-title', {at:.5});
  kit.enter('#pe-place', 'left', {at:1.2, d:.5});
  kit.enter('#pe-guests', 'rise', {at:1.4, d:.5});
  kit.enter('#pe-ticket', 'right', {at:1.6, d:.6, ease:'apple'});
  kit.enter('#pe-book', 'fade', {at:1.8, d:.5});
  kit.enter('#pe-qr', 'pop', {at:2, d:.5, ease:'spring'});
  kit.shine('#pe-ticket', {at:2.5, d:1});`,
      };
    },
  },
  {
    id: 'affiche-promo',
    name: 'Affiche promo',
    use: 'A promotion as a still, for a WhatsApp status, a post or a shop window: the product (with its photo), the old price struck through, the new price, the discount worked out, the call to action and a QR code to WhatsApp. The still version of offre-du-jour.',
    poster: true,
    format: '9:16',
    duration: 4,
    slots: [
      { key: 'product', label: 'Produit', example: 'Pagne wax 6 yards' },
      { key: 'image', label: 'Photo du produit', example: '', image: true },
      { key: 'old', label: 'Ancien prix', example: '15 000 F' },
      { key: 'price', label: 'Nouveau prix', example: '9 900 F' },
      { key: 'note', label: 'Précision', example: 'Jusqu’à dimanche, dans la limite des stocks' },
      { key: 'cta', label: 'Appel à l’action', example: 'Écrivez-nous sur WhatsApp' },
      { key: 'qr', label: QR_LABEL, example: '' },
    ],
    body: (v, ctx) => {
      const before = num(v.old, 0), after = num(v.price, 0);
      const pct = before > after && after > 0 ? Math.round((1 - after / before) * 100) : 0;
      const nfs = fitSize(v.product, v.image ? 9 : 13, 16);
      const pfs = Math.min(v.image ? 18 : 26, 88 / (Math.max(4, v.price.length) * .58));
      return {
        html: `
  <section id="s-pp" class="clip scene" data-start="0" data-duration="4" data-track-index="1">
    <div class="pz pp${v.image ? '' : ' bare'}">
      ${brandLine(ctx, 'pz-brand', 'pp-brand')}
      ${v.image ? `<div class="pp-photo" id="pp-photo"><img src="${escapeHtml(v.image)}" alt=""></div>` : ''}
      <div class="pp-txt">
        <h1 class="pp-name" id="pp-name">${escapeHtml(v.product)}</h1>
        ${v.old || pct ? `<div class="pp-was">${v.old ? `<s class="pp-old" id="pp-old">${escapeHtml(v.old)}</s>` : ''}${pct ? `<span class="pp-stamp" id="pp-stamp">−${pct} %</span>` : ''}</div>` : ''}
        <div class="pp-new" id="pp-new">${escapeHtml(v.price)}</div>
        ${v.note ? `<p class="pp-note" id="pp-note">${escapeHtml(v.note)}</p>` : ''}
        <div class="pp-foot">${v.cta ? `<div class="pp-cta" id="pp-cta">${escapeHtml(v.cta)}</div>` : ''}${qrTile(v.qr, '', 'pp-qr')}</div>
      </div>
    </div>
  </section>`,
        css: `${POSTER_CSS}
  .pp{gap:3.4cqmin}
  .pp-photo{flex:1 1 0;min-height:0;border-radius:4cqmin;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden;display:grid;place-items:center}
  .pp-photo img{width:100%;height:100%;object-fit:contain}
  .pp-txt{flex:none;display:flex;flex-direction:column;gap:2.4cqmin}
  .pp.bare .pp-txt{flex:1}
  .pp.bare .pp-name{margin-top:auto}
  .pp-name{margin:0;font:800 ${nfs}cqmin/1.02 var(--display);letter-spacing:-.03em;text-wrap:balance}
  .pp-was{display:flex;align-items:center;gap:4cqmin}
  .pp-old{font:800 8cqmin var(--display);opacity:.55;text-decoration:line-through;text-decoration-color:var(--highlight);text-decoration-thickness:.8cqmin}
  .pp-stamp{rotate:-6deg;border:.8cqmin solid var(--highlight);color:var(--highlight);border-radius:2cqmin;padding:.6cqmin 2.4cqmin;font:900 5.4cqmin var(--display);white-space:nowrap}
  .pp-new{font:900 ${pfs.toFixed(2)}cqmin/.95 var(--display);letter-spacing:-.05em;color:var(--highlight);white-space:nowrap}
  .pp-note{margin:0;font:600 3.6cqmin/1.3 var(--text);opacity:.8}
  .pp-foot{display:flex;align-items:flex-end;gap:4cqmin;margin-top:2cqmin}
  .pp.bare .pp-foot{margin-top:auto}
  .pp-cta{flex:1;background:var(--accent);color:var(--on-accent);border-radius:99cqmin;text-align:center;padding:3.4cqmin 4cqmin;font:800 4.6cqmin/1.15 var(--text)}
  .pp .qr-tile{width:20cqmin}
  @container (min-aspect-ratio: 9/10){
    .pp{display:grid;grid-template-columns:${v.image ? '44% 1fr' : '1fr'};grid-template-rows:auto 1fr;column-gap:6cqmin;row-gap:3cqmin}
    .pp .pz-brand{grid-column:1 / -1}
    .pp-photo{grid-row:2}
    .pp-txt{grid-row:2;justify-content:center}
    .pp-name{font-size:${(nfs * (v.image ? .85 : .7)).toFixed(2)}cqmin}
    .pp-new{font-size:${(pfs * .6).toFixed(2)}cqmin}
    .pp-foot{margin-top:auto}
  }`,
        script: `
  kit.enter('#pp-brand', 'fade', {at:.1, d:.5});
  kit.enter('#pp-photo', 'scale', {at:.2, d:.8, ease:'apple'});
  kit.reveal('#pp-name', {at:.6});
  kit.enter('#pp-old', 'left', {at:1.1, d:.5});
  kit.enter('#pp-new', 'pop', {at:1.4, d:.6, ease:'spring'});
  kit.enter('#pp-stamp', 'pop', {at:1.8, d:.5, ease:'spring'});
  kit.enter('#pp-note', 'fade', {at:2, d:.5});
  kit.enter('#pp-cta', 'rise', {at:2.2, d:.5});
  kit.enter('#pp-qr', 'pop', {at:2.4, d:.5, ease:'spring'});
  kit.shine('#pp-cta', {at:2.8, d:1});`,
      };
    },
  },
  {
    id: 'affiche-menu',
    name: 'Menu à imprimer',
    use: 'A printed menu for a restaurant, maquis, bakery or caterer, to laminate or put on the tables (A4 by default): dishes by section with their prices on dotted lines, opening hours and delivery, and a QR code that opens WhatsApp to order. The still version of menu.',
    poster: true,
    format: 'A4',
    duration: 4,
    slots: [
      { key: 'place', label: 'Nom du lieu', example: 'Maquis Chez Awa' },
      { key: 'title', label: 'Titre', example: 'Notre menu' },
      { key: 'menu', label: 'Menu (# rubrique, puis plat | prix)', example: '# Plats\nRiz gras | 1 500\nPoulet bicyclette | 3 500\nTô sauce gombo | 1 000\nPoisson braisé | 2 500\n# Boissons\nBissap | 300\nDégué | 500\nJus de gingembre | 500', list: true },
      { key: 'info', label: 'Infos pratiques', example: 'Ouvert de 11 h à 23 h\nLivraison · 70 00 00 00', list: true },
      { key: 'qr', label: QR_LABEL, example: '' },
      { key: 'qr_caption', label: 'Sous le QR code', example: 'Commandez sur WhatsApp' },
    ],
    body: (v, ctx) => {
      const rows = lines(v.menu).slice(0, 30).map((l) => (l.startsWith('#') ? { sec: l.replace(/^#+\s*/, '') } : { dish: fields(l) }));
      const info = lines(v.info).slice(0, 4);
      // From the square up, the footer is a side column.
      const wide = ctx.width / ctx.height >= .9;
      const groups: Array<typeof rows> = [];
      for (const r of rows) ('sec' in r || !groups.length ? groups.push([r]) : groups[groups.length - 1].push(r));
      // Two columns: whole sections, split where the rows are most even.
      let split = [groups];
      if (groups.length > 1) {
        let best = 1, diff = Infinity;
        for (let k = 1; k < groups.length; k++) {
          const left = groups.slice(0, k).flat().length;
          if (Math.abs(rows.length - 2 * left) < diff) [best, diff] = [k, Math.abs(rows.length - 2 * left)];
        }
        split = [groups.slice(0, best), groups.slice(best)];
      }
      const min = Math.min(ctx.width, ctx.height);
      // The room the header and the footer leave, in cqmin (wide, the footer is a side column);
      // a line is about 1.7 em, a character .6 em. One column or two, whichever gives larger type.
      const roomH = (ctx.height / min) * 100 - (wide ? 34 : 56);
      const roomW = (ctx.width / min) * 100 - 14 - (wide ? 32 : 0);
      const longest = Math.max(10, ...rows.map((r) => ('sec' in r ? 0 : (r.dish[0] ?? '').length + (r.dish[1] ?? '').length)));
      const size = (cols: typeof split) => Math.min((roomH / (Math.max(...cols.map((c) => c.flat().length)) * 1.7 + 1)) * 1.15, (roomW * (cols.length > 1 ? .46 : 1)) / (longest * .6 + 4));
      const cols = split.length > 1 && size(split) > size([groups]) ? split : [groups];
      const fs = Math.max(2, Math.min(6, size(cols)));
      return {
        html: `
  <section id="s-am" class="clip scene" data-start="0" data-duration="4" data-track-index="1">
    <div class="pz am">
      <header class="am-head">
        <div><small id="am-place">${escapeHtml(v.place)}</small><h1 class="am-title" id="am-title">${escapeHtml(v.title)}</h1></div>
        ${ctx.logoSrc ? logoMark(ctx, 'mark am-logo', 'am-logo') : ''}
      </header>
      <div class="am-list${cols.length > 1 ? ' two' : ''}">${cols.map((col) => `<div class="am-col">${col.map((g) => `<div class="am-group">${g.map((r) => ('sec' in r
        ? `<div class="am-sec">${escapeHtml(r.sec ?? '')}</div>`
        : `<div class="am-dish"><span>${escapeHtml(r.dish[0] ?? '')}</span><i></i><b>${escapeHtml(r.dish[1] ?? '')}</b></div>`)).join('')}</div>`).join('')}</div>`).join('')}</div>
      <footer class="am-foot">
        <div class="am-info">${info.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
        ${qrTile(v.qr, v.qr_caption, 'am-qr')}
      </footer>
    </div>
  </section>`,
        css: `${POSTER_CSS}
  .am{gap:4cqmin}
  .am-head{display:flex;justify-content:space-between;align-items:flex-start;gap:4cqmin}
  .am-head small{display:block;font:800 3.4cqmin var(--text);letter-spacing:.16em;text-transform:uppercase}
  .am-title{margin:1cqmin 0 0;font:900 11cqmin/1 var(--display);letter-spacing:-.035em;color:var(--highlight)}
  .am-logo{width:14cqmin;height:14cqmin;font-size:7cqmin;border-radius:3cqmin}
  .am-list{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:safe center;font-size:${fs.toFixed(2)}cqmin}
  .am-list.two{flex-direction:row;align-items:center;gap:7cqmin}
  .am-col{flex:1;min-width:0}
  .am-sec{font:800 .78em var(--text);letter-spacing:.16em;text-transform:uppercase;color:var(--highlight);border-bottom:.2cqmin solid color-mix(in srgb,var(--ink) 25%,transparent);padding-bottom:.45em;margin:1em 0 .5em}
  .am-group:first-child .am-sec{margin-top:0}
  .am-dish{display:flex;align-items:baseline;gap:.5em;font:600 1em/1.2 var(--text);padding:.32em 0;white-space:nowrap}
  .am-dish i{flex:1;min-width:2em;border-bottom:.12em dotted color-mix(in srgb,var(--ink) 45%,transparent)}
  .am-dish b{font-weight:800;font-variant-numeric:tabular-nums}
  .am-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:4cqmin;border-top:.2cqmin solid color-mix(in srgb,var(--ink) 25%,transparent);padding-top:3cqmin}
  .am-info{display:flex;flex-direction:column;gap:1cqmin;font:600 3.6cqmin/1.3 var(--text)}
  .am-info p{margin:0}
  .am-info p:first-child{font-weight:800;color:var(--highlight)}
  .am .qr-tile{width:20cqmin}
  @container (min-aspect-ratio: 9/10){
    .am{display:grid;grid-template-columns:1fr 26cqmin;grid-template-rows:auto 1fr;gap:4cqmin 6cqmin}
    .am-head{grid-column:1 / -1}
    .am-list{grid-column:1;grid-row:2}
    .am-foot{grid-column:2;grid-row:2;flex-direction:column-reverse;align-items:stretch;justify-content:flex-start;border-top:0;padding-top:0}
    .am .qr-tile{width:auto}
    .am-info{font-size:2.8cqmin}
  }`,
        script: `
  // The estimate starts large; the list then shrinks until it fits its room.
  (function(){
    var l = document.querySelector('.am-list'), f = parseFloat(getComputedStyle(l).fontSize);
    for (var i = 0; i < 40 && (l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1); i++) { f *= .95; l.style.fontSize = f + 'px'; }
  })();
  kit.enter('#am-place', 'fade', {at:.1, d:.5});
  kit.reveal('#am-title', {at:.3});
  kit.enter('#am-logo', 'pop', {at:.5, d:.5, ease:'spring'});
  kit.enter('.am-sec, .am-dish', 'rise', {at:.9, d:.45, stagger:${Math.min(.08, 1.4 / Math.max(1, rows.length)).toFixed(3)}});
  kit.enter('.am-info p', 'fade', {at:2.3, d:.5, stagger:.1});
  kit.enter('#am-qr', 'pop', {at:2.5, d:.5, ease:'spring'});`,
      };
    },
  },
  {
    id: 'flyer-produit',
    name: 'Flyer produit',
    use: 'A flyer for one product, to hand out or slip into parcels (A5 by default), or to post: the photo, the price on a round tag, three strengths, how to order and a QR code to WhatsApp. The still version of revelation-produit.',
    poster: true,
    format: 'A5',
    duration: 4,
    slots: [
      { key: 'product', label: 'Produit', example: 'Beurre de karité pur' },
      { key: 'image', label: 'Photo du produit (détourée de préférence)', example: '', image: true },
      { key: 'price', label: 'Prix', example: '3 500 F' },
      { key: 'points', label: 'Atouts (un par ligne, 1 à 4)', example: 'Sans parfum ni additif\nFait à Bobo-Dioulasso\nLivré chez vous', list: true },
      { key: 'contact', label: 'Pour commander', example: 'Commandes : 70 00 00 00' },
      { key: 'qr', label: QR_LABEL, example: '' },
    ],
    body: (v, ctx) => {
      const points = lines(v.points).slice(0, 4);
      const nfs = fitSize(v.product, v.image ? 10 : 14, 14);
      const tag = Math.min(7, 20 / (Math.max(3, v.price.length) * .6));
      return {
        html: `
  <section id="s-fp" class="clip scene" data-start="0" data-duration="4" data-track-index="1">
    <div class="pz fp${v.image ? '' : ' bare'}">
      ${brandLine(ctx, 'pz-brand', 'fp-brand')}
      ${v.image ? `<div class="fp-photo" id="fp-photo"><img src="${escapeHtml(v.image)}" alt=""></div>` : ''}
      <div class="fp-txt">
        <h1 class="fp-name" id="fp-name">${escapeHtml(v.product)}</h1>
        ${points.length ? `<ul class="fp-points">${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        <div class="fp-foot">${v.contact ? `<p class="fp-contact" id="fp-contact">${escapeHtml(v.contact)}</p>` : ''}${qrTile(v.qr, '', 'fp-qr')}</div>
      </div>
      ${v.price ? `<div class="fp-tag" id="fp-tag">${escapeHtml(v.price)}</div>` : ''}
    </div>
  </section>`,
        css: `${POSTER_CSS}
  .fp{gap:3.4cqmin}
  .fp-photo{flex:1 1 0;min-height:0;display:grid;place-items:center}
  .fp-photo img{width:100%;height:100%;object-fit:contain}
  .fp-txt{flex:none;display:flex;flex-direction:column;gap:3cqmin}
  .fp.bare .fp-txt{flex:1}
  .fp.bare .fp-name{margin-top:auto}
  .fp-name{margin:0;font:800 ${nfs}cqmin/1.02 var(--display);letter-spacing:-.03em;text-wrap:balance;padding-right:${v.image ? 0 : 28}cqmin}
  .fp-points{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:1.2cqmin;font:600 4.2cqmin/1.3 var(--text)}
  .fp-points li{display:flex;gap:2cqmin}
  .fp-points li::before{content:"";flex:none;width:2cqmin;height:2cqmin;margin-top:1.6cqmin;border-radius:50%;background:var(--accent)}
  .fp-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:4cqmin;margin-top:1cqmin}
  .fp.bare .fp-foot{margin-top:auto}
  .fp-contact{margin:0;font:800 4.4cqmin/1.25 var(--display);color:var(--highlight)}
  .fp .qr-tile{width:20cqmin}
  .fp-tag{position:absolute;top:0;right:0;width:26cqmin;height:26cqmin;border-radius:50%;background:var(--highlight);color:var(--on-highlight);display:grid;place-items:center;text-align:center;font:900 ${tag.toFixed(2)}cqmin/1 var(--display);letter-spacing:-.03em;rotate:8deg}
  @container (min-aspect-ratio: 9/10){
    .fp{display:grid;grid-template-columns:${v.image ? '46% 1fr' : '1fr'};grid-template-rows:auto 1fr;column-gap:6cqmin;row-gap:3cqmin}
    .fp .pz-brand{grid-column:1 / -1}
    .fp-photo{grid-row:2}
    .fp-txt{grid-row:2;justify-content:center;padding-top:${v.price ? 18 : 0}cqmin}
    .fp-name{font-size:${(nfs * .8).toFixed(2)}cqmin}
    .fp-foot{margin-top:auto}
    .fp-tag{width:22cqmin;height:22cqmin;font-size:${(tag * .85).toFixed(2)}cqmin}
  }`,
        script: `
  kit.enter('#fp-brand', 'fade', {at:.1, d:.5});
  kit.enter('#fp-photo', 'rise', {at:.2, d:.9, ease:'apple'});
  kit.enter('#fp-tag', 'pop', {at:.8, d:.6, ease:'spring'});
  kit.reveal('#fp-name', {at:1});
  kit.enter('.fp-points li', 'left', {at:1.5, d:.45, stagger:.15});
  kit.enter('#fp-contact', 'rise', {at:2.2, d:.5});
  kit.enter('#fp-qr', 'pop', {at:2.4, d:.5, ease:'spring'});`,
      };
    },
  },
  {
    id: 'carte-visite',
    name: 'Carte de visite',
    use: 'A business card, front and back (85 × 55 mm by default), for the printer: on the front the logo, the name and the trade in the brand colours; on the back the number, the networks, the address and a QR code that opens WhatsApp. The PDF has two pages, one per side.',
    poster: true,
    format: 'carte',
    duration: 4,
    slots: [
      { key: 'name', label: 'Nom', example: 'Awa Ouédraogo' },
      { key: 'role', label: 'Métier ou fonction', example: 'Couture sur mesure' },
      { key: 'phone', label: 'Téléphone', example: '70 00 00 00' },
      { key: 'social', label: 'Réseaux ou e-mail', example: '@awa.couture' },
      { key: 'lines', label: 'Autres lignes (adresse…)', example: 'Ouaga 2000, Ouagadougou\nLivraison partout', list: true },
      { key: 'qr', label: QR_LABEL, example: '' },
    ],
    body: (v, ctx) => {
      const more = lines(v.lines).slice(0, 3);
      return {
        pages: [1.95, 3.95],
        html: `
  <section id="s-cv-front" class="clip scene cv-front" data-start="0" data-duration="2" data-track-index="1">
    <div class="pz cv">
      ${logoMark(ctx, 'mark cv-logo', 'cv-logo')}
      <div class="cv-who">
        <b id="cv-name">${escapeHtml(v.name)}</b>
        ${v.role ? `<span id="cv-role">${escapeHtml(v.role)}</span>` : ''}
        ${ctx.brand.name && ctx.brand.name !== v.name ? `<small id="cv-brand">${escapeHtml(ctx.brand.name)}</small>` : ''}
      </div>
    </div>
  </section>
  <section id="s-cv-back" class="clip scene cv-back" data-start="2" data-duration="2" data-track-index="2">
    <div class="pz cv cv-row">
      <div class="cv-lines">
        ${v.phone ? `<p class="cv-phone">${PHONE_SVG}${escapeHtml(v.phone)}</p>` : ''}
        ${v.social ? `<p>${escapeHtml(v.social)}</p>` : ''}
        ${more.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}
      </div>
      ${qrTile(v.qr, '', 'cv-qr')}
    </div>
  </section>`,
        css: `${POSTER_CSS}
  .cv-front{background:var(--accent);color:var(--on-accent)}
  .cv-back{background:var(--background);color:var(--ink)}
  .cv{justify-content:space-between}
  .cv-logo{width:17cqmin;height:17cqmin;font-size:9cqmin;border-radius:4cqmin}
  .cv-front .mark.tile{background:var(--on-accent);color:var(--accent)}
  .cv-who{display:flex;flex-direction:column;gap:1.6cqmin}
  .cv-who b{font:800 9cqmin/1.05 var(--display);letter-spacing:-.025em}
  .cv-who span{font:600 5.4cqmin/1.25 var(--text)}
  .cv-who small{font:700 4cqmin var(--text);letter-spacing:.12em;text-transform:uppercase;opacity:.8}
  .cv-row{flex-direction:row;align-items:center;gap:6cqmin}
  .cv-lines{flex:1;min-width:0;display:flex;flex-direction:column;gap:2cqmin;font:600 5cqmin/1.3 var(--text)}
  .cv-lines p{margin:0}
  .cv-phone{display:flex;align-items:center;gap:2cqmin;font:800 7cqmin/1.1 var(--display)!important;color:var(--highlight)}
  .cv-phone svg{width:6cqmin;height:6cqmin;flex:none}
  .cv .qr-tile{width:36cqmin}
  @container (max-aspect-ratio: 4/5){
    .cv-row{flex-direction:column;align-items:flex-start;justify-content:center}
  }`,
        script: `
  kit.enter('#cv-logo', 'pop', {at:.1, d:.5, ease:'spring'});
  kit.reveal('#cv-name', {at:.35});
  kit.enter('#cv-role', 'rise', {at:.8, d:.5});
  kit.enter('#cv-brand', 'fade', {at:1, d:.5});
  kit.enter('.cv-lines p', 'left', {at:2.15, d:.45, stagger:.12});
  kit.enter('#cv-qr', 'pop', {at:2.5, d:.5, ease:'spring'});`,
      };
    },
  },
];

/**
 * The page around a template: the HyperFrames root, the brand as CSS
 * variables, and `hf()`, which creates each animation paused at its absolute
 * time so the waapi adapter can seek it.
 */
export function compose(templateId: string, opts: { format: Format; title: string; brand: BrandKit; values: Values; logoSrc: string | null; speed?: number }): { html: string; duration: number } {
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) throw new Error(`Unknown template ${templateId}`);
  const { width, height } = FORMATS[opts.format];
  const values: Values = Object.fromEntries(t.slots.map((s) => [s.key, (opts.values[s.key] ?? s.example).toString()]));
  const speed = Math.max(0.5, Math.min(2, opts.speed ?? (opts.brand.tone === 'premium' ? 0.85 : opts.brand.tone === 'warm' ? 0.95 : 1)));
  const part = t.body(values, { brand: opts.brand, logoSrc: opts.logoSrc, speed, width, height });
  const duration = part.duration ?? t.duration;
  // Paper: the trim size for the PDF, and the bleed every layout keeps clear.
  const paper = isPrint(opts.format) ? ` data-print-mm="${PRINT_SIZES[opts.format].join('x')}"` : '';
  const pages = part.pages?.length ? ` data-poster-at="${part.pages.join(',')}"` : '';
  const c = opts.brand.colors;
  const palette = (opts.brand.palette ?? []).map((hex, i) => `;--brand-${i + 1}:${hex}`).join('');
  const fontsUrl = [...new Set([opts.brand.fonts.display, opts.brand.fonts.text])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700;800;900`).join('&');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<!-- Baarali Studio Motion · template ${t.id} · HyperFrames composition, Web Animations only (no GSAP). -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontsUrl}&display=block">
<style>
  :root{--background:${c.background};--ink:${c.ink};--accent:${c.accent};--highlight:${c.highlight};--on-accent:${textOn(c.accent)};--on-highlight:${textOn(c.highlight)}${palette};--display:'${opts.brand.fonts.display}',system-ui,sans-serif;--text:'${opts.brand.fonts.text}',system-ui,sans-serif;--bleed:${isPrint(opts.format) ? `${BLEED_MM}mm` : '0px'}}
  html,body{margin:0;background:${t.transparent ? 'transparent' : 'var(--background)'}}
  #root{position:relative;overflow:hidden;width:${width}px;height:${height}px;container-type:size;background:${t.transparent ? 'transparent' : 'var(--background)'};color:var(--ink);font-family:var(--text)}
  .scene{position:absolute;inset:0}${KIT_CSS}
  .mark{width:7cqmin;height:7cqmin;object-fit:contain}
  .mark.tile{display:grid;place-items:center;border-radius:1.8cqmin;background:var(--accent);color:var(--on-accent);font:900 4cqmin var(--display)}${part.css ?? ''}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}"${paper}${pages} data-no-timeline>${part.html}
</div>
<script>
${KIT_JS}${part.script}
</script>
</body>
</html>
`;
  return { html, duration };
}
