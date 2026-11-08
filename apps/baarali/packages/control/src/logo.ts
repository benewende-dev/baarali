// BAARALI(07/11/2026): the B that looks, black and white (the founder's
// sign C, src/b-mark.ts), on public pages. The eyes are holes (a mask) and
// only they move; inline SVG respects the pages' CSP.
import { B_BODY, B_BOX, B_EYES, B_EYE_R, DURATION, WORD, eyesPose } from './b-mark.js';

const BODY = B_BODY;
const VIEW = `${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}`;
let serial = 0;
/** The B in `currentColor`, its eyes cut out; `id` keeps masks apart on one page. */
function tile(id: string): string {
  const eyes = B_EYES.map(e => `<circle r="${B_EYE_R}" fill="#000" transform="translate(${e.cx} ${e.cy})"/>`).join('');
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${B_BOX.x}" y="${B_BOX.y}" width="${B_BOX.size}" height="${B_BOX.size}">` +
    `<rect x="${B_BOX.x}" y="${B_BOX.y}" width="${B_BOX.size}" height="${B_BOX.size}" fill="#fff"/>${eyes}</mask>` +
    `<path d="${BODY}" fill="currentColor" mask="url(#${id})"/>`;
}

/** The tile alone, `size` px. Decorative: the name sits beside it. */
export function logoTile(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${tile(`bm${++serial}`)}</svg>`;
}

/** The name, `height` px tall (capitals), in the text color: Geist SemiBold, as OpenBaara. */
export function logoWord(height: number): string {
  const w = WORD.width - WORD.left;
  const width = Math.round((height * w) / WORD.capHeight);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORD.left} 0 ${w} ${WORD.capHeight}" width="${width}" height="${height}" role="img" aria-label="Baarali"><path d="${WORD.d}" fill="currentColor"/></svg>`;
}

/** The B whose eyes look around while the page works. */
export function logoTileLive(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="${size}" height="${size}" class="logo-live" aria-hidden="true" focusable="false">${tile(`bm${++serial}`)}</svg>`;
}

export const LOGO_ALIVE_CSS = `
.logo-live { display:inline-block; flex-shrink:0; }
`;

// BAARALI(11/10/2026): one clock serves visible logos, then stops when the
// page is hidden. The serialized pure function keeps site and app in sync.
export const LOGO_ALIVE_JS = `
(() => {
  const logos = [...document.querySelectorAll('.logo-live')];
  if (!logos.length) return;
  const eyes = ${JSON.stringify(B_EYES)};
  const pose = (${eyesPose.toString()});
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set(logos);
  const parts = new Map(logos.map(svg => [svg, [...svg.querySelectorAll('circle')]]));
  let frame = 0, previous = 0, elapsed = 0;
  function draw(svg, phase) {
    const p = pose(media.matches ? 'static' : 'loading', phase);
    parts.get(svg).forEach((part, i) => {
      part.setAttribute('transform', 'translate('+(eyes[i].cx+p.dx)+' '+(eyes[i].cy+p.dy)+') scale(1 '+p.lid+')');
    });
  }
  function tick(now) {
    if (previous) elapsed += Math.min(80, now-previous);
    previous = now;
    for (const svg of visible) draw(svg, (elapsed % ${DURATION.loading}) / ${DURATION.loading});
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); previous = 0;
    if (media.matches) { logos.forEach(svg => draw(svg, 0)); return; }
    if (!document.hidden && visible.size) frame = requestAnimationFrame(tick);
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
    }
    sync();
  });
  logos.forEach(svg => observer.observe(svg));
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); previous = 0; });
  window.addEventListener('pageshow', sync);
  sync();
})();
`;

/** The tile as the tab's icon. */
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}"><style>svg{color:#000}@media(prefers-color-scheme:dark){svg{color:#fff}}</style>${tile('fav')}</svg>`)}`;

/**
 * The character itself, for the page to bring to life (decided 01/10/2026:
 * the glint in the eyes is kept for the animation, not the logo). The page's
 * CSS moves the classes: .m-body, .m-eyes (look), .m-lids (blink). No feet
 * since 07/11/2026 (the founder's sign C).
 */
export function mascot(height: number, color = '#FFFFFF'): string {
  const width = Math.round((height * 270) / 280);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="370 236 270 280" width="${width}" height="${height}" class="mascot" aria-hidden="true" focusable="false">` +
    `<g class="m-body"><path d="${BODY}" fill="${color}"/>` +
    `<g class="m-eyes"><g class="m-lids">` +
    '<circle cx="498" cy="324" r="14" fill="#0A0A0A"/><circle cx="552" cy="324" r="14" fill="#0A0A0A"/>' +
    `<circle cx="502.9" cy="318.4" r="4.5" fill="${color}"/><circle cx="556.9" cy="318.4" r="4.5" fill="${color}"/>` +
    '</g></g></g>' +
    '</svg>'
  );
}
