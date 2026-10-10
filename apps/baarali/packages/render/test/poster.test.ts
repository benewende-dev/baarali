import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { bleedOf, printOf, printPdf, SLUG_MM, trimCrop, trimSize } from '../src/poster.js';
import { RenderQueue } from '../src/queue.js';
import { createApp } from '../src/server.js';
import { StillsDesk, type PosterTask } from '../src/stills.js';

const SECRET = 'x'.repeat(40);
const page = (attrs: string, w = 1145, h = 1610) =>
  `<!doctype html><html><body><div id="root" data-composition-id="main" data-start="0" data-duration="4" data-width="${w}" data-height="${h}"${attrs}></div></body></html>`;
const filesOf = (html: string) => [{ path: 'index.html', data: Buffer.from(html).toString('base64') }];
const PT = 72 / 25.4;

describe('posters', () => {
  it('reads the paper from the root, within reason', () => {
    expect(trimSize('297x420')).toEqual([297, 420]);
    expect(trimSize('5x5')).toBeNull();
    expect(trimSize('297x420;')).toBeNull();
    expect(printOf(page(' data-print-mm="297x420"'))).toEqual([297, 420]);
    expect(printOf(page(''))).toBeNull();
    // 1145 px = 302.95 mm: the 3 mm bleed, to the rounding of a pixel.
    expect(bleedOf(1145, 1610, [297, 420])).toBeCloseTo(2.97, 1);
    expect(bleedOf(800, 1100, [297, 420])).toBeNull();
    // A3 at 300 dpi, cut to the trim.
    expect(trimCrop(3578, 5031, [297, 420])).toEqual([3508, 4961, 35, 35]);
  });

  it('puts each page on a sheet with its trim box, bleed box and crop marks', async () => {
    const art = await PDFDocument.create();
    art.addPage([858.75, 1207.5]).drawRectangle({ x: 0, y: 0, width: 100, height: 100 });
    const one = Buffer.from(await art.save());
    const pdf = await PDFDocument.load(await printPdf([one, one], [297, 420], 3, 'Nuit du Faso Jazz'));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe('Nuit du Faso Jazz');
    const p = pdf.getPage(0);
    expect(p.getWidth()).toBeCloseTo((297 + 2 * (3 + SLUG_MM)) * PT, 3);
    const trim = p.getTrimBox();
    expect([trim.x, trim.width, trim.height].map((n) => +(n / PT).toFixed(2))).toEqual([13, 297, 420]);
    expect(p.getBleedBox().width / PT).toBeCloseTo(303, 3);
    expect(p.node.get(PDFName.of('TrimBox'))).toBeDefined();
  });

  it('answers PNGs on a screen, and the PDF on paper, one request at a time', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'poster-'));
    const tasks: PosterTask[] = [];
    const desk = new StillsDesk({
      root,
      stiller: async () => [],
      poster: async (task) => {
        tasks.push(task);
        return { pngs: task.times.map((t) => Buffer.from(`png@${t}`)), pdf: task.print ? Buffer.from('%PDF') : null };
      },
    });
    const queue = new RenderQueue({ root, renderer: async () => {}, concurrency: 1, ttlMs: 1000, now: Date.now });
    const app = createApp({ queue, secret: SECRET, stills: desk });
    const post = (html: string, times: string, auth = SECRET) =>
      app.request(`/poster?times=${times}&title=Test`, { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ files: filesOf(html) }) });

    expect((await post(page(''), '3.9', 'nope'.repeat(10))).status).toBe(401);
    const screen = await (await post(page('', 1080, 1920), '3.9')).json();
    expect(screen).toEqual({ pngs: [{ t: 3.9, data: Buffer.from('png@3.9').toString('base64') }], pdf: null });
    expect(tasks[0].print).toBeNull();

    const paper = await (await post(page(' data-print-mm="297x420"'), '1.95,3.95')).json();
    expect(paper.pngs).toHaveLength(2);
    expect(Buffer.from(paper.pdf, 'base64').toString()).toBe('%PDF');
    expect(tasks[1]).toMatchObject({ width: 1145, height: 1610, times: [59 / 30, 119 / 30], title: 'Test' });
    expect(tasks[1].print!.trim).toEqual([297, 420]);

    expect((await post(page(' data-print-mm="297x420"', 600, 800), '1')).status).toBe(400);
    expect((await post(page(''), '1,2,3,3.5,3.8')).status).toBe(200);
    expect(tasks.at(-1)!.times).toHaveLength(4);
    expect(await fs.readdir(root)).toEqual([]);
  });
});
