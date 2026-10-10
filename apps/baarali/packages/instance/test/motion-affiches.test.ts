import { describe, expect, it } from 'vitest';
import { BLEED_MM, compose, DEFAULT_BRAND, FORMATS, PRINT_SIZES, TEMPLATES, type Format } from '../src/motion-templates.js';

const make = (id: string, format: Format, values: Record<string, string> = {}) =>
  compose(id, { format, title: 't', brand: { ...DEFAULT_BRAND, name: 'Faso Events' }, values, logoSrc: null }).html;
const POSTERS = TEMPLATES.filter((t) => t.poster);

describe('the posters (step 3)', () => {
  it('are five, each with a script that parses in every format', () => {
    expect(POSTERS.map((t) => t.id)).toEqual(['affiche-evenement', 'affiche-promo', 'affiche-menu', 'flyer-produit', 'carte-visite']);
    for (const t of POSTERS) {
      for (const f of Object.keys(FORMATS) as Format[]) {
        const html = make(t.id, f, { qr: '+226 70 00 00 00' });
        const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
        expect(() => new Function(script), `${t.id} ${f}`).not.toThrow();
      }
    }
  });

  it('puts paper at its true size plus the bleed, and says so on the root', () => {
    expect(BLEED_MM).toBe(3);
    // A3 + 2 × 3 mm, at 96 px an inch.
    expect(FORMATS.A3).toEqual({ width: 1145, height: 1610 });
    expect(FORMATS.carte).toEqual({ width: 344, height: 231 });
    const a4 = make('affiche-menu', 'A4');
    expect(a4).toContain(`data-print-mm="${PRINT_SIZES.A4.join('x')}"`);
    expect(a4).toContain('--bleed:3mm');
    const status = make('affiche-promo', '9:16');
    expect(status).not.toContain('data-print-mm');
    expect(status).toContain('--bleed:0px');
  });

  it('draws a QR code only for a number or a link, never a made-up one', () => {
    expect(make('affiche-evenement', 'A3')).not.toContain('class="qr"');
    expect(make('affiche-evenement', 'A3', { qr: 'appelez-nous' })).not.toContain('class="qr"');
    expect(make('affiche-evenement', 'A3', { qr: '+226 70 00 00 00' })).toContain('class="qr"');
  });

  it('works out the discount, and gives the card its two sides', () => {
    expect(make('affiche-promo', '9:16', { old: '15 000 F', price: '9 900 F' })).toContain('−34 %');
    expect(make('affiche-promo', '9:16', { old: '', price: '9 900 F' })).not.toContain('pp-stamp"');
    expect(make('carte-visite', 'carte')).toContain('data-poster-at="1.95,3.95"');
  });

  it('keeps each menu section in one column', () => {
    const html = make('affiche-menu', '16:9', { menu: '# Entrées\nA | 1\nB | 2\n# Plats\nC | 3\nD | 4\nE | 5\n# Boissons\nF | 6\nG | 7\nH | 8' });
    expect(html.match(/class="am-col"/g)).toHaveLength(2);
    expect(html).toContain('Boissons');
  });
});
