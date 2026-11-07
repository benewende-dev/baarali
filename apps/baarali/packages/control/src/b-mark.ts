// BAARALI(07/11/2026): the Baarali sign, redrawn in OpenBaara's family
// (the founder's choice C): the B that looks, without its feet and without
// the blue. Black and white only, the eyes cut out of the body. One source
// for every app, page and file (desktop scripts/identity.mjs makes the kit).
//
// The body is the B of 01/10/2026, unchanged; its box is 384..626 × 250..502.
// The eyes look right, as before. The word is Geist SemiBold (OFL, the
// OpenBaara typeface), tracking −0.03 em, size 100, capitals from y = 0 to
// y = 71 (vectorized from Geist-SemiBold.ttf with fontkit).

export const INK = '#0A0A0A';
export const PAPER = '#FFFFFF';

export const B_BODY =
  'M450 250 H502 C574 250 612 280 612 322 C612 345 602 360 590 368 Q584 373 590 378 C612 388 626 408 626 436 C626 476 590 502 512 502 H450 C413 502 384 473 384 436 V316 C384 279 413 250 450 250 Z';
export const B_EYES = [{ cx: 500, cy: 324 }, { cx: 554, cy: 324 }] as const;
export const B_EYE_R = 14;
/** A square box around the body, its centre at the body's centre. */
export const B_BOX = { x: 369, y: 240, size: 272 } as const;
/** How far the eyes may travel when it looks around (motion), in body units. */
export const B_LOOK = 16; // eyesPose's `look`

export const WORD = {
  d: 'M8 0L34.6 0Q47.8 0 54.45 4.7Q61.1 9.4 61.1 19.2Q61.1 25.6 57.35 29.6Q53.6 33.6 46.8 34.3Q55 35 59.55 39.55Q64.1 44.1 64.1 51.5Q64.1 61.2 57.45 66.1Q50.8 71 38.2 71L8 71ZM37.6 60Q43.8 60 47.3 57.45Q50.8 54.9 50.8 50.1Q50.8 45.2 47.3 42.6Q43.8 40 37.6 40L21 40L21 60L37.6 60ZM34.2 29.8Q40.6 29.8 44.2 27.35Q47.8 24.9 47.8 20.4Q47.8 11 34.2 11L21 11L21 29.8L34.2 29.8ZM88.6 72.2Q80.1 72.2 75.05 68.35Q70 64.5 70 57.6Q70 50.8 74.25 46.85Q78.5 42.9 87.4 41.2L105.1 37.7Q105.1 32.1 102.5 29.2Q99.9 26.3 94.9 26.3Q85.8 26.3 84 34.6L70.9 34Q72.5 25.6 78.7 21Q84.9 16.4 94.9 16.4Q106.2 16.4 112.05 22.15Q117.9 27.9 117.9 38.6L117.9 58Q117.9 60.1 118.6 60.9Q119.3 61.7 120.9 61.7L122.6 61.7L122.6 71Q121 71.4 118 71.4Q113.3 71.4 110.45 69.4Q107.6 67.4 106.8 62.7Q104.8 67 99.95 69.6Q95.1 72.2 88.6 72.2ZM91.2 62.9Q97.5 62.9 101.3 59.2Q105.1 55.5 105.1 49.4L105.1 46.4L91.3 49.2Q87.1 50 85.2 51.8Q83.3 53.6 83.3 56.4Q83.3 59.5 85.35 61.2Q87.4 62.9 91.2 62.9ZM145.2 72.2Q136.7 72.2 131.65 68.35Q126.6 64.5 126.6 57.6Q126.6 50.8 130.85 46.85Q135.1 42.9 144 41.2L161.7 37.7Q161.7 32.1 159.1 29.2Q156.5 26.3 151.5 26.3Q142.4 26.3 140.6 34.6L127.5 34Q129.1 25.6 135.3 21Q141.5 16.4 151.5 16.4Q162.8 16.4 168.65 22.15Q174.5 27.9 174.5 38.6L174.5 58Q174.5 60.1 175.2 60.9Q175.9 61.7 177.5 61.7L179.2 61.7L179.2 71Q177.6 71.4 174.6 71.4Q169.9 71.4 167.05 69.4Q164.2 67.4 163.4 62.7Q161.4 67 156.55 69.6Q151.7 72.2 145.2 72.2ZM147.8 62.9Q154.1 62.9 157.9 59.2Q161.7 55.5 161.7 49.4L161.7 46.4L147.9 49.2Q143.7 50 141.8 51.8Q139.9 53.6 139.9 56.4Q139.9 59.5 141.95 61.2Q144 62.9 147.8 62.9ZM185.9 17.6L197.9 17.6L198.2 27.9Q199.8 22.6 202.95 20.1Q206.1 17.6 211 17.6L215.9 17.6L215.9 28.6L210.9 28.6Q204.7 28.6 201.7 31.35Q198.7 34.1 198.7 40.2L198.7 71L185.9 71ZM237.5 72.2Q229 72.2 223.95 68.35Q218.9 64.5 218.9 57.6Q218.9 50.8 223.15 46.85Q227.4 42.9 236.3 41.2L254 37.7Q254 32.1 251.4 29.2Q248.8 26.3 243.8 26.3Q234.7 26.3 232.9 34.6L219.8 34Q221.4 25.6 227.6 21Q233.8 16.4 243.8 16.4Q255.1 16.4 260.95 22.15Q266.8 27.9 266.8 38.6L266.8 58Q266.8 60.1 267.5 60.9Q268.2 61.7 269.8 61.7L271.5 61.7L271.5 71Q269.9 71.4 266.9 71.4Q262.2 71.4 259.35 69.4Q256.5 67.4 255.7 62.7Q253.7 67 248.85 69.6Q244 72.2 237.5 72.2ZM240.1 62.9Q246.4 62.9 250.2 59.2Q254 55.5 254 49.4L254 46.4L240.2 49.2Q236 50 234.1 51.8Q232.2 53.6 232.2 56.4Q232.2 59.5 234.25 61.2Q236.3 62.9 240.1 62.9ZM290.5 71Q284.3 71 280.95 67.95Q277.6 64.9 277.6 58.4L277.7 0L290.5 0L290.5 57.1Q290.5 61.1 294.5 61.1L298.4 61.1L298.4 71L290.5 71ZM306 17.6L318.8 17.6L318.8 71L306 71ZM305.8 -0.9L319.1 -0.9L319.1 10.5L305.8 10.5Z',
  /** First stroke of the B (its side bearing), and the advance of the word. */
  left: 8,
  width: 325.9,
  capHeight: 71,
} as const;

/** The eyes as sub-paths, so `evenodd` cuts them out of the body. */
const EYE_HOLES = B_EYES.map(e => `M${e.cx - B_EYE_R} ${e.cy}a${B_EYE_R} ${B_EYE_R} 0 1 0 ${2 * B_EYE_R} 0a${B_EYE_R} ${B_EYE_R} 0 1 0 ${-2 * B_EYE_R} 0Z`).join('');

/**
 * The B alone, as SVG markup (no <svg> wrapper), in the body's units.
 * `eyes: 'cut'` (the default) leaves them transparent: the sign reads on any
 * background and as a mask (Android's monochrome icon, favicons).
 */
export function bMarkup(body = INK, eyes: string = 'cut'): string {
  if (eyes === 'cut') return `<path d="${B_BODY}${EYE_HOLES}" fill-rule="evenodd" fill="${body}"/>`;
  return `<path d="${B_BODY}" fill="${body}"/>` + B_EYES.map(e => `<circle cx="${e.cx}" cy="${e.cy}" r="${B_EYE_R}" fill="${eyes}"/>`).join('');
}

/** The B, square, standalone; `eyes` 'none' cuts nothing (a silhouette for masks). */
export function bSvg({ size = 512, body = INK, eyes = 'cut', tile, pad = 0.12, radius = 0 }: { size?: number; body?: string; eyes?: string; tile?: string; pad?: number; radius?: number } = {}): string {
  const s = B_BOX.size / (1 - 2 * pad);
  const x = B_BOX.x + B_BOX.size / 2 - s / 2, y = B_BOX.y + B_BOX.size / 2 - s / 2;
  const bg = tile ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * radius}" fill="${tile}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${s} ${s}">${bg}${bMarkup(body, eyes)}</svg>`;
}

/** The word alone, `height` px tall (capitals), one colour. */
export function wordSvg({ height = 71, color = INK }: { height?: number; color?: string } = {}): string {
  const w = WORD.width - WORD.left;
  const width = Math.round((height * w) / WORD.capHeight);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${WORD.left} 0 ${w} ${WORD.capHeight}" role="img" aria-label="Baarali"><path d="${WORD.d}" fill="${color}"/></svg>`;
}

/**
 * The B beside the word: the B is 1.5 times the capitals' height, centred
 * on them, 0.35 B away from the word (OpenBaara's lockup, re-proportioned
 * for a taller sign).
 */
export function lockupSvg({ height = 120, color = INK, eyes = 'cut', background }: { height?: number; color?: string; eyes?: string; background?: string } = {}): string {
  const cap = WORD.capHeight, markH = cap * 1.5;
  const k = markH / 252;
  const gap = markH * 0.35;
  const wordW = WORD.width - WORD.left;
  const markW = 242 * k;
  const total = markW + gap + wordW, top = (cap - markH) / 2;
  const vb = `0 ${top} ${total} ${markH}`;
  const width = Math.round((height * total) / markH);
  const bg = background ? `<rect x="0" y="${top}" width="${total}" height="${markH}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb}">${bg}` +
    `<g transform="translate(0 ${top}) scale(${k}) translate(-384 -250)">${bMarkup(color, eyes)}</g>` +
    `<path transform="translate(${markW + gap - WORD.left} 0)" d="${WORD.d}" fill="${color}"/></svg>`;
}

// ── Its life: only the eyes move, as a person looking up from work ──
// « loading » (working, waiting): a glance left, back right, a blink.
// « rotation » (a longer moment): the eyes go round once, then blink.
// « static »: still, eyes right, as drawn.

export type MarkMotion = 'static' | 'loading' | 'rotation';
export const DURATION = { static: 0, loading: 3200, rotation: 4000 } as const;
export type EyesPose = { dx: number; dy: number; lid: number };

/** Self-contained (no outer helpers): public pages serialize it (logo.ts). */
export function eyesPose(motion: MarkMotion, phase: number): EyesPose {
  const look = 16;
  const ease = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
  // A blink centred on 0.85, 0.05 long: 1 open, 0.1 shut.
  const lid = 1 - 0.9 * Math.max(0, 1 - Math.abs(phase - 0.85) / 0.025);
  if (motion === 'static') return { dx: 0, dy: 0, lid: 1 };
  if (motion === 'loading') {
    // right (as drawn) → left → right, holding each look.
    const left = -2.2 * look;
    const dx = phase < 0.25 ? 0 : phase < 0.35 ? left * ease((phase - 0.25) / 0.1)
      : phase < 0.6 ? left : phase < 0.7 ? left * (1 - ease((phase - 0.6) / 0.1)) : 0;
    return { dx, dy: 0, lid };
  }
  // rotation: one turn around the drawn position, then a blink.
  const turn = 2 * Math.PI * ease((phase - 0.1) / 0.6);
  const r = phase > 0.1 && phase < 0.7 ? look : look * Math.max(0, 1 - Math.abs(phase < 0.1 ? phase - 0.1 : phase - 0.7) * 10);
  return { dx: -Math.sin(turn) * r, dy: -Math.cos(turn) * r, lid };
}

// BAARALI(07/11/2026): the agents' shapes, the B's family (the founder's
// call): drawn in a 100-unit box, each with the B's two round eyes. The
// phone (agent-shape.tsx) and the site (living-shapes.ts) draw them from here.
export type ShapeId = 'b' | 'round' | 'pebble' | 'dome' | 'drop' | 'pill' | 'square' | 'arch' | 'bean' | 'cloud' | 'leaf' | 'kite';

/** The colour a shape is filled with, by the name the agent keeps. */
export const SHAPE_FILL: Record<string, string> = {
  white: '#FFFFFF', brown: '#8B5E3C', red: '#F0353F', orange: '#FF6A1A', amber: '#FFA31A',
  green: '#12C26B', teal: '#14B8A6', blue: '#1F7BFF', violet: '#8B5CF6', rose: '#F43F8E',
  gray: '#7A7A7A', clay: '#E0703C', ink: INK,
};


export type Eyes = [number, number, number, number];
export const EYES: Eyes = [42, 44, 58, 44];

export const SHAPES: Record<Exclude<ShapeId, 'b'>, { d: string; eyes?: Eyes }> = {
  round: { d: 'M50 12 A38 38 0 1 1 49.9 12 Z' },
  pebble: { d: 'M50 14 C76 14 92 32 90 56 C88 78 70 90 48 88 C24 86 8 70 10 48 C12 28 28 14 50 14 Z' },
  dome: { d: 'M14 82 V50 C14 28 30 14 50 14 C70 14 86 28 86 50 V82 C86 86 84 88 80 88 H20 C16 88 14 86 14 82 Z' },
  drop: { d: 'M50 10 C64 30 84 44 84 62 C84 80 69 90 50 90 C31 90 16 80 16 62 C16 44 36 30 50 10 Z', eyes: [42, 58, 58, 58] },
  pill: { d: 'M30 26 H70 C84 26 94 37 94 50 C94 63 84 74 70 74 H30 C16 74 6 63 6 50 C6 37 16 26 30 26 Z', eyes: [42, 46, 58, 46] },
  square: { d: 'M50 12 C80 12 88 20 88 50 C88 80 80 88 50 88 C20 88 12 80 12 50 C12 20 20 12 50 12 Z' },
  arch: { d: 'M12 88 V46 C12 26 29 12 50 12 C71 12 88 26 88 46 V88 H68 V66 C68 58 60 52 50 52 C40 52 32 58 32 66 V88 Z', eyes: [42, 32, 58, 32] },
  bean: { d: 'M30 16 C46 10 58 22 66 26 C80 32 92 42 90 62 C88 82 70 92 50 88 C30 84 12 74 10 52 C8 34 16 22 30 16 Z', eyes: [44, 44, 60, 46] },
  cloud: { d: 'M28 84 C14 84 6 74 6 62 C6 50 15 42 26 42 C26 26 38 14 52 14 C66 14 77 24 79 37 C89 39 96 48 96 60 C96 73 86 84 72 84 Z', eyes: [44, 50, 60, 50] },
  leaf: { d: 'M88 12 C88 60 70 88 30 88 C18 88 12 82 12 70 C12 34 44 12 88 12 Z', eyes: [46, 50, 62, 44] },
  kite: { d: 'M50 8 C54 8 57 10 60 14 L88 44 C92 48 92 52 88 56 L60 86 C57 90 54 92 50 92 C46 92 43 90 40 86 L12 56 C8 52 8 48 12 44 L40 14 C43 10 46 8 50 8 Z', eyes: [42, 48, 58, 48] },
};

