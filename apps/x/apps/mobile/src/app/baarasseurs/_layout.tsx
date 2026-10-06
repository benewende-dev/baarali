import { Stack, router } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { Pressable, Text, useColorScheme } from 'react-native';
import { Image } from 'expo-image';

import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the baarasseurs, a stack inside the drawer like Spaces:
// the list → recruiting (or editing) one, presented as a sheet.
export default function BaarasseursLayout() {
  const colorScheme = useColorScheme();
  const colors = useColors();
  const tint = colorScheme === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: tint }}>
      <Stack.Screen
        name="index"
        options={({ navigation }) => ({
          title: 'Baarasseurs',
          headerLargeTitle: true,
          headerLeft: () => (
            <Pressable onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={10}>
              <Image source="sf:line.3.horizontal" style={{ width: 22, height: 22 }} tintColor={tint} />
            </Pressable>
          ),
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
