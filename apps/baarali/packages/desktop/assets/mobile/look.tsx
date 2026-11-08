import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { LookPicker } from '@/components/baarali-welcome';
import { saveLook, useLook } from '@/components/agent-shape';

// BAARALI(07/11/2026): changing the face of one's Baarali, from the settings,
// with the onboarding's chooser.
export default function LookScreen() {
  const current = useLook();
  const [shape, setShape] = useState(current?.shape ?? 'b');
  const [color, setColor] = useState(current?.color ?? 'white');
  return <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
    <StatusBar style="light" />
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }}>
      <LookPicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
      <Pressable accessibilityRole="button" onPress={() => { void saveLook({ shape, color }); router.back(); }}
        style={({ pressed }) => ({ height: 58, marginBottom: 12, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#0A0A0A' }}>Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 16, color: '#B5B5B5' }}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  </View>;
}
