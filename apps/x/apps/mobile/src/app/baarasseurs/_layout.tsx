import { Stack, router } from 'expo-router';
import { Pressable, Text, useColorScheme } from 'react-native';

import { BackButton } from '@/components/back-button';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the baarasseurs, a stack pushed over the tabs:
// the list → recruiting (or editing) one, presented as a sheet.
export default function BaarasseursLayout() {
  const colorScheme = useColorScheme();
  const colors = useColors();
  const tint = colorScheme === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: tint }}>
      <Stack.Screen
        name="index"
        options={() => ({
          title: 'Baarasseurs',
          headerLargeTitle: true,
          headerLeft: () => <BackButton />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/baarasseurs/recruit')} hitSlop={8}
              style={{ backgroundColor: colors.accent, borderRadius: 17, paddingHorizontal: 14, height: 34, justifyContent: 'center' }}>
              <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 15 }}>Recruit</Text>
            </Pressable>
          ),
        })}
      />
      <Stack.Screen name="recruit" options={{ presentation: 'modal', title: 'Recruit' }} />
    </Stack>
  );
}
