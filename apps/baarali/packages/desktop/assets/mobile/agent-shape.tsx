import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { baarasseurs as shared } from '@x/shared';
import { useReducedMotion } from '@/components/agent-avatar';
import { B_BODY, B_BOX, B_EYES, B_EYE_R, DURATION, eyesPose } from '@/lib/baarali-b-mark';

// BAARALI(07/11/2026): an agent as Grok Bot draws its bots, a shape and a
// colour, in Baarali's own family: every shape has the B's two round eyes.
// The shapes live in a 100-unit box; the B itself is drawn from b-mark.ts.

const INK = '#0A0A0A';

/** The colour a shape is filled with, by the name the agent keeps. */
export const SHAPE_FILL: Record<string, string> = {
  white: '#FFFFFF', brown: '#8B5E3C', red: '#F0353F', orange: '#FF6A1A', amber: '#FFA31A',
  green: '#12C26B', teal: '#14B8A6', blue: '#1F7BFF', violet: '#8B5CF6', rose: '#F43F8E',
  gray: '#7A7A7A', clay: '#E0703C', ink: INK,
};

/** White on a light page turns ink, as the B does; its eyes then turn white. */
export function adaptive(color: string, dark: boolean): string {
  return color === 'white' && !dark ? 'ink' : color;
}
const eyeFor = (fill: string) => (fill === INK ? '#FFFFFF' : INK);

type Eyes = [number, number, number, number];
const EYES: Eyes = [42, 44, 58, 44];

const SHAPES: Record<Exclude<shared.AgentShapeId, 'b'>, { d: string; eyes?: Eyes }> = {
  round: { d: 'M50 12 A38 38 0 1 1 49.9 12 Z' },
  pebble: { d: 'M50 14 C76 14 92 32 90 56 C88 78 70 90 48 88 C24 86 8 70 10 48 C12 28 28 14 50 14 Z' },
  dome: { d: 'M14 82 V50 C14 28 30 14 50 14 C70 14 86 28 86 50 V82 C86 86 84 88 80 88 H20 C16 88 14 86 14 82 Z' },
  drop: { d: 'M50 10 C64 30 84 44 84 62 C84 80 69 90 50 90 C31 90 16 80 16 62 C16 44 36 30 50 10 Z', eyes: [42, 58, 58, 58] },
  pill: { d: 'M30 26 H70 C84 26 94 37 94 50 C94 63 84 74 70 74 H30 C16 74 6 63 6 50 C6 37 16 26 30 26 Z', eyes: [42, 46, 58, 46] },
  square: { d: 'M50 12 C80 12 88 20 88 50 C88 80 80 88 50 88 C20 88 12 80 12 50 C12 20 20 12 50 12 Z' },
  arch: { d: 'M12 88 V46 C12 26 29 12 50 12 C71 12 88 26 88 46 V88 H68 V66 C68 58 60 52 50 52 C40 52 32 58 32 66 V88 Z', eyes: [42, 32, 58, 32] },
  bean: { d: 'M30 16 C46 10 58 22 66 26 C80 32 92 42 90 62 C88 82 70 92 50 88 C30 84 12 74 10 52 C8 34 16 22 30 16 Z', eyes: [44, 44, 60, 46] },
  cloud: { d: 'M28 84 C14 84 6 74 6 62 C6 50 15 42 26 42 C26 26 38 14 52 14 C66 14 77 24 79 37 C89 39 96 48 96 60 C96 73 86 84 72 84 Z', eyes: [44, 50, 60, 50] },
  leaf: { d: 'M88 12 C88 60 70 88 30 88 C18 88 12 82 12 70 C12 34 44 12 88 12 Z', eyes: [46, 50, 62, 44] },
  kite: { d: 'M50 8 C54 8 57 10 60 14 L88 44 C92 48 92 52 88 56 L60 86 C57 90 54 92 50 92 C46 92 43 90 40 86 L12 56 C8 52 8 48 12 44 L40 14 C43 10 46 8 50 8 Z', eyes: [42, 48, 58, 48] },
};

export function AgentShape({ shape, color, size }: { shape: shared.AgentShapeId; color: string; size: number }) {
  const fill = SHAPE_FILL[color] ?? SHAPE_FILL.clay;
  if (shape === 'b') {
    return <Svg width={size} height={size} viewBox={`${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}`} accessible={false}>
      <Path d={B_BODY} fill={fill} />
      {B_EYES.map((e, i) => <Circle key={i} cx={e.cx} cy={e.cy} r={B_EYE_R} fill={eyeFor(fill)} />)}
    </Svg>;
  }
  const { d, eyes = EYES } = SHAPES[shape];
  return <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
    <Path d={d} fill={fill} />
    <G>
      <Circle cx={eyes[0]} cy={eyes[1]} r={5.2} fill={eyeFor(fill)} />
      <Circle cx={eyes[2]} cy={eyes[3]} r={5.2} fill={eyeFor(fill)} />
    </G>
  </Svg>;
}

// BAARALI(07/11/2026): a shape alive, as the B is (baarali-mark.tsx): only
// the eyes move, a glance and a blink; `bob` adds a slow float for the
// welcome's parade, `offset` shifts its rhythm so a row does not move as one.
const SAMPLES = 120;

export function LivingShape({ shape, color, size, bob = false, offset = 0 }: {
  shape: shared.AgentShapeId; color: string; size: number; bob?: boolean; offset?: number;
}) {
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const eyes = Animated.loop(Animated.timing(phase, { toValue: 1, duration: DURATION.loading, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    const lift = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(float, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    const start = setTimeout(() => { eyes.start(); if (bob) lift.start(); }, offset);
    return () => { clearTimeout(start); eyes.stop(); lift.stop(); };
  }, [reduced, bob, offset, phase, float]);

  const fill = SHAPE_FILL[color] ?? SHAPE_FILL.clay;
  const geo = shape === 'b'
    ? { box: `${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}`, d: B_BODY, unit: size / B_BOX.size, ox: B_BOX.x, oy: B_BOX.y, r: B_EYE_R, eyes: B_EYES.map(e => [e.cx, e.cy]) }
    : (() => { const g = SHAPES[shape]; const e = g.eyes ?? EYES; return { box: '0 0 100 100', d: g.d, unit: size / 100, ox: 0, oy: 0, r: 5.2, eyes: [[e[0], e[1]], [e[2], e[3]]] }; })();
  const move = size / B_BOX.size;
  const frames = useMemo(() => {
    const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
    const poses = inputRange.map(p => eyesPose('loading', p));
    return { inputRange, dx: poses.map(p => p.dx * move), dy: poses.map(p => p.dy * move), lid: poses.map(p => p.lid) };
  }, [move]);
  const r = geo.r * geo.unit;
  return <Animated.View pointerEvents="none" accessible={false}
    style={{ width: size, height: size, transform: bob ? [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.08] }) }] : [] }}>
    <Svg width={size} height={size} viewBox={geo.box}><Path d={geo.d} fill={fill} /></Svg>
    {geo.eyes.map(([x, y], i) => <Animated.View key={i} style={{
      position: 'absolute', left: (x - geo.ox) * geo.unit - r, top: (y - geo.oy) * geo.unit - r,
      width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: eyeFor(fill),
      transform: reduced ? [] : [
        { translateX: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.dx }) },
        { translateY: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.dy }) },
        { scaleY: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.lid }) },
      ],
    }} />)}
  </Animated.View>;
}

/** Where the person's own Baarali look is kept (welcome.tsx, home.tsx). */
export const LOOK_KEY = 'baarali.look.v1';
export type Look = { shape: shared.AgentShapeId; color: string };

let look: Look | null | undefined;
const lookListeners = new Set<() => void>();
void AsyncStorage.getItem(LOOK_KEY).then((raw) => {
  try { look = raw ? JSON.parse(raw) as Look : null; } catch { look = null; }
  lookListeners.forEach((l) => l());
}).catch(() => { look = null; lookListeners.forEach((l) => l()); });

/** The look the person chose for their Baarali; null when none, undefined while reading. */
export function useLook(): Look | null | undefined {
  return useSyncExternalStore((l) => { lookListeners.add(l); return () => lookListeners.delete(l); }, () => look);
}

export async function saveLook(next: Look): Promise<void> {
  look = next;
  lookListeners.forEach((l) => l());
  await AsyncStorage.setItem(LOOK_KEY, JSON.stringify(next)).catch(() => {});
}
