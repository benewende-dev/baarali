import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { baarasseurs as shared } from '@x/shared';
import { useReducedMotion } from '@/components/agent-avatar';
import { B_BODY, B_BOX, B_EYES, B_EYE_R, DURATION, EYES, SHAPES, SHAPE_FILL, eyesPose } from '@/lib/baarali-b-mark';
export { SHAPE_FILL };

// BAARALI(07/11/2026): an agent as Grok Bot draws its bots, a shape and a
// colour, in Baarali's own family: every shape has the B's two round eyes.
// The shapes live in a 100-unit box; the B itself is drawn from b-mark.ts.

const INK = '#0A0A0A';

/** White on a light page turns ink, as the B does; its eyes then turn white. */
export function adaptive(color: string, dark: boolean): string {
  return color === 'white' && !dark ? 'ink' : color;
}
const eyeFor = (fill: string) => (fill === INK ? '#FFFFFF' : INK);

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
