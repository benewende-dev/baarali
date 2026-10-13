import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Ellipse } from 'react-native-svg';
import { useReducedMotion } from '@/components/agent-avatar';
import { DURATION, OVALS, markFrames, type MarkMotion } from '@/lib/baarali-oval-motion';
import { useColors } from '@/theme/colors';

export function BaaraliMark({ motion = 'static', size = 40, color }: {
  motion?: MarkMotion; size?: number; color?: string;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const effective = reduced ? 'static' : motion;
  const frames = useMemo(() => markFrames(effective, effective === 'static' ? 1 : 180), [effective]);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    phase.setValue(0);
    if (reduced || !focused || !foreground || motion === 'static') return;
    // BAARALI(11/10/2026): run the approved movement on the native driver,
    // without keeping the chat list busy or animating a hidden route.
    const loop = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: DURATION[motion], easing: Easing.linear,
      useNativeDriver: true, isInteraction: false,
    }));
    loop.start();
    return () => { loop.stop(); phase.setValue(0); };
  }, [phase, reduced, focused, foreground, motion]);
  const scale = size / 480;
  // BAARALI(12/10/2026): navigation and history use a fixed B. One SVG is
  // enough there; reserve the twelve animated views for actual movement.
  if (effective === 'static') return <View style={{ width: size, height: size, flexShrink: 0 }} pointerEvents="none"
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox="-240 -240 480 480">
      {OVALS.map((p, i) => <Ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry}
        transform={`rotate(${p.a * 180 / Math.PI} ${p.x} ${p.y})`} fill={color ?? colors.label} />)}
    </Svg>
  </View>;
  return <View style={{ width: size, height: size, flexShrink: 0 }} pointerEvents="none"
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {OVALS.map((p, i) => {
      const poses = frames.ovals[i];
      const interpolate = (key: 'x' | 'y' | 'sx' | 'sy') => phase.interpolate({
        inputRange: frames.inputRange, outputRange: poses.map(pose => pose[key] * (key === 'x' || key === 'y' ? scale : 1)),
      });
      return <Animated.View key={i} style={{ position: 'absolute',
        left: size / 2 - p.rx * scale, top: size / 2 - p.ry * scale,
        width: 2 * p.rx * scale, height: 2 * p.ry * scale,
        transform: [{ translateX: interpolate('x') }, { translateY: interpolate('y') },
          { rotate: phase.interpolate({ inputRange: frames.inputRange, outputRange: poses.map(pose => `${pose.a}rad`) }) },
          { scaleX: interpolate('sx') }, { scaleY: interpolate('sy') }],
      }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${2 * p.rx} ${2 * p.ry}`}>
          <Ellipse cx={p.rx} cy={p.ry} rx={p.rx} ry={p.ry} fill={color ?? colors.label} />
        </Svg>
      </Animated.View>;
    })}
  </View>;
}
