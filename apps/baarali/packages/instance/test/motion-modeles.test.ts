import { describe, expect, it } from 'vitest';
import { compose, DEFAULT_BRAND, FORMATS, TEMPLATES, type Format } from '../src/motion-templates.js';

const make = (id: string, values: Record<string, string> = {}, format: Format = '9:16') =>
  compose(id, { format, title: 'T', brand: { ...DEFAULT_BRAND, name: 'Boutique Awa' }, values, logoSrc: null });
const script = (html: string) => /<script>([^]*)<\/script>/.exec(html)![1];

describe('the commerce templates (catalogue, menu, event, tutorial, mobile money)', () => {
  it('give every template a script that parses, in every format', () => {
    for (const t of TEMPLATES) for (const f of Object.keys(FORMATS) as Format[]) {
      expect(() => new Function(script(make(t.id, {}, f).html)), `${t.id} ${f}`).not.toThrow();
    }
  });

  it('times the carousel by its products, one swipe each', () => {
    const three = make('catalogue', { products: 'A | 1 F\nB | 2 F\nC | 3 F' });
    const eight = make('catalogue', { products: Array.from({ length: 9 }, (_, i) => `P${i} | ${i} F`).join('\n') });
    expect(eight.duration - three.duration).toBeCloseTo(5 * 2);
    expect(eight.html.match(/class="ca-card"/g)).toHaveLength(8);
    expect(eight.html.match(/class="ca-tile"/g)).toHaveLength(8);
  });

  it('keeps each menu section whole, and leaves out an empty dish of the day', () => {
    const { html, duration } = make('menu', { menu: '# Plats\nRiz | 1 500\n# Boissons\nBissap | 300', special: '' });
    expect(html.match(/class="mn-group"/g)).toHaveLength(2);
    expect(html).not.toContain('id="mn-special"');
    expect(make('menu').duration).toBeGreaterThan(duration);
  });

  it('cuts the date into its calendar page, or keeps it whole', () => {
    expect(make('evenement', { date: '1er mai' }).html).toContain('<small>mai</small><b>1</b>');
    expect(make('evenement', { date: 'Ce week-end' }).html).toContain('<small>Ce week-end</small><span>');
  });

  it('counts the tutorial’s steps unless told otherwise', () => {
    const { html } = make('tutoriel', { steps: 'Un | a\nDeux | b\nTrois | c\nQuatre | d' });
    expect(html).toContain('En 4 étapes');
    expect(html.match(/<li><b>/g)).toHaveLength(4);
    expect(make('tutoriel', { kicker: 'Recette' }).html).not.toContain('En 3 étapes');
  });

  it('dials a code key by key, opens the app otherwise, and never shows a secret code', () => {
    const { html } = make('paiement-mobile', { operators: 'Orange Money | *144# | 70 00 00 00\nWave | appli | 77 00 00 00' });
    expect(html).toContain("kit.type('#pm-code0', \"*144#\"");
    expect(html).toContain('Ouvrez l’appli Wave');
    expect(html.match(/class="pm-keys"/g)).toHaveLength(1);
    expect(html).toContain('<div class="pm-pin"><i></i><i></i><i></i><i></i></div>');
    expect(html).not.toMatch(/<img/);
  });
});
