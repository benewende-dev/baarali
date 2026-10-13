import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable } from 'react-native';

import { useReducedMotion } from './agent-avatar';

// BAARALI(11/10/2026): the approved furry mascot guides the app; the B stays
// an agent avatar. Native transforms keep the fur intact and stop off screen.
export type MascotMotion = 'idle' | 'welcome' | 'focus' | 'waiting' | 'success' | 'error' | 'dance';
type Frame = [duration: number, y: number, angle: number, x: number, scaleY: number];
const FRAMES: Record<MascotMotion, Frame[]> = {
  idle: [[1800, -3, 1, 0, 1.01], [1800, 0, 0, 0, 1]],
  welcome: [[160, 2, -4, 0, .95], [250, -12, 5, 0, 1.03], [220, 0, -3, 0, .98], [200, -4, 2, 0, 1], [220, 0, 0, 0, 1]],
  focus: [[900, 0, 3, 1, 1], [900, -2, -3, -1, 1], [900, 0, 0, 0, 1]],
  waiting: [[800, -3, -4, -2, 1], [800, 0, 4, 2, 1], [800, -3, -4, -2, 1], [800, 0, 0, 0, 1]],
  success: [[140, 3, -3, 0, .93], [240, -16, 5, 0, 1.04], [180, 0, -3, 0, .97], [220, -7, 3, 0, 1.02], [220, 0, 0, 0, 1]],
  error: [[90, 0, -3, -4, 1], [90, 0, 3, 4, 1], [90, 0, -2, -3, 1], [90, 0, 2, 2, 1], [140, 0, 0, 0, 1]],
  dance: [[150, 0, -9, -5, .96], [180, -8, 9, 5, 1.03], [180, 0, -9, -5, .96], [180, -8, 9, 5, 1.03], [180, 0, -4, -2, .98], [220, 0, 0, 0, 1]],
};

export function BaaraliMascotImage({ size }: { size: number }) {
  return <Image source={require('../../assets/brand/mascot-furry.png')} contentFit="contain" style={{ width: size, height: size }} accessible={false} />;
}

export function BaaraliMascot({ size = 160, motion = 'idle', event = 0 }: { size?: number; motion?: MascotMotion; event?: number }) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [dancing, setDancing] = useState(false);
  const y = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const angle = useRef(new Animated.Value(0)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let alive = true;
    const reset = () => { y.setValue(0); x.setValue(0); angle.setValue(0); scaleY.setValue(1); };
    reset();
    if (reduced || !focused || !foreground) { setDancing(false); return; }
    const current = dancing && !['waiting', 'success', 'error'].includes(motion) ? 'dance' : motion;
    const sequence = (frames: Frame[]) => Animated.sequence(frames.map(([duration, lift, tilt, slide, stretch]) => Animated.parallel(
      [[y, lift], [x, slide], [angle, tilt], [scaleY, stretch]].map(([value, toValue]) => Animated.timing(value as Animated.Value, {
        toValue: toValue as number, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false,
      })),
    )));
    const repeat = ['idle', 'focus', 'waiting'].includes(current);
    const animation = repeat ? Animated.loop(sequence(FRAMES[current])) : sequence(FRAMES[current]);
    let rest: Animated.CompositeAnimation | undefined;
    animation.start(({ finished }) => {
      if (!alive || !finished) return;
      if (dancing && current === 'dance') setDancing(false);
      else { rest = Animated.loop(sequence(FRAMES.idle)); rest.start(); }
    });
    return () => { alive = false; animation.stop(); rest?.stop(); reset(); };
  }, [motion, event, dancing, reduced, focused, foreground, x, y, angle, scaleY]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Animate the mascot" onPress={() => setDancing(true)} disabled={reduced || motion === 'waiting'} style={{ width: size, height: size }}>
      <Animated.View pointerEvents="none" style={{ transform: [{ translateX: x }, { translateY: y }, { rotate: angle.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) }, { scaleY }] }}>
        <BaaraliMascotImage size={size} />
      </Animated.View>
    </Pressable>
  );
}
