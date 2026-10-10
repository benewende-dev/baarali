import { PDFDocument, rgb } from 'pdf-lib';

// Posters (step 3 « affiches », decided 10/10/2026): the same composition as
// a still. On a screen format, PNGs at the frame's own size. On paper (the
// root says data-print-mm="297x420"), a PDF for the printer: vector, at the
// true size, the page carrying the bleed, crop marks around it; and PNGs at
// 300 dpi cut to the trim, for a print shop that wants an image.

export const MAX_PAGES = 4;
export const PRINT_DPI = 300;
/** Room around the bleed for the crop marks. */
export const SLUG_MM = 10;
const PT_PER_MM = 72 / 25.4;
const PX_PER_MM = 96 / 25.4;

/** The trim size of a data-print-mm value, within reason (a card to a large poster). */
export function trimSize(raw: string | undefined | null): [number, number] | null {
  const m = /^(\d{2,4}(?:\.\d+)?)x(\d{2,4}(?:\.\d+)?)$/.exec(raw ?? '');
  if (!m) return null;
  const size: [number, number] = [Number(m[1]), Number(m[2])];
  return size.every((n) => n >= 20 && n <= 1200) ? size : null;
}

/** The root's data-print-mm, or null: a screen format. */
export function printOf(html: string): [number, number] | null {
  const root = /<[a-z]+\b[^>]*\bdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] ?? '';
  return trimSize(/\bdata-print-mm\s*=\s*["']?([\d.x]+)/i.exec(root)?.[1]);
}

/** The bleed on each side, in mm, from the page in pixels and the trim; null when the page is smaller than the trim. */
export function bleedOf(widthPx: number, heightPx: number, trim: [number, number]): number | null {
  const bx = (widthPx / PX_PER_MM - trim[0]) / 2;
  const by = (heightPx / PX_PER_MM - trim[1]) / 2;
  const bleed = Math.min(bx, by);
  return bleed >= -0.5 && bleed <= 10 ? Math.max(0, bleed) : null;
}

/** Where the 300 dpi image is cut to the trim: [width, height, x, y] in its pixels. */
export function trimCrop(imgW: number, imgH: number, trim: [number, number], dpi = PRINT_DPI): [number, number, number, number] {
  const w = Math.min(imgW, Math.round((trim[0] / 25.4) * dpi));
  const h = Math.min(imgH, Math.round((trim[1] / 25.4) * dpi));
  return [w, h, Math.floor((imgW - w) / 2), Math.floor((imgH - h) / 2)];
}

/**
 * The printer's PDF: each page (Chrome's PDF of the full bleed page) placed
 * on a sheet with room for crop marks, its TrimBox and BleedBox set, and a
 * pair of thin marks at each corner of the trim, starting outside the bleed.
 */
export async function printPdf(pages: Buffer[], trim: [number, number], bleed: number, title: string): Promise<Buffer> {
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('Baarali Studio Motion');
  out.setProducer('Baarali');
  const [tw, th] = trim.map((v) => v * PT_PER_MM);
  const b = bleed * PT_PER_MM;
  const slug = SLUG_MM * PT_PER_MM;
  const gap = Math.max(b, 2 * PT_PER_MM);
  const len = 6 * PT_PER_MM;
  const ink = rgb(0, 0, 0);
  for (const bytes of pages) {
    const src = await PDFDocument.load(bytes);
    const [art] = await out.embedPdf(src, [0]);
    const page = out.addPage([tw + 2 * (b + slug), th + 2 * (b + slug)]);
    page.drawPage(art, { x: slug, y: slug, width: tw + 2 * b, height: th + 2 * b });
    page.setBleedBox(slug, slug, tw + 2 * b, th + 2 * b);
    page.setTrimBox(slug + b, slug + b, tw, th);
    const x0 = slug + b, x1 = x0 + tw, y0 = slug + b, y1 = y0 + th;
    for (const [x, sx] of [[x0, -1], [x1, 1]] as const) {
      for (const [y, sy] of [[y0, -1], [y1, 1]] as const) {
        page.drawLine({ start: { x: x + sx * gap, y }, end: { x: x + sx * (gap + len), y }, thickness: 0.25, color: ink });
        page.drawLine({ start: { x, y: y + sy * gap }, end: { x, y: y + sy * (gap + len) }, thickness: 0.25, color: ink });
      }
    }
  }
  return Buffer.from(await out.save());
}
