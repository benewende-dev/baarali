import type { BottomTabBarProps } from 'expo-router/tabs';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnection } from '@/lib/connection';
import { useSpacesAccount } from '@/lib/spaces/account';
import { useColors } from '@/theme/colors';

// The tabs at the foot (Baarali, 07/10/2026, mockup artboards 15 and 16,
// claude.ai/artifact/5hiVQMibobFRRitE7ictcw): the everyday places one touch
// away, as in WhatsApp, instead of in a hidden menu; the rest is under More.
// Shown on each tab's first screen only: a thread or an email has the room.

export const TABS = [
  { name: 'home', label: 'Rowboat', icon: 'sf:bubble.left.and.bubble.right', active: 'sf:bubble.left.and.bubble.right.fill' },
  { name: 'email', label: 'Email', icon: 'sf:envelope', active: 'sf:envelope.fill' },
  { name: 'meetings', label: 'Meetings', icon: 'sf:mic', active: 'sf:mic.fill' },
  { name: 'spaces', label: 'Spaces', icon: 'sf:square.grid.2x2', active: 'sf:square.grid.2x2.fill' },
  { name: 'more', label: 'More', icon: 'sf:ellipsis.circle', active: 'sf:ellipsis.circle.fill' },
] as const;

const TAB_NAMES = new Set<string>(TABS.map((t) => t.name));

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { pairing } = useConnection();
  const account = useSpacesAccount();

  const focused = state.routes[state.index];
  // Deeper than a tab's first screen (a space's chat, an email): no bar.
  const nested = (focused.state?.index ?? 0) > 0;
  // Nobody signed in yet (onboarding, the sign-in screen): nothing to switch to.
  const someone = Boolean(pairing) || account.status === 'signedIn';
  if (!TAB_NAMES.has(focused.name) || nested || !someone) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 0.5,
        borderTopColor: colors.separator,
        backgroundColor: colors.background,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {TABS.map((tab) => {
        const index = state.routes.findIndex((r) => r.name === tab.name);
        const route = state.routes[index];
        if (!route) return null;
        const selected = state.index === index;
        const tint = selected ? colors.accent : colors.secondaryLabel;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
          navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={tab.name}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2, minHeight: 44 }}
          >
            <Image source={selected ? tab.active : tab.icon} style={{ width: 24, height: 24 }} tintColor={tint} />
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: selected ? '600' : '500', color: tint }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
