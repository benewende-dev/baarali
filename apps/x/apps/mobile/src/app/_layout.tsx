import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BackButton } from '@/components/back-button';
import { registerWithMac } from '@/lib/push';
import { useConnection } from '@/lib/connection';
import { ConnectionProvider } from '@/lib/connection';
import { SpacesAccountProvider } from '@/lib/spaces/account';

SplashScreen.preventAutoHideAsync();

// BAARALI(07/10/2026): tabs at the foot instead of the drawer (the founder's
// call, mockup claude.ai/artifact/5hiVQMibobFRRitE7ictcw, artboards 15 and
// 16): the everyday places in (tabs), everything else pushed over them with
// a native back button.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Nothing else hides the native splash — without this the release build
  // sits on the logo forever (Expo Go masks it).
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ConnectionProvider>
          <SpacesAccountProvider>
          <PushRegistrar />
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerTintColor: colorScheme === 'dark' ? '#ffffff' : '#000000',
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            {/* Home just redirects into the tabs (or first-launch onboarding). */}
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
            {/* Floating way back: transparent header, no divider (iOS draws the glass). */}
            <Stack.Screen
              name="chat"
              options={{
                headerTransparent: true,
                headerTitle: '',
                headerBackVisible: false,
                headerLeft: () => <BackButton />,
              }}
            />
            <Stack.Screen name="baarasseurs" options={{ headerShown: false }} />
            <Stack.Screen name="notes" options={{ headerShown: false }} />
            <Stack.Screen name="tasks" options={{ title: 'Tasks' }} />
            <Stack.Screen name="routines" options={{ title: 'Routines' }} />
            <Stack.Screen name="projects" options={{ title: 'Projects' }} />
            <Stack.Screen name="apps" options={{ title: 'Apps and prompts' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            {/* BAARALI(07/10/2026): the admin console's messages, behind the home tab's bell. */}
            <Stack.Screen name="inbox" options={{ title: 'Notifications' }} />
            <Stack.Screen name="pairing" options={{ title: '' }} />
            <Stack.Screen name="pair-dev" options={{ headerShown: false }} />
          </Stack>
          </SpacesAccountProvider>
        </ConnectionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Re-register the phone's push token + level whenever the Mac connects —
// tokens rotate and prefs change; the call is idempotent.
function PushRegistrar() {
  const { rpc, status } = useConnection();
  useEffect(() => {
    if (status === 'connected' && rpc) void registerWithMac(rpc).catch(() => {});
  }, [status, rpc]);
  return null;
}
