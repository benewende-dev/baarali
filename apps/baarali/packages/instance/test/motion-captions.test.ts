import { describe, expect, it } from 'vitest';
import { CAPTIONS_END, CAPTIONS_START, captionsBlock, findVoice, injectCaptions, isKeyWord, paginate, rootOf, type CaptionWord } from '../src/motion-captions.js';

const w = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const VOICE = [
  w('Ce', 0, 0.18), w('week-end', 0.18, 0.62), w('seulement,', 0.62, 1.15),
  w('profitez', 1.4, 1.85), w('de', 1.85, 1.95), w('-20%', 1.95, 2.6), w('sur', 2.7, 2.85), w('tous', 2.85, 3.1), w('nos', 3.1, 3.3), w('forfaits.', 3.3, 3.95),
  w('Seulement', 4.8, 5.2), w('15 000', 5.2, 5.6), w('FCFA', 5.6, 6),
];
const ROOT = '<div id="root" data-composition-id="main" data-start="0" data-duration="8" data-width="1080" data-height="1920" data-no-timeline>';

describe('captions', () => {
  it('finds the voice: an <audio>, or a <video> that keeps its sound, never a remote one', () => {
    expect(findVoice('<video class="clip" src="assets/b.mp4" muted data-start="0"></video><audio class="clip" id="v" src="assets/voix.mp3" data-start="1.5"></audio>')).toEqual({ src: 'assets/voix.mp3', at: 1.5 });
    expect(findVoice('<video class="clip" src="assets/film.mp4" data-has-audio="true"></video>')).toEqual({ src: 'assets/film.mp4', at: 0 });
    expect(findVoice('<audio src="https://x.test/a.mp3"></audio><video src="a.mp4" muted></video>')).toBeNull();
  });

  it('reads the root', () => {
    expect(rootOf(ROOT)).toEqual({ width: 1080, height: 1920, duration: 8 });
    expect(rootOf('<div data-composition-id="main" data-width="1080">')).toBeNull();
  });

  it('cuts two lines a page, and a new page at a sentence end or a pause', () => {
    const pages = paginate(VOICE, 22);
    expect(pages.map((p) => p.lines.map((l) => l.map((i) => VOICE[i].text).join(' ')))).toEqual([
      ['Ce week-end seulement,', 'profitez de -20% sur'],
      ['tous nos forfaits.'],
      ['Seulement 15 000 FCFA'],
    ]);
    // Each page until the next one, or half a second after its last word.
    expect(pages.map((p) => [p.start, p.end])).toEqual([[0, 2.85], [2.85, 4.45], [4.8, 6.5]]);
    // A long pause breaks a page even mid-sentence.
    expect(paginate([w('Bonjour', 0, 0.4), w('et', 1.5, 1.6), w('bienvenue', 1.6, 2)], 22).map((p) => p.lines.length)).toEqual([1, 1]);
  });

  it('keeps figures, prices and the brand name highlighted', () => {
    for (const k of ['-20%', '15 000', 'FCFA', 'FCFA !', '2026.', 'Wendé,']) expect(isKeyWord(k, 'Wendé Shop')).toBe(true);
    for (const k of ['profitez', 'Shopping', 'de']) expect(isKeyWord(k, 'Wendé Shop')).toBe(false);
  });

  it('lays one clip over the video, offset by the voice start, cut at the end', () => {
    const block = captionsBlock({ audio: 'assets/voix.mp3', at: 2.5, position: 'bottom', words: VOICE }, { width: 1080, height: 1920, duration: 8, brandName: '' });
    expect(block.startsWith(CAPTIONS_START) && block.endsWith(CAPTIONS_END)).toBe(true);
    expect(block).toContain('<div id="baarali-captions" class="clip" data-start="0" data-duration="8" data-track-index="90">');
    expect(block).toContain('bottom:17cqh');
    expect(block).toContain('<span class="bc-w bc-key" id="bc-w5">-20%</span>');
    const timing = JSON.parse(/var T = (\{.*\});/.exec(block)![1]) as { d: number; pages: number[][]; words: number[][] };
    // 2.5 s later; « Seulement 15 000 FCFA » starts at 7.3 s and is cut at 8 s.
    expect(timing.words[0]).toEqual([2.5, 2.68]);
    // « FCFA » would start at 8.1 s: after the end, left out.
    expect(timing.words.at(-1)).toEqual([7.7, 8]);
    expect(timing.words).toHaveLength(12);
    expect(timing.pages.at(-1)).toEqual([7.3, 8]);
    expect(/gsap/i.test(block)).toBe(false);
  });

  it('escapes what the words say', () => {
    const block = captionsBlock({ audio: 'a.mp3', at: 0, position: 'top', words: [w('<script>x</script>', 0, 1)] }, { width: 1920, height: 1080, duration: 3, brandName: '' });
    expect(block).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(block).toContain('top:11cqh');
  });

  it('puts the layer inside the root, and replaces it the next time', () => {
    const page = `<html><body>\n${ROOT}\n  <section class="clip scene" id="s1"></section>\n</div>\n<script>hf()</script>\n</body></html>`;
    const once = injectCaptions(page, `${CAPTIONS_START}A${CAPTIONS_END}`);
    expect(once).toContain(`<section class="clip scene" id="s1"></section>\n${CAPTIONS_START}A${CAPTIONS_END}\n</div>\n<script>hf()</script>`);
    const twice = injectCaptions(once, `${CAPTIONS_START}B${CAPTIONS_END}`);
    expect(twice).toContain(`${CAPTIONS_START}B${CAPTIONS_END}`);
    expect(twice).not.toContain('A<!--');
    expect(twice.split(CAPTIONS_START)).toHaveLength(2);
  });
});
