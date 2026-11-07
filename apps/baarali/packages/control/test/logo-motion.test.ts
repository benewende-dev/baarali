import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FAVICON, LOGO_ALIVE_JS, logoTileLive, logoWord } from '../src/logo.js';
import { B_EYES, DURATION, eyesPose } from '../src/b-mark.js';

function browser() {
  const transforms: string[] = [];
  const parts = B_EYES.map((_, i) => ({ setAttribute(_name: string, value: string) { transforms[i] = value; } }));
  const svg = { querySelectorAll: () => parts };
  const callbacks = new Map<number, (now: number) => void>();
  const events = new Map<string, () => void>();
  let serial = 0;
  let intersect: (entries: { target: typeof svg; isIntersecting: boolean }[]) => void = () => {};
  const document = { hidden: false, querySelectorAll: () => [svg], addEventListener: (name: string, fn: () => void) => events.set(name, fn) };
  const media = { matches: false, addEventListener: (name: string, fn: () => void) => events.set(name, fn) };
  runInNewContext(LOGO_ALIVE_JS, {
    document, window: { addEventListener: document.addEventListener }, matchMedia: () => media,
    requestAnimationFrame: (fn: (now: number) => void) => { callbacks.set(++serial, fn); return serial; },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
    IntersectionObserver: class { constructor(fn: typeof intersect) { intersect = fn; } observe() {} },
  });
  return { transforms, callbacks, document, media, events,
    visible(on: boolean) { intersect([{ target: svg, isIntersecting: on }]); },
    advance(now: number) {
      Array.from(callbacks.entries()).forEach(([id, fn]) => { callbacks.delete(id); fn(now); });
    },
  };
}

const at = (i: number, p: { dx: number; dy: number; lid: number }) =>
  `translate(${B_EYES[i].cx + p.dx} ${B_EYES[i].cy + p.dy}) scale(1 ${p.lid})`;

describe('the public logo', () => {
  it('is the B that looks, black and white, its two eyes cut out', () => {
    const svg = logoTileLive(32);
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toMatch(/#1A6DFF/i);
    expect(logoWord(20)).toContain('aria-label="Baarali"');
    expect(decodeURIComponent(FAVICON)).toContain('<mask id="fav"');
  });

  it('moves only the eyes, with the same pose and timing as the apps', () => {
    const page = browser();
    // Frames of 50 ms, up to 1 s: the glance has started.
    for (let now = 100; now <= 1100; now += 50) page.advance(now);
    B_EYES.forEach((_, i) => expect(page.transforms[i]).toBe(at(i, eyesPose('loading', 1000 / DURATION.loading))));
    expect(page.transforms[0]).not.toBe(at(0, { dx: 0, dy: 0, lid: 1 }));
    expect(eyesPose('loading', 0.5).dx).toBeLessThan(0);
    expect(eyesPose('loading', 0.85).lid).toBeLessThan(0.2);
  });

  it('stops for hidden pages, offscreen logos and page navigation', () => {
    const page = browser();
    expect(page.callbacks.size).toBe(1);
    page.visible(false); expect(page.callbacks.size).toBe(0);
    page.visible(true); expect(page.callbacks.size).toBe(1);
    page.document.hidden = true; page.events.get('visibilitychange')!();
    expect(page.callbacks.size).toBe(0);
    page.document.hidden = false; page.events.get('visibilitychange')!();
    expect(page.callbacks.size).toBe(1);
    page.events.get('pagehide')!(); expect(page.callbacks.size).toBe(0);
    page.events.get('pageshow')!(); expect(page.callbacks.size).toBe(1);
  });

  it('returns to the still B when reduced motion is enabled while mounted', () => {
    const page = browser();
    page.advance(100); page.advance(1100);
    page.media.matches = true; page.events.get('change')!();
    expect(page.callbacks.size).toBe(0);
    B_EYES.forEach((_, i) => expect(page.transforms[i]).toBe(at(i, { dx: 0, dy: 0, lid: 1 })));
  });
});
