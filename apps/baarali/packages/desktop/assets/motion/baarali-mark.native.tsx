import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@/components/agent-avatar';
import { B_BODY, B_BOX, B_EYES, B_EYE_R, DURATION, eyesPose, type MarkMotion } from '@/lib/baarali-b-mark';
import { useColors } from '@/theme/colors';

const SAMPLES = 120;

// BAARALI(07/11/2026): the B that looks (founder's choice C, control
// src/b-mark.ts): the body is drawn once; only the eyes move, on the native
// driver, and only while the screen shows and the app is in front.
// The eyes take the page's colour, so they read as holes in the B.
export function BaaraliMark({ motion = 'static', size = 40, color, eyes }: {
  motion?: MarkMotion; size?: number; color?: string; eyes?: string;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const effective = reduced ? 'static' : motion;
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    phase.setValue(0);
    if (effective === 'static' || !focused || !foreground) return;
    const loop = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: DURATION[effective], easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    loop.start();
    return () => { loop.stop(); phase.setValue(0); };
  }, [phase, effective, focused, foreground]);

  const k = size / B_BOX.size;
  const frames = useMemo(() => {
    const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
    const poses = inputRange.map(p => eyesPose(effective, p));
    return { inputRange, dx: poses.map(p => p.dx * k), dy: poses.map(p => p.dy * k), lid: poses.map(p => p.lid) };
  }, [effective, k]);
  const body = color ?? colors.label;
  const eyeColor = eyes ?? (color && color.toUpperCase() === '#FFFFFF' ? '#0A0A0A' : colors.background);
  const r = B_EYE_R * k;
  const still = effective === 'static';

  return <View style={{ width: size, height: size, flexShrink: 0 }} pointerEvents="none"
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox={`${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}`}>
      <Path d={B_BODY} fill={body} />
    </Svg>
    {B_EYES.map((e, i) => <Animated.View key={i} style={{
      position: 'absolute', left: (e.cx - B_BOX.x) * k - r, top: (e.cy - B_BOX.y) * k - r,
      width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: eyeColor,
      transform: still ? [] : [
        { translateX: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.dx }) },
        { translateY: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.dy }) },
        { scaleY: phase.interpolate({ inputRange: frames.inputRange, outputRange: frames.lid }) },
      ],
    }} />)}
  </View>;
}
