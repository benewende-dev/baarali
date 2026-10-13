import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { baarasseurs as shared } from '@x/shared';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AgentAvatarImage, useReducedMotion } from '@/components/agent-avatar';
import { BaaraliMascot, BaaraliMascotImage } from '@/components/baarali-mascot';
import { AVATAR_PREFERENCE_KEY } from '@/lib/agent-avatar-preference';
import { useColors } from '@/theme/colors';

// BAARALI(11/10/2026): Déclic uses the approved furry guide, distinct from
// the agent avatar selection. The introduction creates no agent.
export const ONBOARDED_KEY = 'rowboat.onboarded.v1';
const PROGRESS_KEY = 'baarali.onboarding.declic.v1';
const PICKS = ['original', 'moki', 'tiko', 'nimbo', 'pixel', 'zest'] as const;
const SLIDES = [
  { sub: 'Your projects, supported', title: 'Your projects.', subtitle: 'Your agents.', label: 'Discover', detail: 'Agents to support your work. You define the goals.', hint: 'Discover how it works' },
  { sub: 'A clear request', title: 'Your request.', subtitle: 'A proposal.', label: 'Take action', detail: 'The agent prepares a first version. You can adjust and approve it.', hint: 'Choose an avatar' },
  { sub: 'Personalize your agent', title: 'Your agent.', subtitle: 'Your identity.', label: 'Personalize', detail: 'Choose an avatar for your agent. You will define its mission later.', hint: 'Confirm my choice' },
  { sub: 'Your avatar is selected', title: 'Your agent.', subtitle: 'Your choice.', label: 'Your selection', detail: 'Your avatar is selected. Define the agent’s mission after signing in.', hint: 'Continue to sign in' },
];

export default function BaaraliOnboarding() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState<shared.AgentAvatarId>('original');
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const transition = useRef(new Animated.Value(1)).current;
  const changed = useRef(false);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(PROGRESS_KEY).then((raw) => {
      if (!alive || changed.current || !raw) return;
      try {
        const saved = JSON.parse(raw);
        if (Number.isInteger(saved.step) && saved.step >= 0 && saved.step < SLIDES.length) setStep(saved.step);
        if (PICKS.includes(saved.avatar)) setAvatar(saved.avatar);
      } catch { /* A broken draft opens on the first step. */ }
    }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (ready) void AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ step, avatar })).catch(() => {});
  }, [step, avatar, ready]);

  function go(next: number) {
    changed.current = true;
    setStep(next);
    transition.stopAnimation();
    if (reduced) { transition.setValue(1); return; }
    transition.setValue(0);
    Animated.timing(transition, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }
  async function finish() {
    if (finishing) return;
    setFinishing(true);
    await AsyncStorage.multiSet([[ONBOARDED_KEY, '1'], [AVATAR_PREFERENCE_KEY, avatar]]).catch(() => {});
    await AsyncStorage.removeItem(PROGRESS_KEY).catch(() => {});
    router.replace('/spaces');
  }

  const slide = SLIDES[step];
  const compact = width < 360;
  const name = shared.AGENT_AVATARS.find((a) => a.id === avatar)?.label ?? 'Original';
  const mascotSize = compact ? 138 : 154;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={[s.phone, { backgroundColor: colors.background }]}>
          <View style={[s.hero, compact && { paddingHorizontal: 20 }]}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs><LinearGradient id="declic-blue" x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor="#243F8B" /><Stop offset="0.7" stopColor="#1A6DFF" /><Stop offset="1" stopColor="#5393FF" /></LinearGradient></Defs>
                <Rect width="100%" height="100%" fill="url(#declic-blue)" />
              </Svg>
            </View>
            <View style={s.header}>
              <View style={s.brandRow}>
                <Image source={require('../../assets/brand/wordmark-light.svg')} contentFit="contain" style={s.brand} accessibilityLabel="Baarali" />
                <BaaraliMascotImage size={32} />
              </View>
              {step < 3 && <Pressable accessibilityRole="button" onPress={() => void finish()} disabled={finishing} style={s.skip}><Text style={s.skipText}>Skip</Text></Pressable>}
            </View>
            <View style={s.heading}>
              <Text style={s.kicker}>{slide.sub}</Text>
              <Text accessibilityRole="header" style={[s.title, compact && { fontSize: 32 }]}>{slide.title}{'\n'}{slide.subtitle}</Text>
            </View>
            <Animated.View style={[s.scene, { opacity: transition, transform: [{ translateX: transition.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
              {step === 2 ? (
                <View accessibilityRole="radiogroup" accessibilityLabel="Choose an avatar" style={s.picks}>
                  {PICKS.map((id) => (
                    <Pressable key={id} accessibilityRole="radio" aria-checked={id === avatar} accessibilityState={{ checked: id === avatar }} accessibilityLabel={shared.AGENT_AVATARS.find((a) => a.id === id)!.label}
                      onPress={() => { changed.current = true; setAvatar(id); }} style={[s.pick, id === avatar && s.picked]}>
                      <AgentAvatarImage avatar={id} size={compact ? 62 : 70} />
                      <Text style={s.pickLabel}>{shared.AGENT_AVATARS.find((a) => a.id === id)!.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : step === 1 ? (
                <>
                  <View style={s.prompt}><Text style={s.promptText}>Prepare a launch.</Text></View>
                  <View style={[s.proposal, { backgroundColor: colors.background }]}>
                    <Text style={[s.proposalKicker, { color: colors.secondaryLabel }]}>A first version</Text>
                    <Text style={[s.proposalTitle, { color: colors.label }]}>Launch plan</Text>
                    <Text style={[s.task, { color: colors.label }]}>Define the goals</Text>
                    <Text style={[s.task, { color: colors.label }]}>Prepare the content</Text>
                    <Text style={[s.task, { color: colors.label }]}>Organize the steps</Text>
                    <Text style={[s.note, { color: colors.secondaryLabel }]}>A proposal for your approval.</Text>
                  </View>
                  <View style={s.smallMascot}><BaaraliMascot size={70} motion="focus" /></View>
                </>
              ) : (
                <>
                  <View style={s.mainMascot}>{step === 3 ? <AgentAvatarImage avatar={avatar} size={mascotSize} /> : <BaaraliMascot size={mascotSize} motion="welcome" />}</View>
                  {step === 0 ? <>
                    <View style={[s.tag, s.goal]}><Text style={s.tagText}>Your goal</Text></View>
                    <View style={[s.tag, s.service]}><Text style={s.tagText}>At your service</Text></View>
                  </> : <><View style={s.smallMascot}><BaaraliMascot size={62} motion="success" /></View><View style={s.selection}><Text style={s.selectionText}>Selected avatar</Text><Text style={s.selectionText}>{name}</Text></View></>}
                </>
              )}
            </Animated.View>
          </View>
          <View style={s.footer}>
            <Text style={[s.chapter, { color: colors.secondaryLabel }]}>{slide.label}</Text>
            <Text style={[s.detail, { color: colors.label }]}>{slide.detail}</Text>
            <View style={s.dots} accessibilityLabel="Introduction steps">
              {SLIDES.map((item, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: i === step }} onPress={() => go(i)} style={s.dotHit}><View style={{ height: 5, width: step === i ? 25 : 6, borderRadius: 4, backgroundColor: step === i ? '#1A6DFF' : colors.separator }} /></Pressable>)}
            </View>
            <Pressable accessibilityRole="button" onPress={() => step === 3 ? void finish() : go(step + 1)} disabled={finishing}
              style={({ pressed }) => [s.next, { backgroundColor: colors.label, opacity: pressed || finishing ? .65 : 1 }]}>
              <Text style={[s.nextText, { color: colors.background }]}>{slide.hint}</Text><Text style={[s.arrow, { color: colors.background }]} accessibilityElementsHidden>→</Text>
            </Pressable>
            {step > 0 && <Pressable accessibilityRole="button" onPress={() => go(step - 1)} style={s.back}><Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>Back</Text></Pressable>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', paddingBottom: 16 },
  phone: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { backgroundColor: '#1A6DFF', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingHorizontal: 26, paddingBottom: 14, overflow: 'hidden' },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { width: 112, height: 32 },
  skip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, skipText: { color: '#E0EDFF', fontSize: 13 },
  heading: { minHeight: 137, paddingTop: 16, paddingBottom: 12 }, kicker: { color: '#D9E8FF', fontSize: 11, letterSpacing: .5, textTransform: 'uppercase', fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 38, lineHeight: 42, fontWeight: '600', letterSpacing: -1.4, marginTop: 12 },
  scene: { height: 255, position: 'relative', marginHorizontal: -16, justifyContent: 'center', alignItems: 'center' },
  mainMascot: { zIndex: 2, paddingBottom: 15 }, halo: { position: 'absolute', width: 196, height: 196, borderRadius: 98, backgroundColor: '#FFFFFF16' },
  ring: { position: 'absolute', width: 252, height: 252, borderRadius: 126, borderWidth: 1, borderColor: '#FFFFFF25' },
  companion: { position: 'absolute', width: 70, height: 80, borderRadius: 20, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  lime: { left: 0, top: 45, transform: [{ rotate: '-13deg' }] }, violet: { right: 0, top: 125, transform: [{ rotate: '12deg' }] },
  tag: { position: 'absolute', zIndex: 3, backgroundColor: '#FFFDFA', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13 },
  goal: { top: 9, right: 5, transform: [{ rotate: '6deg' }] }, service: { bottom: 4, left: 8, transform: [{ rotate: '-6deg' }] }, tagText: { color: '#213B59', fontSize: 12 },
  prompt: { position: 'absolute', top: 0, left: 8, backgroundColor: '#FFFFFF20', padding: 12, borderRadius: 14, transform: [{ rotate: '3deg' }] }, promptText: { color: '#FFFFFF', fontSize: 13 },
  proposal: { position: 'absolute', left: 10, right: 32, top: 54, padding: 15, borderRadius: 18, transform: [{ rotate: '-4deg' }] },
  proposalKicker: { fontSize: 11, textTransform: 'uppercase' }, proposalTitle: { fontSize: 22, fontWeight: '600', marginTop: 7, marginBottom: 9 }, task: { fontSize: 13, marginVertical: 3 }, note: { fontSize: 11, marginTop: 8 },
  smallMascot: { position: 'absolute', right: -6, bottom: -2 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: '100%', paddingHorizontal: 6 },
  pick: { width: '30%', minHeight: 106, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 18, borderWidth: 1, borderColor: '#FFFFFF30', backgroundColor: '#FFFFFF18' },
  picked: { borderColor: '#DCF6A3', backgroundColor: '#FFFFFF35' }, pickLabel: { color: '#FFFFFF', fontSize: 12 },
  selection: { position: 'absolute', bottom: 0, alignItems: 'center', gap: 2, backgroundColor: '#173966B0', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14 }, selectionText: { color: '#EFFFD5', fontSize: 12 },
  footer: { paddingHorizontal: 26, paddingTop: 24, paddingBottom: 10 }, chapter: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  detail: { fontSize: 14, lineHeight: 22, minHeight: 48, marginTop: 10 }, dots: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginVertical: 4 }, dotHit: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  next: { minHeight: 52, paddingHorizontal: 17, paddingVertical: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  nextText: { fontSize: 14, fontWeight: '600', flex: 1 }, arrow: { fontSize: 22 }, back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
