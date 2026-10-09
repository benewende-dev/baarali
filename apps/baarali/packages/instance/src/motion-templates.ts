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
