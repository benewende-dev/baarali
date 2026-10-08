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

  it('turns a title into a folder name', () => {
    expect(projectSlug('Promo Week-end : -20 % !')).toBe('promo-week-end-20');
    expect(projectSlug('…')).toBe('motion');
  });
});
