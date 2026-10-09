import { describe, expect, it } from 'vitest';
import { findVoice, type CaptionWord } from '../src/motion-captions.js';
import { audioClips, duckLane, fittedLane, isMusic, speechSpans, withLane } from '../src/motion-mix.js';

const w = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const PAGE =
  '<audio id="musique" class="clip" src="assets/afro-beat.mp3" data-start="0" data-duration="10" data-track-index="6" data-volume="0.8"></audio>\n' +
  '<audio id="voix" class="clip" src="assets/voix.mp3" data-start="1.5" data-duration="6" data-track-index="5"></audio>\n' +
  '<video id="bg" class="clip" src="assets/b.mp4" muted data-start="0"></video>';

describe('mix', () => {
  it('reads the sound clips and tells the music from the voice', () => {
    const clips = audioClips(PAGE);
    expect(clips.map((c) => [c.id, c.start, c.duration, c.volume, c.automated])).toEqual([
      ['musique', 0, 10, 0.8, false],
      ['voix', 1.5, 6, null, false],
    ]);
    expect(clips.map(isMusic)).toEqual([true, false]);
    for (const src of ['assets/bed.mp3', 'assets/musique-fond.mp3', 'assets/bgm2.wav', 'assets/Instrumental.m4a']) expect(isMusic({ id: null, src, kind: 'audio' })).toBe(true);
    for (const src of ['assets/voix.mp3', 'assets/fondateur.mp3', 'assets/narration.wav']) expect(isMusic({ id: null, src, kind: 'audio' })).toBe(false);
    // A clip named voice wins over a first clip named neither.
    expect(findVoice(`<audio id="sfx" src="assets/whoosh.mp3"></audio>${PAGE}`)).toMatchObject({ id: 'voix' });
    expect(findVoice('<audio id="sfx" src="assets/whoosh.mp3"></audio>')).toMatchObject({ id: 'sfx' });
    // The music came first: the voice is still the voice.
    expect(findVoice(PAGE)).toEqual({ src: 'assets/voix.mp3', at: 1.5, id: 'voix' });
    expect(findVoice(PAGE, 'musique')).toEqual({ src: 'assets/afro-beat.mp3', at: 0, id: 'musique' });
  });

  it('makes passages of words, without pumping between sentences', () => {
    const words = [w('Ce', 0, 0.2), w('week-end.', 0.2, 0.8), w('Profitez', 1.6, 2), w('vite.', 2, 2.4), w('Merci.', 5, 5.5)];
    // 0.8 s between the sentences: one passage; 2.6 s of silence: another.
    expect(speechSpans(words, 1)).toEqual([[1, 3.4], [6, 6.5]]);
  });

  it('lowers the music under each passage, with ramps and fades', () => {
    const o = { clipStart: 0, clipDuration: 10, level: 0.8, underVoice: 0.25, fadeIn: 0.2, fadeOut: 1.5 };
    expect(duckLane([[2, 4]], o)).toEqual([
      { t: 0, v: 0 }, { t: 0.2, v: 0.8 }, { t: 1.7, v: 0.8 }, { t: 2, v: 0.2 }, { t: 4, v: 0.2 }, { t: 4.8, v: 0.8 }, { t: 8.5, v: 0.8 }, { t: 10, v: 0 },
    ]);
    // In clip time: a music starting at 1 s comes down at 1 s into the clip.
    expect(duckLane([[2, 4]], { ...o, clipStart: 1 }).slice(2, 6)).toEqual([{ t: 0.7, v: 0.8 }, { t: 1, v: 0.2 }, { t: 3, v: 0.2 }, { t: 3.8, v: 0.8 }]);
    // A voice to the very end: the fade starts from the lowered level.
    expect(duckLane([[5, 10]], o).slice(-2)).toEqual([{ t: 8.5, v: 0.2 }, { t: 10, v: 0 }]);
  });

  it('stays within the 512 points HyperFrames reads', () => {
    // 5 minutes of short phrases, 1.5 s apart.
    const words = Array.from({ length: 200 }, (_, i) => w('mot', i * 1.5, i * 1.5 + 0.2));
    const lane = fittedLane(words, 0, { clipStart: 0, clipDuration: 300, level: 1, underVoice: 0.25, fadeIn: 0.2, fadeOut: 1.5 });
    expect(lane.length).toBeLessThanOrEqual(512);
    expect(lane.length).toBeGreaterThan(4);
  });

  it('writes the lane on the music tag, in place of an earlier one', () => {
    const music = audioClips(PAGE)[0];
    const once = withLane(PAGE, music, [{ t: 0, v: 0.8 }, { t: 1, v: 0.2 }], 0.7);
    const tag = /<audio id="musique"[^>]*>/.exec(once)![0];
    expect(tag).toContain('data-volume="0.7"');
    expect(tag).not.toContain('data-volume="0.8"');
    const lane = JSON.parse(/data-automation='([^']*)'/.exec(tag)![1]);
    expect(lane).toEqual({ version: 1, lanes: [{ target: 'volume', points: [{ t: 0, v: 0.8 }, { t: 1, v: 0.2 }] }] });
    const again = withLane(once, audioClips(once)[0], [{ t: 0, v: 1 }], 1);
    expect(again.match(/data-automation=/g)).toHaveLength(1);
    expect(again.match(/data-volume=/g)).toHaveLength(1);
    expect(audioClips(again)[0].automated).toBe(true);
    // The rest of the page is untouched.
    expect(again.slice(again.indexOf('<audio id="voix"'))).toBe(PAGE.slice(PAGE.indexOf('<audio id="voix"')));
  });
});
