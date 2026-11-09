import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { baarasseurs as shared } from '@x/shared';

import { BaaraliMark } from '@/components/baarali-mark';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { LivingShape, SHAPE_FILL, saveLook } from '@/components/agent-shape';
import { APEX_URL } from '@/lib/spaces/account';

// BAARALI(07/11/2026): the first launch as Grok Bot opens (the founder's
// call): a black screen where the Baarali shapes look around, « Get
// started », then the person picks their Baarali (a shape, a colour), then
// sign-in. Getting to know each other happens in the first conversation.
export const ONBOARDED_KEY = 'rowboat.onboarded.v1';

const INK = '#0A0A0A';
const PARADE: Array<{ shape: shared.AgentShapeId; color: string }> = [
  { shape: 'cloud', color: 'violet' }, { shape: 'pebble', color: 'orange' }, { shape: 'drop', color: 'blue' },
  { shape: 'kite', color: 'green' }, { shape: 'dome', color: 'rose' },
];
const tap = () => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); };

export default function Welcome() {
  const [step, setStep] = useState<'hello' | 'look'>('hello');
  const [shape, setShape] = useState<shared.AgentShapeId>('b');
  const [color, setColor] = useState('white');
  const [leaving, setLeaving] = useState(false);

  const finish = async () => {
    if (leaving) return;
    setLeaving(true);
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveLook({ shape, color });
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
    router.replace(APEX_URL ? '/spaces' : '/pairing');
  };

  const button = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" disabled={leaving} onPress={onPress}
    style={({ pressed }) => ({ height: 58, marginBottom: 12, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', opacity: pressed || leaving ? 0.8 : 1 })}>
    <Text style={{ fontSize: 18, fontWeight: '600', color: INK }}>{translate(label)}</Text>
  </Pressable>;

  return <View style={{ flex: 1, backgroundColor: INK }}>
    <StatusBar style="light" />
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }}>
      {step === 'hello' ? <>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
          <BaaraliMark size={120} motion="loading" color="#FFFFFF" />
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text accessibilityRole="header" style={{ fontSize: 40, fontWeight: '600', letterSpacing: -1.2, color: '#FFFFFF' }}>Baarali</Text>
            <Text style={{ fontSize: 18, lineHeight: 26, textAlign: 'center', color: '#B5B5B5' }}>Agents that work for you. You stay in control.</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 18 }}>
            {PARADE.map((p, i) => <LivingShape key={p.shape} shape={p.shape} color={p.color} size={i === 2 ? 58 : 46} bob offset={i * 380} />)}
          </View>
        </View>
        {button('Get started', () => { tap(); setStep('look'); })}
      </> : <>
        <LookPicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
        {button('Continue', () => void finish())}
      </>}
    </SafeAreaView>
  </View>;
}

/** The chooser, also opened from the settings (look.tsx). */
export function LookPicker({ shape, color, onShape, onColor }: {
  shape: shared.AgentShapeId; color: string; onShape: (s: shared.AgentShapeId) => void; onColor: (c: string) => void;
}) {
  const setShape = (s: shared.AgentShapeId) => onShape(s);
  const setColor = (c: string) => onColor(c);
  return <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ marginTop: 28, fontSize: 28, fontWeight: '600', textAlign: 'center', color: '#FFFFFF' }}>Choose your Baarali</Text>
        <Text style={{ marginTop: 8, fontSize: 16, textAlign: 'center', color: '#B5B5B5' }}>Its face in the app. You can change it later.</Text>
        <ScrollView contentContainerStyle={{ paddingVertical: 24, gap: 26 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center' }}><LivingShape key={shape + color} shape={shape} color={color} size={150} /></View>
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
        </ScrollView>
  </View>;
}
