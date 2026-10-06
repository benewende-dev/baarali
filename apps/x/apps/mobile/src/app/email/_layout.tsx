import { Stack } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { Pressable, useColorScheme } from 'react-native';
import { Image } from 'expo-image';

// BAARALI(06/10/2026): the mailbox, a stack inside the drawer: the list → a thread.
export default function EmailLayout() {
  const tint = useColorScheme() === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: tint }}>
      <Stack.Screen
        name="index"
        options={({ navigation }) => ({
          title: 'Email',
          headerLargeTitle: true,
          headerLeft: () => (
            <Pressable onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={10}>
              <Image source="sf:line.3.horizontal" style={{ width: 22, height: 22 }} tintColor={tint} />
            </Pressable>
          ),
        })}
      />
      <Stack.Screen name="thread" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  );
}
