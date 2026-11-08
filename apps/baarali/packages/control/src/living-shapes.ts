import { B_BODY, B_BOX, B_EYES, B_EYE_R, DURATION, EYES, INK, PAPER, SHAPES, SHAPE_FILL, eyesPose, type ShapeId } from './b-mark.js';

// BAARALI(07/11/2026): the B's family alive on the site, as in the app
// (agent-shape.tsx): shapes whose eyes glance and blink, one clock for all,
// and the right download first for the visitor's computer.

/** The welcome's parade, as in the app (welcome.tsx). */
export const PARADE: Array<{ shape: ShapeId; color: string; size: number }> = [
  { shape: 'cloud', color: 'violet', size: 54 }, { shape: 'pebble', color: 'orange', size: 54 }, { shape: 'drop', color: 'blue', size: 66 },
  { shape: 'kite', color: 'green', size: 54 }, { shape: 'dome', color: 'rose', size: 54 },
];

/** A shape whose eyes the page's script moves (data-eyes: x1,y1,x2,y2,radius in its box). */
export function living(shape: ShapeId, color: string, size: number, extra = ''): string {
  if (color === 'white') extra += ' is-white';
  const fill = SHAPE_FILL[color] ?? SHAPE_FILL.clay;
  const eye = fill === INK ? PAPER : INK;
  if (shape === 'b') {
    const [a, b] = B_EYES;
    return `<svg class="living${extra}" viewBox="${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}" width="${size}" height="${size}" aria-hidden="true" focusable="false" data-eyes="${a.cx},${a.cy},${b.cx},${b.cy}" data-unit="${B_BOX.size}"><path d="${B_BODY}" fill="${fill}"/><circle r="${B_EYE_R}" cx="0" cy="0" fill="${eye}" transform="translate(${a.cx} ${a.cy})"/><circle r="${B_EYE_R}" cx="0" cy="0" fill="${eye}" transform="translate(${b.cx} ${b.cy})"/></svg>`;
  }
  const g = SHAPES[shape];
  const e = g.eyes ?? EYES;
  return `<svg class="living${extra}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false" data-eyes="${e.join(',')}" data-unit="100"><path d="${g.d}" fill="${fill}"/><circle r="5.2" cx="0" cy="0" fill="${eye}" transform="translate(${e[0]} ${e[1]})"/><circle r="5.2" cx="0" cy="0" fill="${eye}" transform="translate(${e[2]} ${e[3]})"/></svg>`;
}

// One clock for every shape on screen; each keeps its own rhythm. The pose
// is the app's (b-mark.ts), serialized; still when motion is reduced.
export const LIVING_JS = `
(() => {
  const shapes = [...document.querySelectorAll('svg.living')];
  if (!shapes.length) return;
  const pose = (${eyesPose.toString()});
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const parts = shapes.map((svg, i) => {
    const e = svg.dataset.eyes.split(',').map(Number);
    const unit = Number(svg.dataset.unit) / ${B_BOX.size};
    return { eyes: [[e[0], e[1]], [e[2], e[3]]], unit, dots: [...svg.querySelectorAll('circle')], offset: i * 0.13 };
  });
  let frame = 0, previous = 0, elapsed = 0;
  function draw(phase) {
    for (const p of parts) {
      const q = pose(media.matches ? 'static' : 'loading', (phase + p.offset) % 1);
      p.dots.forEach((dot, i) => dot.setAttribute('transform', 'translate(' + (p.eyes[i][0] + q.dx * p.unit) + ' ' + (p.eyes[i][1] + q.dy * p.unit) + ') scale(1 ' + q.lid + ')'));
    }
  }
  function tick(now) {
    if (previous) elapsed += Math.min(80, now - previous);
    previous = now;
    draw((elapsed % ${DURATION.loading}) / ${DURATION.loading});
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); previous = 0;
    if (media.matches || document.hidden) { draw(0); return; }
    frame = requestAnimationFrame(tick);
  }
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
})();
`;

// The right file first: Windows when the visitor is on Windows, the Mac otherwise.
export const PICK_JS = `
(() => {
  const main = document.querySelector('[data-primary]');
  if (!main) return;
  const windows = /Windows/i.test(navigator.userAgent);
  if (!windows) return;
  main.href = main.dataset.windows;
  main.querySelector('span').textContent = main.dataset.windowsLabel;
})();
`;

