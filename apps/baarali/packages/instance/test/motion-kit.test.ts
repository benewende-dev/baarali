import { describe, expect, it } from 'vitest';
import { EASES, KIT_DOC, KIT_JS } from '../src/motion-kit.js';
import { compose, DEFAULT_BRAND } from '../src/motion-templates.js';
import { MOTION_SKILL } from '../src/seed.js';

describe('motion kit', () => {
  it('ships in every page, with the fill rule for repeated animations', () => {
    const { html } = compose('annonce-choc', { format: '9:16', title: 'T', brand: DEFAULT_BRAND, values: {}, logoSrc: null });
    expect(html).toContain('var kit = (function(){');
    expect(html).toContain('.kit-mask');
    expect(KIT_JS).toContain("fill:again ? 'forwards' : 'both'");
    expect(html).not.toMatch(/gsap\./i);
    // The script parses as plain JavaScript.
    expect(() => new Function(KIT_JS)).not.toThrow();
  });

  it('is documented for the agent, every function and ease', () => {
    for (const fn of ['enter', 'exit', 'reveal', 'type', 'cursor', 'camera', 'count', 'shine', 'float', 'kenburns', 'split']) {
      expect(KIT_JS).toContain(`${fn}: function(`);
      expect(KIT_DOC).toContain(`kit.${fn}(`);
    }
    expect(MOTION_SKILL).toContain(KIT_DOC);
    for (const ease of Object.keys(EASES)) expect(MOTION_SKILL).toContain(ease);
  });
});
