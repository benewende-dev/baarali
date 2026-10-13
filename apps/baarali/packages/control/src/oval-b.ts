export type MarkMotion = 'static' | 'loading' | 'rotation';
export type Pose = { x: number; y: number; a: number; sx: number; sy: number };
export const DURATION = { static: 0, loading: 5800, rotation: 3480 } as const;
export const OVALS = [
  [772, 133, 44, 25, 1], [688, 162, 40, 26, -51],
  [854, 165, 39, 27.5, 51], [674, 231, 39.5, 27.5, -42],
  [865, 233, 39, 27, -40], [738, 268, 35, 25, 8],
  [813, 282, 35.5, 25, 9], [665, 302, 40, 28.5, -43],
  [860, 343, 42, 30, 77], [654, 376, 42.5, 27, -44],
  [712, 420, 45, 29.5, -8], [806, 417, 47.5, 30, -27],
].map(([x, y, rx, ry, a]) => ({ x: x - 754, y: y - 280, rx, ry, a: a * Math.PI / 180 }));
const ranks = [3, 5, 2, 7, 1, 0, 4, 9, 6, 11, 10, 8];
const orbitRanks = [0, 11, 1, 10, 2, 9, 3, 8, 4, 7, 6, 5];
const clamp = (u: number) => Math.max(0, Math.min(1, u));
const smooth = (u: number) => clamp(u) ** 2 * (3 - 2 * clamp(u));
const out = (u: number) => 1 - (1 - clamp(u)) ** 4;
const rest = (i: number): Pose => ({ ...OVALS[i], sx: 1, sy: 1 });
const mix = (p: Pose, q: Pose, t: number): Pose => ({
  x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t,
  a: p.a + (q.a - p.a) * t, sx: p.sx + (q.sx - p.sx) * t, sy: p.sy + (q.sy - p.sy) * t,
});

export function loadingPose(p: Pose, i: number, phase: number, count: number): Pose {
  const wave = 2 * Math.PI * (phase * 2 - i / count);
  const pulse = ((1 + Math.sin(wave)) / 2) ** 3;
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x + p.x / len * 3 * pulse, y: p.y + p.y / len * 3 * pulse,
    a: p.a + .1 * Math.sin(wave), sx: 1 + .1 * pulse, sy: 1 + .1 * pulse };
}

function magnetic(p: Pose, q: Pose, progress: number): Pose {
  if (progress >= 1) return p;
  const pull = .45;
  const t = clamp(progress / pull);
  const s = clamp((progress - pull) / (1 - pull));
  const residue = progress < pull ? 1 - t ** 4 : -.26 * Math.exp(-6 * s) * Math.sin(15 * s) * (1 - smooth((s - .72) / .28));
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
  const curve = progress < pull ? Math.sin(Math.PI * t) * (1 - t) * 16 : 0;
  const stretch = progress < pull ? .035 * t * t : 0;
  return { x: p.x + dx * residue - dy / len * curve, y: p.y + dy * residue + dx / len * curve,
    a: p.a + (q.a - p.a) * residue, sx: 1 + stretch, sy: 1 - stretch };
}

// BAARALI(11/10/2026): share the approved geometry and timing across chat
// loaders and onboarding, so the native and desktop motions stay identical.
export function markPose(motion: MarkMotion, phase: number, i: number): Pose {
  const p = rest(i);
  if (motion === 'static') return p;
  if (motion === 'loading') return loadingPose(p, i, phase, OVALS.length);
  if (phase < .12 || phase >= .9) return p;
  if (phase < .17) {
    const tension = -.055 * Math.sin(Math.PI * clamp((phase - .12) / .05));
    return { ...p, x: p.x * (1 + tension), y: p.y * (1 + tension) };
  }
  const theta = -Math.PI / 2 + orbitRanks[i] / OVALS.length * 2 * Math.PI;
  const ring = { x: Math.cos(theta) * 180, y: Math.sin(theta) * 180, a: p.a + .4, sx: .92, sy: .92 };
  if (phase < .32) return mix(p, ring, out((phase - .17) / .15));
  if (phase < .66) {
    const progress = (phase - .32) / .34;
    const turn = 2 * Math.PI * smooth(progress);
    const radius = 180 * (1 + .035 * Math.sin(Math.PI * progress));
    return { x: Math.cos(theta + turn) * radius, y: Math.sin(theta + turn) * radius,
      a: ring.a + turn, sx: .92, sy: .92 };
  }
  const returnAt = .66 + ranks[i] * .004;
  return phase < returnAt ? ring : magnetic(p, ring, (phase - returnAt) / .19);
}

export function markFrames(motion: MarkMotion, samples = 180) {
  const inputRange = Array.from({ length: samples + 1 }, (_, i) => i / samples);
  const ovals = OVALS.map((_, i) => {
    let previous = markPose(motion, 0, i).a;
    let continuous = previous;
    return inputRange.map((phase) => {
      const pose = markPose(motion, phase, i);
      let delta = pose.a - previous;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      continuous += delta;
      previous = pose.a;
      // BAARALI(11/10/2026): native interpolation must not spin backwards
      // when the equivalent angle wraps after the completed 360-degree turn.
      return { ...pose, a: continuous };
    });
  });
  return { inputRange, ovals };
}
