import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaaraliMark } from '@/components/baarali-mark';
import { useConnection } from '@/lib/connection';
import { NOTIFY_INTRO_KEY, registerWithMac } from '@/lib/push';
import { useColors } from '@/theme/colors';

// BAARALI(07/11/2026): why the agents need notifications, said before
// iPhone asks (the founder's call). The system question only comes on
// « Allow »; « Later » leaves it to the settings.
export default function NotifyIntro() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [busy, setBusy] = useState(false);
  const decide = async (allow: boolean) => {
    if (busy) return;
    setBusy(true);
    await AsyncStorage.setItem(NOTIFY_INTRO_KEY, allow ? 'yes' : 'later').catch(() => {});
    if (allow) {
      await Notifications.requestPermissionsAsync().catch(() => undefined);
      if (rpc) await registerWithMac(rpc).catch(() => undefined);
    }
    router.back();
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 }}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      <BaaraliMark size={88} motion="loading" />
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '600', textAlign: 'center', color: colors.label }}>Stay in the loop</Text>
      <Text style={{ fontSize: 17, lineHeight: 25, textAlign: 'center', color: colors.secondaryLabel }}>
        Your agents write to you when something deserves your attention: the morning brief, a request for your approval.
      </Text>
    </View>
    <View style={{ gap: 10, marginBottom: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void decide(true)}
        style={({ pressed }) => ({ height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.label, opacity: pressed || busy ? 0.8 : 1 })}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.background }}>Allow</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void decide(false)} style={{ height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: colors.secondaryLabel }}>Later</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}
