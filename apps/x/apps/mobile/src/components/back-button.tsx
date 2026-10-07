import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, useColorScheme } from 'react-native';

// The way back for the first screen of a section that has its own stack
// (Baarasseurs, Library): the native button only knows its own stack, and
// this one was pushed over the tabs.
export function BackButton() {
  const tint = useColorScheme() === 'dark' ? '#ffffff' : '#000000';
  return (
    // Opened straight from a notification, there is nothing behind: home.
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
      <Image source="sf:chevron.left" style={{ width: 20, height: 20 }} contentFit="contain" tintColor={tint} />
    </Pressable>
  );
}
