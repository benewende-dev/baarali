import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

// Spaces is a stack inside its tab: the org/space list → a space's chat
// pushes with a native back button (same shape as the notes section).
export default function SpacesLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: tint,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Spaces' }} />
      {/* Title set by the screen from its params; native back chevron, no label. */}
      <Stack.Screen name="chat" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="thread" options={{ title: 'Thread', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="files" options={{ title: 'Files', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="file" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  );
}
