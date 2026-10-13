import { describe, expect, it } from 'vitest';
import { isMotionImage } from '../assets/motion/motion-export-image';

describe('Motion export preview media', () => {
  it('routes GIF and still exports away from the video decoder', () => {
    for (const path of ['motion/pub/exports/pub.gif', 'motion/pub/exports/POSTER.PNG', 'motion/pub/exports/a.webp?token=1']) expect(isMotionImage(path)).toBe(true);
    for (const path of ['motion/pub/exports/pub.mp4', 'motion/pub/exports/pub.webm', 'motion/pub/exports/pub.pdf']) expect(isMotionImage(path)).toBe(false);
  });
});
