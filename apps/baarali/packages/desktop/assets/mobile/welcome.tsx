import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { baarasseurs as shared } from '@x/shared';

import { BaaraliMark } from '@/components/baarali-mark';
import { useReducedMotion } from '@/components/agent-avatar';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { LivingShape, SHAPE_FILL, saveLook } from '@/components/agent-shape';
import { APEX_URL } from '@/lib/spaces/account';

// BAARALI(07/11/2026): the first launch as Grok Bot opens (the founder's
// call): a black screen where the Baarali shapes look around, « Get
// started », then the person picks their Baarali (a shape, a colour), then
// sign-in. Getting to know each other happens in the first conversation.
// BAARALI(12/11/2026): the animated onboarding, the same on the phone, the
// computer and the web (the founder's mockup): the B wakes up and the shapes
// arrive; the promise, shown working (an agent at work, an approval waiting,
// the same chat everywhere); the person's Baarali; their first name, which
// their Baarali asks for; « Nice to meet you », then the sign-in. In a wide
// browser the shapes drift at the page's edges and the step stays in the middle.
export const ONBOARDED_KEY = 'rowboat.onboarded.v1';
/** The first name given here, put in the first chat's composer (chat.tsx). */
export const NAME_KEY = 'baarali.name.v1';

const INK = '#0A0A0A';
const CARD = '#1C1C1E';
const MUTED = '#B5B5B5';
const PARADE: Array<{ shape: shared.AgentShapeId; color: string }> = [
  { shape: 'cloud', color: 'violet' }, { shape: 'pebble', color: 'orange' }, { shape: 'drop', color: 'blue' },
  { shape: 'kite', color: 'green' }, { shape: 'dome', color: 'rose' },
];
/** In a wide browser, around the page, away from the step in the middle. */
const EDGES: Array<{ shape: shared.AgentShapeId; color: string; left: `${number}%`; top: `${number}%`; size: number; opacity: number }> = [
  { shape: 'cloud', color: 'violet', left: '6%', top: '16%', size: 84, opacity: 1 }, { shape: 'pebble', color: 'orange', left: '86%', top: '12%', size: 70, opacity: 1 },
  { shape: 'drop', color: 'blue', left: '10%', top: '64%', size: 76, opacity: 1 }, { shape: 'kite', color: 'green', left: '84%', top: '58%', size: 66, opacity: 1 },
  { shape: 'dome', color: 'rose', left: '20%', top: '84%', size: 54, opacity: 0.8 }, { shape: 'leaf', color: 'teal', left: '74%', top: '82%', size: 50, opacity: 0.8 },
  { shape: 'bean', color: 'amber', left: '22%', top: '34%', size: 40, opacity: 0.55 }, { shape: 'arch', color: 'red', left: '72%', top: '34%', size: 42, opacity: 0.55 },
];
type Step = 'hello' | 'promise' | 'look' | 'name' | 'ready';
const STEPS: Step[] = ['hello', 'promise', 'look', 'name', 'ready'];
const tap = () => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); };
const native = Platform.OS !== 'web';

// ── Motion ────────────────────────────────────────────────────────────────

/** Comes up from a little below, after `delay`. */
function Rise({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.timing(v, { toValue: 1, duration: 600, delay, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [reduced, delay, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
}

/** Pops in, a little past its size, then settles. */
function Pop({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 5, tension: 90, useNativeDriver: native })]);
    a.start();
    return () => a.stop();
  }, [reduced, delay, v]);
  return <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>{children}</Animated.View>;
}

/** Goes back and forth, forever: a waiting light, a button asking to be pressed. */
function useLoop(duration: number, delay = 0) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    const t = setTimeout(() => a.start(), delay);
    return () => { clearTimeout(t); a.stop(); };
  }, [reduced, duration, delay, v]);
  return v;
}

function Blink({ size = 8, color = '#FFFFFF', delay = 0 }: { size?: number; color?: string; delay?: number }) {
  const v = useLoop(1200, delay);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }} />;
}

/** The agent's work, a bar that fills and starts again. */
function WorkBar() {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 0.6 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }));
    a.start();
    return () => a.stop();
  }, [reduced, v]);
  return <View style={{ height: 4, borderRadius: 2, backgroundColor: '#2C2C2E', overflow: 'hidden' }}>
    <Animated.View style={{ height: 4, backgroundColor: '#FFFFFF', width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
  </View>;
}

/** Words that come one letter after the other, as typed. */
function Typed({ text, delay = 500, style }: { text: string; delay?: number; style: object }) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) { setCount(text.length); return; }
    setCount(0);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { timer = setInterval(() => setCount((n) => (n >= text.length ? n : n + 1)), 28); }, delay);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [text, delay, reduced]);
  return <Text style={style} accessibilityLabel={text}>{text.slice(0, count)}<Text style={{ opacity: 0 }}>{text.slice(count)}</Text></Text>;
}

// ── The scenes ────────────────────────────────────────────────────────────

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', opacity: pressed || disabled ? 0.8 : 1 })}>
    <Text style={{ fontSize: 18, fontWeight: '600', color: INK }}>{translate(label)}</Text>
  </Pressable>;
}

function Hello({ wide }: { wide: boolean }) {
  return <View style={{ alignItems: 'center', gap: 26 }}>
    <Pop delay={150}><BaaraliMark size={wide ? 132 : 104} motion="loading" color="#FFFFFF" /></Pop>
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Rise delay={600}><Text accessibilityRole="header" style={wide
        ? { fontFamily: 'Source Serif 4', fontSize: 48, lineHeight: 54, fontWeight: '500', color: '#FFFFFF', textAlign: 'center' }
        : { fontSize: 40, fontWeight: '600', letterSpacing: -1.2, color: '#FFFFFF' }}>{wide ? translate('Welcome to Baarali') : 'Baarali'}</Text></Rise>
      <Rise delay={850}><Text style={{ fontSize: 18, lineHeight: 26, textAlign: 'center', color: MUTED }}>{translate('Agents that work for you. You stay in control.')}</Text></Rise>
    </View>
    {!wide && <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
      {PARADE.map((p, i) => <Pop key={p.shape} delay={1100 + i * 140}><LivingShape shape={p.shape} color={p.color} size={i === 2 ? 58 : 46} bob offset={i * 380} /></Pop>)}
    </View>}
  </View>;
}

function PromiseScene({ wide }: { wide: boolean }) {
  const glow = useLoop(1800);
  const card = { borderRadius: 20, backgroundColor: CARD, padding: 16, gap: 12 } as const;
  const icon = (name: string) => <Image source={`sf:${name}`} style={{ width: 20, height: 20 }} tintColor="#FFFFFF" />;
  return <View style={{ gap: 16, alignSelf: 'stretch' }}>
    <Rise><Text accessibilityRole="header" style={{ fontFamily: 'Source Serif 4', fontSize: wide ? 40 : 30, lineHeight: wide ? 46 : 36, fontWeight: '500', color: '#FFFFFF', textAlign: wide ? 'center' : 'left' }}>{translate('They work. You decide.')}</Text></Rise>
    <Rise delay={250} style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <LivingShape shape="pebble" color="orange" size={36} bob />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Mariama</Text>
          <Text style={{ fontSize: 13, color: MUTED }}>{translate("Preparing this week's quotes")}</Text>
        </View>
        <Text style={{ fontSize: 12, color: MUTED }}>{translate('At work')}</Text>
      </View>
      <WorkBar />
    </Rise>
    <Rise delay={700} style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Blink color="#FFA31A" />
        <Text style={{ fontSize: 13, color: '#FFA31A' }}>{translate('Waiting for your approval')}</Text>
      </View>
      <Text style={{ fontSize: 15, lineHeight: 21, color: '#FFFFFF' }}>{translate('Send the 3 follow-ups to clients?')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#3A3A3C', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, color: '#FFFFFF' }}>{translate('Decline')}</Text></View>
        <Animated.View style={{ flex: 1, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: INK }}>{translate('Accept')}</Text>
        </Animated.View>
      </View>
    </Rise>
    <Rise delay={1150} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      {icon('iphone')}<Blink size={5} />{icon('laptopcomputer')}<Blink size={5} delay={400} />{icon('globe')}
      <Text style={{ flex: 1, marginLeft: 4, fontSize: 14, lineHeight: 20, color: MUTED }}>{translate('On your phone, your computer and the web. The same conversation.')}</Text>
    </Rise>
  </View>;
}

function Name({ shape, color, name, onName, onDone }: { shape: shared.AgentShapeId; color: string; name: string; onName: (s: string) => void; onDone: () => void }) {
  return <View style={{ gap: 18, alignSelf: 'stretch' }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <Pop><LivingShape shape={shape} color={color} size={64} bob /></Pop>
      <Rise delay={300} style={{ flex: 1, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: CARD, paddingVertical: 14, paddingHorizontal: 16 }}>
        <Typed text={translate("Hi, I'm your Baarali. What should I call you?")} style={{ fontSize: 16, lineHeight: 23, color: '#FFFFFF' }} />
      </Rise>
    </View>
    <Rise delay={500} style={{ gap: 8, marginTop: 14 }}>
      <Text style={{ fontSize: 13, color: '#8E8E93' }}>{translate('Your first name')}</Text>
      <TextInput value={name} onChangeText={(t) => onName(t.slice(0, 40))} placeholder={translate('Your first name')} placeholderTextColor="#6E6E73"
        autoComplete="given-name" textContentType="givenName" returnKeyType="done" onSubmitEditing={onDone} accessibilityLabel={translate('Your first name')}
        style={{ height: 60, borderRadius: 18, backgroundColor: CARD, color: '#FFFFFF', paddingHorizontal: 18, fontSize: 20, fontWeight: '500', ...(native ? {} : ({ outlineStyle: 'none' } as object)) }} />
      <Text style={{ fontSize: 13, lineHeight: 19, color: '#8E8E93' }}>{translate('It will remember it in all your conversations.')}</Text>
    </Rise>
  </View>;
}

function Ready({ shape, color, name, wide }: { shape: shared.AgentShapeId; color: string; name: string; wide: boolean }) {
  const jump = useLoop(1600);
  return <View style={{ alignItems: 'center', gap: 22 }}>
    <Animated.View style={{ transform: [{ translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }] }}>
      <LivingShape shape={shape} color={color} size={wide ? 130 : 120} />
    </Animated.View>
    <Rise><Text accessibilityRole="header" style={{ fontFamily: 'Source Serif 4', fontSize: wide ? 42 : 32, fontWeight: '500', color: '#FFFFFF', textAlign: 'center' }}>
      {name.trim() ? translate('Nice to meet you, $1.', [name.trim()]) : translate('Nice to meet you.')}
    </Text></Rise>
    <Rise delay={200}><Text style={{ fontSize: 16, lineHeight: 23, textAlign: 'center', color: MUTED }}>{translate('Your Baarali is ready. Let’s keep your account, then tell it what to do.')}</Text></Rise>
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
      {PARADE.map((p, i) => <Pop key={p.shape} delay={300 + i * 120}><LivingShape shape={p.shape} color={p.color} size={34} bob offset={i * 260} /></Pop>)}
    </View>
  </View>;
}

// ── The flow ──────────────────────────────────────────────────────────────

export default function Welcome() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 1024;
  const [step, setStep] = useState<Step>('hello');
  const [shape, setShape] = useState<shared.AgentShapeId>('b');
  const [color, setColor] = useState('white');
  const [name, setName] = useState('');
  const [leaving, setLeaving] = useState(false);
  const index = STEPS.indexOf(step);
  const go = (next: number) => { tap(); setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, next))]); };

  const finish = async () => {
    if (leaving) return;
    setLeaving(true);
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveLook({ shape, color });
    if (name.trim()) await AsyncStorage.setItem(NAME_KEY, name.trim()).catch(() => {});
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
    router.replace(APEX_URL ? '/spaces' : '/pairing');
  };

  const action = step === 'hello' ? <Button label="Get started" onPress={() => go(1)} />
    : step === 'ready' ? <Button label="Create my account" onPress={() => void finish()} disabled={leaving} />
      : <Button label="Continue" onPress={() => go(index + 1)} />;

  const progress = step !== 'hello' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={translate('Back')} onPress={() => go(index - 1)}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' }}>
      <Image source="sf:chevron.left" style={{ width: 15, height: 15 }} tintColor="#FFFFFF" />
    </Pressable>
    <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityLabel={translate('Step $1 of $2', [index + 1, STEPS.length])}>
      {STEPS.slice(1).map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i + 1 <= index ? '#FFFFFF' : '#2C2C2E' }} />)}
    </View>
  </View> : null;

  const scene = step === 'hello' ? <Hello wide={wide} />
    : step === 'promise' ? <PromiseScene wide={wide} />
      : step === 'look' ? <LookPicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
        : step === 'name' ? <Name shape={shape} color={color} name={name} onName={setName} onDone={() => go(index + 1)} />
          : <Ready shape={shape} color={color} name={name} wide={wide} />;

  if (wide) {
    return <View style={{ flex: 1, backgroundColor: INK, overflow: 'hidden' }}>
      <StatusBar style="light" />
      {EDGES.map((e, i) => <View key={e.shape} pointerEvents="none" style={{ position: 'absolute', left: e.left, top: e.top, opacity: e.opacity }}>
        <Pop delay={700 + i * 140}><LivingShape shape={e.shape} color={e.color} size={e.size} bob offset={i * 520} /></Pop>
      </View>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 22 }}>
        <BaaraliMark size={26} color="#FFFFFF" />
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>Baarali</Text>
        <View style={{ flex: 1 }} />
        {step !== 'hello' && <Text style={{ fontSize: 13, color: '#8E8E93' }}>{translate('Step $1 of $2', [index + 1, STEPS.length])}</Text>}
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 460, gap: 26 }}>
          {progress}
          <View key={step} style={{ alignItems: 'center' }}>{scene}</View>
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: 340 }}>{action}</View>
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 32, paddingVertical: 18 }}>
        <Text style={{ fontSize: 12.5, color: '#6E6E73' }}>chat.baarali.com</Text>
        <Text style={{ fontSize: 12.5, color: '#6E6E73' }}>{translate('Also on iPhone, Android, Mac and Windows')}</Text>
      </View>
    </View>;
  }

  return <View style={{ flex: 1, backgroundColor: INK }}>
    <StatusBar style="light" />
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }}>
      {progress ? <View style={{ paddingTop: 12 }}>{progress}</View> : null}
      <ScrollView key={step} contentContainerStyle={{ flexGrow: 1, justifyContent: step === 'hello' || step === 'ready' ? 'center' : 'flex-start', paddingTop: step === 'hello' || step === 'ready' ? 0 : 24, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {scene}
      </ScrollView>
      <View style={{ paddingBottom: 12 }}>{action}</View>
    </SafeAreaView>
  </View>;
}

/** The chooser, also opened from the settings (look.tsx). The big face pops at each choice. */
export function LookPicker({ shape, color, onShape, onColor }: {
  shape: shared.AgentShapeId; color: string; onShape: (s: shared.AgentShapeId) => void; onColor: (c: string) => void;
}) {
  const setShape = (s: shared.AgentShapeId) => onShape(s);
  const setColor = (c: string) => onColor(c);
  return <View style={{ flex: 1, alignSelf: 'stretch' }}>
        <Rise><Text accessibilityRole="header" style={{ marginTop: 8, fontSize: 28, fontWeight: '600', textAlign: 'center', color: '#FFFFFF' }}>{translate('Choose your Baarali')}</Text></Rise>
        <Rise delay={150}><Text style={{ marginTop: 8, fontSize: 16, textAlign: 'center', color: MUTED }}>{translate('Its face in the app. You can change it later.')}</Text></Rise>
        <View style={{ paddingVertical: 24, gap: 26 }}>
          <View style={{ alignItems: 'center', height: 128, justifyContent: 'center' }}><Pop key={shape + color}><LivingShape shape={shape} color={color} size={120} bob /></Pop></View>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {shared.SHAPE_IDS.map((id) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={id} accessibilityState={{ checked: shape === id }} onPress={() => { tap(); setShape(id); }}
              style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: shape === id ? '#FFFFFF' : 'transparent' }}>
              <LivingShape shape={id} color={color} size={40} />
            </Pressable>)}
          </View>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            {shared.SHAPE_COLORS.map((c) => <Pressable key={c} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ checked: color === c }} onPress={() => { tap(); setColor(c); }}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color === c ? '#FFFFFF' : 'transparent' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: SHAPE_FILL[c] }} />
            </Pressable>)}
          </View>
        </View>
  </View>;
}
