import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkComposition, createMotionTools, projectSlug } from '../src/motion-mcp.js';
import { FORMATS, TEMPLATES } from '../src/motion-templates.js';

async function setup() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-motion-'));
  return { workDir, tools: createMotionTools({ workDir, now: () => Date.UTC(2026, 9, 8) }) };
}
const textOf = (r: { content: Array<{ text: string }> }) => r.content[0].text;

describe('motion tools', () => {
  it('lists the eight templates with their slots', async () => {
    const { tools } = await setup();
    const out = textOf(await tools.run('list_templates', {}));
    for (const t of TEMPLATES) expect(out).toContain(`- ${t.id} — ${t.name}`);
    expect(TEMPLATES).toHaveLength(8);
  });

  it('makes every template in every format, and each passes the check', async () => {
    const { tools, workDir } = await setup();
    for (const t of TEMPLATES) {
      for (const format of Object.keys(FORMATS)) {
        const r = await tools.run('new_project', { template: t.id, title: `${t.name} ${format}`, format });
        expect(r.isError, textOf(r)).toBeUndefined();
        const rel = /Created (\S+)\/index\.html/.exec(textOf(r))![1];
        const html = await fs.readFile(path.join(workDir, rel, 'index.html'), 'utf8');
        const { width, height } = FORMATS[format as keyof typeof FORMATS];
        expect(html).toContain(`data-width="${width}" data-height="${height}"`);
        expect(html).not.toMatch(/gsap\./i);
        expect(await checkComposition(html, path.join(workDir, rel)), `${t.id} ${format}`).toEqual([]);
      }
    }
  });

  it('fills the slots, escapes them, and says which kept the example', async () => {
    const { tools, workDir } = await setup();
    const r = await tools.run('new_project', { template: 'annonce-choc', title: 'Promo week-end', values: { hook: 'Ce week-end <seulement>', big: '-20%' } });
    expect(textOf(r)).toContain('Created motion/promo-week-end/index.html — Annonce choc, 9:16 (1080×1920), 10 s.');
    expect(textOf(r)).toContain('kept the template\'s example text: sub, points, cta, until');
    const html = await fs.readFile(path.join(workDir, 'motion/promo-week-end/index.html'), 'utf8');
    expect(html).toContain('<span class="w">&lt;seulement&gt;</span>');
    expect(html).toContain('>-20%<');
    // A second one with the same title gets its own folder.
    expect(textOf(await tools.run('new_project', { template: 'annonce-choc', title: 'Promo week-end' }))).toContain('motion/promo-week-end-2/');
  });

  it('keeps the brand kit, refuses bad values, and carries the logo into the project', async () => {
    const { tools, workDir } = await setup();
    expect(textOf(await tools.run('brand_kit', {}))).toContain('No brand yet');
    expect((await tools.run('brand_kit', { set: { colors: { accent: 'blue' } } })).isError).toBe(true);
    expect((await tools.run('brand_kit', { set: { logo: '../etc/passwd' } })).isError).toBe(true);
    await fs.mkdir(path.join(workDir, 'files'), { recursive: true });
    await fs.writeFile(path.join(workDir, 'files/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const saved = await tools.run('brand_kit', { set: { name: 'Sahel Net', logo: 'files/logo.svg', colors: { accent: '#00A86B' }, tone: 'premium' } });
    expect(saved.isError).toBeUndefined();
    const brand = JSON.parse(await fs.readFile(path.join(workDir, 'config/brand.json'), 'utf8'));
    expect(brand).toMatchObject({ name: 'Sahel Net', logo: 'files/logo.svg', colors: { accent: '#00a86b', highlight: '#ffbe3c' }, tone: 'premium' });
    await tools.run('new_project', { template: 'logo-anime', title: 'Intro' });
    const html = await fs.readFile(path.join(workDir, 'motion/intro/index.html'), 'utf8');
    expect(html).toContain('src="assets/logo.svg"');
    expect(html).toContain('--accent:#00a86b');
    await expect(fs.access(path.join(workDir, 'motion/intro/assets/logo.svg'))).resolves.toBeUndefined();
  });

  it('keeps the other brand colours and warns about hard-to-read pairs', async () => {
    const { tools, workDir } = await setup();
    expect((await tools.run('brand_kit', { set: { palette: ['#123456', 'red'] } })).isError).toBe(true);
    expect((await tools.run('brand_kit', { set: { palette: Array(7).fill('#123456') } })).isError).toBe(true);
    const saved = textOf(await tools.run('brand_kit', { set: { colors: { background: '#ffffff', ink: '#dddddd', accent: '#ffd400' }, palette: ['#E4002B', '#0057B8'] } }));
    expect(saved).toContain('under 4.5:1');
    expect(saved).toContain('the highlight #ffbe3c on the background #ffffff');
    await tools.run('new_project', { template: 'chiffres-cles', title: 'Chiffres', values: { items: 'A : 1\nB : 2\nC : 3' } });
    const html = await fs.readFile(path.join(workDir, 'motion/chiffres/index.html'), 'utf8');
    expect(html).toContain('--brand-1:#e4002b;--brand-2:#0057b8');
    // Near-black on a yellow accent, and one colour per figure.
    expect(html).toContain('--on-accent:#111111');
    expect(html).toContain('background:#ffd400"');
    expect(html).toContain('background:#e4002b"');
    expect(html).toContain('background:#0057b8"');
  });

  it('makes the other formats of a project as siblings', async () => {
    const { tools, workDir } = await setup();
    await tools.run('new_project', { template: 'infographie', title: 'Avis clients', values: { percent: '68' } });
    const r = await tools.run('reformat', { project: 'motion/avis-clients', format: '16:9' });
    expect(textOf(r)).toContain('Created motion/avis-clients-16x9/index.html in 16:9.');
    const html = await fs.readFile(path.join(workDir, 'motion/avis-clients-16x9/index.html'), 'utf8');
    expect(html).toContain('data-width="1920" data-height="1080"');
    expect(html).toContain('--to:68');
    expect((await tools.run('reformat', { project: '../../etc', format: '1:1' })).isError).toBe(true);
  });

  it('flags GSAP, a missing file, an untimed clip and a missing duration', async () => {
    const { workDir } = await setup();
    const bad = `<div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-no-timeline>
      <section class="clip" id="a" data-start="0">x</section><img class="clip" id="b" data-start="0" data-duration="1" data-track-index="1" src="assets/none.png">
      </div><script src="https://cdn.jsdelivr.net/npm/gsap"></script>`;
    const codes = (await checkComposition(bad, workDir)).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['root_duration', 'gsap_not_allowed', 'clip_timing', 'missing_media']));
  });

  it('exports a project through the control plane and saves the file beside it', async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-motion-'));
    const seen: Array<{ url: string; init: RequestInit }> = [];
    let polls = 0;
    let now = 0;
    const tools = createMotionTools({
      workDir,
      now: () => now,
      control: {
        url: 'https://c.test',
        token: 'tok',
        sleep: async (ms) => void (now += ms),
        fetch: (async (url: string, init: RequestInit = {}) => {
          seen.push({ url: String(url), init });
          if (url.includes('/renders?')) return Response.json({ id: 'mr_1', included_seconds: 10, credits: 0, allowance: { used_seconds: 70, total_seconds: 1800 } }, { status: 202 });
          if (url.endsWith('/file')) return new Response('MP4DATA');
          if (url.includes('/renders/mr_1')) return Response.json(++polls < 3 ? { status: 'rendering', progress: 0.5 } : { status: 'done' });
          return Response.json({}, { status: 404 });
        }) as typeof fetch,
      },
    });
    await tools.run('new_project', { template: 'annonce-choc', title: 'Promo' });
    await fs.mkdir(path.join(workDir, 'motion/promo/exports'), { recursive: true });
    await fs.writeFile(path.join(workDir, 'motion/promo/exports/old.mp4'), 'OLD');
    await fs.writeFile(path.join(workDir, 'motion/promo/assets/clip.mp4'), 'CLIP');
    const out = textOf(await tools.run('render', { project: 'motion/promo', format: 'mp4-light' }));
    expect(out).toContain('Export mr_1 started (0.2 min from the plan');
    expect(out).toContain('Exported: motion/promo/exports/promo-mp4-light.mp4.');
    expect(await fs.readFile(path.join(workDir, 'motion/promo/exports/promo-mp4-light.mp4'), 'utf8')).toBe('MP4DATA');
    const post = seen[0];
    expect(post.url).toBe('https://c.test/v1/motion/renders?format=mp4-light&fps=30&seconds=10');
    expect(post.init.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'application/json' });
    // The folder without its exports nor project.json.
    const sent = (JSON.parse(post.init.body as string).files as Array<{ path: string }>).map((f) => f.path).sort();
    expect(sent).toEqual(['assets/clip.mp4', 'index.html']);
  });

  it('says when an export waits, fails, or cannot be paid', async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-motion-'));
    let now = 0;
    let answer: Response = Response.json({});
    let status: Record<string, unknown> = { status: 'rendering', progress: 0.25 };
    let fileAnswer = () => new Response('GIF');
    const tools = createMotionTools({
      workDir,
      now: () => now,
      control: {
        url: 'https://c.test',
        token: 'tok',
        sleep: async (ms) => void (now += ms),
        fetch: (async (url: string) => (url.includes('/renders?') ? answer : url.endsWith('/file') ? fileAnswer() : Response.json(status))) as typeof fetch,
      },
    });
    await tools.run('new_project', { template: 'logo-anime', title: 'Intro' });
    answer = Response.json({ error: { code: 'insufficient_media_credits', cost: 4, balance: 1, allowance: { used_seconds: 120, total_seconds: 120, resets_at: '2026-11-01T00:00:00.000Z' } } }, { status: 402 });
    const unpaid = await tools.run('render', { project: 'motion/intro' });
    expect(unpaid.isError).toBe(true);
    expect(textOf(unpaid)).toContain('used up (2 min of 2 min, back on 2026-11-01) and this export costs 4 media credits; the balance is 1');
    answer = Response.json({ id: 'mr_2', included_seconds: 6, credits: 0, allowance: { period: 'week', used_seconds: 66, total_seconds: 180 } }, { status: 202 });
    const waiting = textOf(await tools.run('render', { project: 'motion/intro', format: 'gif' }));
    expect(waiting).toContain('1.1 min of 3 min used this week');
    expect(waiting).toContain('Still rendering (25 %). Do not call render again: it would export twice. Call render_status with id mr_2 and project motion/intro and format gif.');
    status = { status: 'failed', error: 'GSAP is not allowed' };
    const failed = await tools.run('render_status', { id: 'mr_2', project: 'motion/intro', format: 'gif' });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toContain('The export failed: GSAP is not allowed. Its minutes and credits were given back.');
    // Finished, but the render machine stopped before the file was fetched: refunded.
    status = { status: 'done' };
    fileAnswer = () => Response.json({ error: { code: 'lost' } }, { status: 410 });
    const lost = await tools.run('render_status', { id: 'mr_2', project: 'motion/intro', format: 'gif' });
    expect(lost.isError).toBe(true);
    expect(textOf(lost)).toContain('was lost before it reached the workspace. It was refunded, minutes and credits: render it again, at no extra cost.');
    // An error found by check stops the export before anything is sent.
    await fs.writeFile(path.join(workDir, 'motion/intro/index.html'), '<div>no root</div>');
    expect(textOf(await tools.run('render', { project: 'motion/intro' }))).toContain('Not exported: fix these first.');
    const offline = createMotionTools({ workDir, now: () => 0 });
    expect(textOf(await offline.run('render', { project: 'motion/intro' }))).toBe('Video export is not available here.');
  });

  it('refuses media outside the project folder', async () => {
    const { workDir } = await setup();
    const dir = path.join(workDir, 'motion/p');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(workDir, 'clip.mp4'), 'x');
    const html = '<div id="root" data-composition-id="main" data-start="0" data-duration="3" data-width="1080" data-height="1920" data-no-timeline><video class="clip" id="v" data-start="0" data-duration="3" data-track-index="1" muted src="../../clip.mp4"></video></div>';
    expect((await checkComposition(html, dir)).map((f) => f.code)).toContain('media_outside_project');
  });

  it('turns a title into a folder name', () => {
    expect(projectSlug('Promo Week-end : -20 % !')).toBe('promo-week-end-20');
    expect(projectSlug('…')).toBe('motion');
  });
});

describe('captions tool', () => {
  async function captioned() {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-motion-'));
    const calls: Array<{ url: string; type: string; bytes: number }> = [];
    let answer = () =>
      Response.json({ transcript: 'x', words: [{ text: 'Livraison', start: 0.2, end: 0.7 }, { text: 'offerte', start: 0.7, end: 1.1 }, { text: 'à', start: 1.1, end: 1.2 }, { text: 'Ouaga.', start: 1.2, end: 1.8 }] });
    const tools = createMotionTools({
      workDir,
      now: () => 0,
      control: {
        url: 'https://c.test',
        token: 'tok',
        sleep: async () => {},
        fetch: (async (url: string, init: RequestInit = {}) => {
          calls.push({ url: String(url), type: (init.headers as Record<string, string>)['content-type'], bytes: (init.body as Uint8Array).length });
          return answer();
        }) as typeof fetch,
      },
    });
    await tools.run('new_project', { template: 'logo-anime', title: 'Pub' });
    const dir = path.join(workDir, 'motion/pub');
    await fs.writeFile(path.join(dir, 'assets/voix.mp3'), 'VOICE');
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    await fs.writeFile(path.join(dir, 'index.html'), html.replace('data-no-timeline>', 'data-no-timeline>\n  <audio id="voix" class="clip" src="assets/voix.mp3" data-start="0.5" data-duration="3" data-track-index="5"></audio>'));
    return { workDir, dir, tools, calls, setAnswer: (a: () => Response) => (answer = a) };
  }

  it('transcribes the project voice once, lays the captions, and rebuilds them free after a correction', async () => {
    const { dir, tools, calls } = await captioned();
    const out = textOf(await tools.run('captions', { project: 'motion/pub' }));
    expect(out).toContain('Captions added: 4 words over 1.6 s, synced to assets/voix.mp3 (from 0.5 s in the video), bottom.');
    expect(calls).toEqual([{ url: 'https://c.test/v1/voice/transcribe?words=true', type: 'audio/mpeg', bytes: 5 }]);
    const file = JSON.parse(await fs.readFile(path.join(dir, 'captions.json'), 'utf8'));
    expect(file).toMatchObject({ audio: 'assets/voix.mp3', at: 0.5, position: 'bottom' });
    let html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('id="baarali-captions"');
    expect(html).toContain('>Ouaga.</span>');
    expect((await checkComposition(html, dir)).filter((f) => f.severity === 'error')).toEqual([]);

    // The agent corrects a word and moves them up: no new transcription.
    file.words[3].text = 'Ouagadougou.';
    await fs.writeFile(path.join(dir, 'captions.json'), JSON.stringify(file));
    expect(textOf(await tools.run('captions', { project: 'motion/pub', position: 'top' }))).toContain('Captions rebuilt from 4 words');
    expect(calls).toHaveLength(1);
    html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('>Ouagadougou.</span>');
    expect(html).not.toContain('>Ouaga.</span>');
    expect(html).toContain('top:11cqh');
    expect(html.split('id="baarali-captions"')).toHaveLength(2);
  });

  it('says what is missing, and when nothing was heard or the limit is reached', async () => {
    const { dir, tools, setAnswer } = await captioned();
    expect(textOf(await tools.run('captions', { project: 'motion/pub', audio: 'assets/none.mp3' }))).toContain('No file at motion/pub/assets/none.mp3');
    expect(textOf(await tools.run('captions', { project: 'motion/pub', audio: 'assets/voix.flac' }))).toContain('Captions read');
    expect(textOf(await tools.run('captions', { project: 'motion/pub', audio: '../../../etc/passwd' }))).toContain('in the workspace');
    expect(textOf(await tools.run('captions', { project: 'motion/pub', position: 'side' }))).toContain('Position is one of');
    setAnswer(() => Response.json({ transcript: '', words: [] }));
    expect(textOf(await tools.run('captions', { project: 'motion/pub' }))).toContain('No speech was heard');
    setAnswer(() => Response.json({ error: { code: 'quota_reached' } }, { status: 429 }));
    expect(textOf(await tools.run('captions', { project: 'motion/pub' }))).toContain('usage limit of the plan is reached');
    // No voice at all.
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    await fs.writeFile(path.join(dir, 'index.html'), html.replace(/<audio[^>]*><\/audio>/, ''));
    expect(textOf(await tools.run('captions', { project: 'motion/pub' }))).toContain('no voice to caption');
  });
});
