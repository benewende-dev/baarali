import { describe, expect, it } from 'vitest';
import { OVALS, markFrames, markPose } from '../../control/src/oval-b.js';

describe('approved oval B motion', () => {
  it('unfolds, makes one full turn and returns to the exact B', () => {
    for (let i = 0; i < OVALS.length; i++) {
      const start = markPose('rotation', .32, i);
      const finish = markPose('rotation', .66 - 1e-9, i);
      expect(finish.a - start.a).toBeCloseTo(2 * Math.PI, 6);
      expect(finish.x).toBeCloseTo(start.x, 5);
      expect(finish.y).toBeCloseTo(start.y, 5);
      expect(markPose('rotation', .9, i)).toEqual(markPose('static', 0, i));
      expect(markPose('rotation', 1, i)).toEqual(markPose('rotation', 0, i));
    }
  });

  it('does not clip any oval or generate invalid transforms throughout either loop', () => {
    for (const mode of ['rotation', 'loading'] as const) {
      for (let frame = 0; frame <= 1000; frame++) {
        OVALS.forEach((oval, i) => {
          const p = markPose(mode, frame / 1000, i);
          for (const value of Object.values(p)) expect(Number.isFinite(value)).toBe(true);
          const extentX = Math.hypot(oval.rx * p.sx * Math.cos(p.a), oval.ry * p.sy * Math.sin(p.a));
          const extentY = Math.hypot(oval.rx * p.sx * Math.sin(p.a), oval.ry * p.sy * Math.cos(p.a));
          expect(Math.abs(p.x) + extentX).toBeLessThan(240);
          expect(Math.abs(p.y) + extentY).toBeLessThan(240);
        });
      }
    }
  });

  it('keeps the onboarding B readable and the loading loop seamless', () => {
    OVALS.forEach((oval, i) => {
      expect(markPose('loading', 1, i).x).toBeCloseTo(markPose('loading', 0, i).x, 8);
      expect(markPose('loading', 1, i).a).toBeCloseTo(markPose('loading', 0, i).a, 8);
      for (let phase = 0; phase <= 1; phase += .01) {
        const p = markPose('loading', phase, i);
        expect(Math.hypot(p.x - oval.x, p.y - oval.y)).toBeLessThanOrEqual(3.00001);
      }
    });
  });

  it('keeps native keyframes continuous at the angle wrap after 360°', () => {
    const frames = markFrames('rotation');
    frames.ovals.forEach((poses, i) => {
      for (let k = 1; k < poses.length; k++) expect(Math.abs(poses[k].a - poses[k - 1].a)).toBeLessThan(.3);
      expect(poses.at(-1)!.a - poses[0].a).toBeCloseTo(2 * Math.PI, 6);
      expect(poses.at(-1)!.x).toBe(OVALS[i].x);
    });
  });
});
