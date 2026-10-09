// The Studio Motion's templates (decided 08/10/2026, mockup v2 validated the
// same day): HyperFrames compositions (Apache-2.0, heygen-com/hyperframes)
// the agent starts from, then edits like any HTML file. Every motion is the
// Web Animations API, created at load, paused, and seeked by HyperFrames'
// waapi adapter — never GSAP, whose licence forbids no-code animation
// builders. Sizes are container units of the root, so one template fits
// every format; colours and fonts are the brand kit's CSS variables.

import { KIT_CSS, KIT_JS } from './motion-kit.js';

export const FORMATS = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
} as const;
export type Format = keyof typeof FORMATS;

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
}

export interface Template {
  id: string;
  name: string;
  use: string;
  /** Seconds, before a slot (a countdown's count) changes it. */
  duration: number;
  /** Rendered over a transparent background: an overlay for a video. */
  transparent?: boolean;
  slots: Slot[];
  body: (v: Values, ctx: Ctx) => { html: string; script: string; css?: string; duration?: number };
}

type Values = Record<string, string>;
interface Ctx {
  brand: BrandKit;
  /** The logo's src relative to index.html, or null. */
  logoSrc: string | null;
  speed: number;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const lines = (s: string | undefined) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
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
  const part = t.body(values, { brand: opts.brand, logoSrc: opts.logoSrc, speed });
  const duration = part.duration ?? t.duration;
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
  :root{--background:${c.background};--ink:${c.ink};--accent:${c.accent};--highlight:${c.highlight};--on-accent:${textOn(c.accent)}${palette};--display:'${opts.brand.fonts.display}',system-ui,sans-serif;--text:'${opts.brand.fonts.text}',system-ui,sans-serif}
  html,body{margin:0;background:${t.transparent ? 'transparent' : 'var(--background)'}}
  #root{position:relative;overflow:hidden;width:${width}px;height:${height}px;container-type:size;background:${t.transparent ? 'transparent' : 'var(--background)'};color:var(--ink);font-family:var(--text)}
  .scene{position:absolute;inset:0}${KIT_CSS}
  .mark{width:7cqmin;height:7cqmin;object-fit:contain}
  .mark.tile{display:grid;place-items:center;border-radius:1.8cqmin;background:var(--accent);color:var(--on-accent);font:900 4cqmin var(--display)}${part.css ?? ''}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}" data-no-timeline>${part.html}
</div>
<script>
${KIT_JS}${part.script}
</script>
</body>
</html>
`;
  return { html, duration };
}
