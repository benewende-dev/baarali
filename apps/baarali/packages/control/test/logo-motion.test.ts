import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { LOGO_ALIVE_JS, logoTileLive } from '../src/logo.js';
import { OVALS, markPose } from '../src/oval-b.js';

function browser() {
  const transforms: string[] = [];
  const parts = OVALS.map((_, i) => ({ setAttribute(_name: string, value: string) { transforms[i] = value; } }));
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

describe('the public logo loading loop', () => {
  it('runs the serialized browser script with the same geometry and timing as the app', () => {
    expect(logoTileLive(32).match(/<ellipse /g)).toHaveLength(12);
    const page = browser();
    page.advance(100); page.advance(160);
    OVALS.forEach((_, i) => {
      const p = markPose('loading', 60 / 5800, i);
      expect(page.transforms[i]).toBe(`translate(${p.x} ${p.y}) rotate(${p.a * 180 / Math.PI}) scale(${p.sx} ${p.sy})`);
    });
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

  it('returns to a static B when reduced motion is enabled while mounted', () => {
    const page = browser();
    page.advance(100); page.advance(160);
    page.media.matches = true; page.events.get('change')!();
    expect(page.callbacks.size).toBe(0);
    OVALS.forEach((p, i) => expect(page.transforms[i]).toBe(`translate(${p.x} ${p.y}) rotate(${p.a * 180 / Math.PI}) scale(1 1)`));
  });
});
