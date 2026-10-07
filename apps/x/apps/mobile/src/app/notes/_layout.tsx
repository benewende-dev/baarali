import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { BackButton } from '@/components/back-button';

// Notes are a stack pushed over the tabs: Library (tree) → note pushes with a
// native back button. A note opened straight from elsewhere (a meeting) is
// the stack's first screen, so it brings its own way back.
export default function NotesLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#ffffff' : '#000000';
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: tint,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Library', headerLeft: () => <BackButton /> }}
      />
      {/* Native back chevron, no label. */}
      <Stack.Screen
        name="view"
        options={({ navigation }) => ({
          title: 'Note',
          headerBackButtonDisplayMode: 'minimal',
          // This stack's own history: canGoBack() would also count the tabs under it.
          ...(navigation.getState().index > 0 ? {} : { headerLeft: () => <BackButton /> }),
        })}
      />
    </Stack>
  );
}
