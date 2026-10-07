import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

// BAARALI(06/10/2026): the mailbox, a stack inside its tab: the list → a thread.
export default function EmailLayout() {
  const tint = useColorScheme() === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: tint }}>
      <Stack.Screen name="index" options={{ title: 'Email', headerLargeTitle: true }} />
      <Stack.Screen name="thread" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  );
}
