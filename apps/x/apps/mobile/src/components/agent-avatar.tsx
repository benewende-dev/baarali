import { Image, type ImageSource } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { baarasseurs as shared } from '@x/shared';

// BAARALI(11/10/2026): keep the B as an agent avatar after the furry mascot
// became the app's guide; existing profile ids remain compatible.
const SOURCES: Record<shared.AgentAvatarId, ImageSource> = {
  original: require('../../assets/baarali-avatars/original.svg'),
  bop: require('../../assets/baarali-avatars/bop.png'),
  moki: require('../../assets/baarali-avatars/moki.png'),
  nova: require('../../assets/baarali-avatars/nova.png'),
  tiko: require('../../assets/baarali-avatars/tiko.png'),
  nimbo: require('../../assets/baarali-avatars/nimbo.png'),
  pixel: require('../../assets/baarali-avatars/pixel.png'),
  zest: require('../../assets/baarali-avatars/zest.png'),
  ink: require('../../assets/baarali-avatars/ink.png'),
  street: require('../../assets/baarali-avatars/street.png'),
};

function OriginalMark({ size, color, blink = false }: { size: number; color: string; blink?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="250 160 530 705" accessible={false}>
      <G transform="translate(512 512) scale(1.7) translate(-505 -423)">
        <Path d="M450 250 H502 C574 250 612 280 612 322 C612 345 602 360 590 368 Q584 373 590 378 C612 388 626 408 626 436 C626 476 590 502 512 502 H450 C413 502 384 473 384 436 V316 C384 279 413 250 450 250 Z" fill={color} />
        <G transform={blink ? 'translate(0 324) scale(1 .12) translate(0 -324)' : undefined}>
          <Circle cx="500" cy="324" r="12" fill="#0A0A0A" />
          <Circle cx="554" cy="324" r="12" fill="#0A0A0A" />
        </G>
        <Circle cx="460" cy="556" r="38" fill={color} />
        <Circle cx="552" cy="556" r="38" fill={color} />
      </G>
    </Svg>
  );
}

export function AgentAvatarImage({ avatar, size, color = '#FFFFFF', blink = false }: {
  avatar: shared.AgentAvatarId; size: number; color?: string; blink?: boolean;
}) {
  return avatar === 'original' ? <OriginalMark size={size} color={color} blink={blink} /> : (
    <Image source={SOURCES[avatar]} contentFit="contain" style={{ width: size, height: size }} accessible={false} />
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; listener.remove(); };
  }, []);
  return reduced;
}

export function AnimatedAgentAvatar({ avatar = 'original', size = 190 }: { avatar?: shared.AgentAvatarId; size?: number }) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [blink, setBlink] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    lift.setValue(0);
    setBlink(false);
    if (reduced || !focused || !foreground) return;
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(lift, { toValue: -7, duration: 1500, useNativeDriver: true, isInteraction: false }),
      Animated.timing(lift, { toValue: 0, duration: 1500, useNativeDriver: true, isInteraction: false }),
    ]));
    motion.start();
    let reopen: ReturnType<typeof setTimeout> | undefined;
    const eyes = setInterval(() => { setBlink(true); reopen = setTimeout(() => setBlink(false), 140); }, 5200);
    return () => { motion.stop(); lift.setValue(0); clearInterval(eyes); clearTimeout(reopen); };
  }, [focused, foreground, reduced, lift]);
  return <Animated.View style={{ transform: [{ translateY: lift }] }}><AgentAvatarImage avatar={avatar} size={size} blink={blink} /></Animated.View>;
}

export function AvatarTile({ avatar, size }: { avatar: shared.AgentAvatarId; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * .25, alignItems: 'center', justifyContent: 'center', backgroundColor: avatar === 'original' ? '#1A6DFF' : 'transparent' }}>
      <AgentAvatarImage avatar={avatar} size={size * .9} />
    </View>
  );
}
