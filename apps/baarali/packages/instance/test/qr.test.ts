import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg, qrTarget } from '../src/qr.js';

describe('QR codes', () => {
  it('picks the smallest version and draws the finder patterns', () => {
    expect(qrMatrix('Hello')).toHaveLength(21);
    expect(qrMatrix('https://wa.me/22670000000')).toHaveLength(25);
    expect(qrMatrix('x'.repeat(400))).toHaveLength(77);
    const m = qrMatrix('https://wa.me/22670000000');
    // A finder: a dark ring, a light ring, a dark 3×3 centre.
    expect([0, 1, 2, 3, 4, 5, 6].map((x) => m[0][x])).toEqual(Array(7).fill(true));
    expect([1, 2, 3, 4, 5].map((x) => m[1][x])).toEqual([false, false, false, false, false]);
    expect(m[3][3]).toBe(true);
    expect(m[7].slice(0, 8)).toEqual(Array(8).fill(false));
    expect(() => qrMatrix('y'.repeat(2000))).toThrow();
  });

  it('is the same code every time, as an SVG with its quiet zone', () => {
    expect(qrSvg('abc')).toBe(qrSvg('abc'));
    expect(qrSvg('abc')).toMatch(/^<svg class="qr" viewBox="0 0 29 29"/);
  });

  it('opens WhatsApp from a full number, a link as given', () => {
    expect(qrTarget('+226 70 00 00 00')).toBe('https://wa.me/22670000000');
    expect(qrTarget('22670000000')).toBe('https://wa.me/22670000000');
    expect(qrTarget('https://baarali.com/menu')).toBe('https://baarali.com/menu');
    expect(qrTarget('Écrivez-nous')).toBeNull();
    expect(qrTarget('')).toBeNull();
  });
});
