import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { BaaraliMark } from '@/components/baarali-mark';
import { APEX_URL } from '@/lib/spaces/account';

// BAARALI(07/11/2026): the first launch as Grok Bot opens (the founder's
// call): one black screen, the B looking around, one sentence, « Get
// started », then sign-in. Getting to know each other happens later, in
// the first conversation with Baarali, not in forms.
export const ONBOARDED_KEY = 'rowboat.onboarded.v1';

export default function Welcome() {
  const [leaving, setLeaving] = useState(false);
  const start = async () => {
    if (leaving) return;
    setLeaving(true);
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
    router.replace(APEX_URL ? '/spaces' : '/pairing');
  };
  return <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
    <StatusBar style="light" />
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 28 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <BaaraliMark size={132} motion="loading" color="#FFFFFF" />
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Text accessibilityRole="header" style={{ fontSize: 40, fontWeight: '600', letterSpacing: -1.2, color: '#FFFFFF' }}>Baarali</Text>
          <Text style={{ fontSize: 18, lineHeight: 26, textAlign: 'center', color: '#B5B5B5' }}>Agents that work for you. You stay in control.</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" disabled={leaving} onPress={() => void start()}
        style={({ pressed }) => ({ height: 58, marginBottom: 12, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', opacity: pressed || leaving ? 0.8 : 1 })}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#0A0A0A' }}>Get started</Text>
      </Pressable>
    </SafeAreaView>
  </View>;
}
