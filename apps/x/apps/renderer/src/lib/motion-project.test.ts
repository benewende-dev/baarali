import { describe, expect, it } from 'vitest'
import { laneValue, motionProject, motionProjectName, previewDocument, readCaptions, readComposition, siblingFormats, underVoice } from './motion-project'

const LANE = JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: [{ t: 0, v: 0 }, { t: 0.2, v: 0.8 }, { t: 1.7, v: 0.8 }, { t: 2, v: 0.2 }, { t: 4, v: 0.2 }, { t: 4.8, v: 0.8 }, { t: 8.5, v: 0.8 }, { t: 10, v: 0 }] }] })
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pub week-end</title></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1080" data-height="1920" data-no-timeline>
<audio id="musique" class="clip" src="assets/afro.mp3" data-start="0" data-duration="10" data-track-index="6" data-volume="0.8" data-automation='${LANE}'></audio>
<audio id="voix" class="clip" src="assets/voix.mp3" data-start="1.5" data-duration="6" data-track-index="5"></audio>
<video id="bg" class="clip" src="assets/b.mp4" muted data-start="0" data-duration="10" data-track-index="0"></video>
<section id="s-offre" class="clip scene" data-start="3.5" data-duration="4" data-track-index="2"></section>
<section id="s-hook" class="clip scene" data-start="0" data-duration="3.6" data-track-index="1"></section>
<section id="s-cta" class="clip scene" data-start="7.5" data-duration="5" data-track-index="3"></section>
</div></body></html>`

describe('motion project', () => {
  it('knows a project by its index.html', () => {
    expect(motionProject('motion/pub-week-end/index.html')).toBe('motion/pub-week-end')
    for (const p of ['motion/pub/assets/index.html', 'notes/index.html', 'motion/index.html']) expect(motionProject(p)).toBeNull()
    expect(motionProjectName('/data/motion/pub-week-end/index.html')).toBe('pub-week-end')
    expect(motionProjectName('motion/pub/exports/pub.mp4')).toBeNull()
  })

  it('reads the size, the scenes in time order, the voice and the music with its lane', () => {
    const c = readComposition(PAGE)!
    expect(c).toMatchObject({ title: 'Pub week-end', width: 1080, height: 1920, duration: 10 })
    expect(c.scenes).toEqual([{ id: 's-hook', start: 0, end: 3.6 }, { id: 's-offre', start: 3.5, end: 7.5 }, { id: 's-cta', start: 7.5, end: 10 }])
    expect(c.voice).toEqual({ id: 'voix', start: 1.5, end: 7.5 })
    expect(c.music).toMatchObject({ id: 'musique', start: 0, end: 10, level: 0.8 })
    expect(c.music!.lane).toHaveLength(8)
    expect(underVoice(c.music!)).toBe(0.25)
    expect(laneValue(c.music!.lane!, 1.85)).toBeCloseTo(0.5)
    expect(laneValue(c.music!.lane!, 12)).toBe(0)
    expect(readComposition('<div data-composition-id="main" data-width="1080">')).toBeNull()
  })

  it('cuts the captions into lines and the voice into passages', () => {
    const json = JSON.stringify({ audio: 'assets/voix.mp3', at: 1, position: 'bottom', words: [
      { text: 'Ce', start: 0, end: 0.2 }, { text: 'week-end.', start: 0.2, end: 0.8 },
      { text: 'Profitez', start: 1.6, end: 2 }, { text: 'vite', start: 2, end: 2.4 },
      { text: 'Merci.', start: 5, end: 5.5 },
    ] })
    expect(readCaptions(json)).toEqual({
      pages: [{ start: 1, end: 1.8, text: 'Ce week-end.' }, { start: 2.6, end: 3.4, text: 'Profitez vite' }, { start: 6, end: 6.5, text: 'Merci.' }],
      spans: [[1, 3.4], [6, 6.5]],
    })
    expect(readCaptions('{')).toEqual({ pages: [], spans: [] })
  })

  it('gives the player the page with its base and the runtime, the project untouched', () => {
    const doc = previewDocument(PAGE, 'app://workspace/motion/pub/', 'app://-/assets/runtime.js')
    expect(doc).toContain('<head><base href="app://workspace/motion/pub/"><script data-hyperframes-preview-runtime src="app://-/assets/runtime.js"></script><meta charset="utf-8">')
    expect(doc.replace('<base href="app://workspace/motion/pub/"><script data-hyperframes-preview-runtime src="app://-/assets/runtime.js"></script>', '')).toBe(PAGE)
    expect(previewDocument('<audio src="a.mp3">', 'b/', 'r.js')).toBe('<base href="b/"><script data-hyperframes-preview-runtime src="r.js"></script><audio src="a.mp3">')
  })

  it('finds the other formats of a project', () => {
    expect(siblingFormats('motion/pub-1x1', ['pub', 'pub-1x1', 'pub-16x9', 'autre'])).toEqual([
      { ratio: '9:16', project: 'motion/pub' }, { ratio: '1:1', project: 'motion/pub-1x1' }, { ratio: '16:9', project: 'motion/pub-16x9' },
    ])
    expect(siblingFormats('motion/affiche-A3', ['affiche', 'affiche-A3', 'affiche-carte'])).toEqual([
      { ratio: '9:16', project: 'motion/affiche' }, { ratio: 'A3', project: 'motion/affiche-A3' }, { ratio: 'carte', project: 'motion/affiche-carte' },
    ])
  })
})
