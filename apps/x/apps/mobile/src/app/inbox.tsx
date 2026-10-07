import { router, Stack } from 'expo-router';
import { Linking, FlatList, Pressable, Text, View } from 'react-native';
import type { Notice } from '@x/shared/dist/billing.js';

import { useConsoleMessages } from '@/lib/console-messages';
import { useColors } from '@/theme/colors';

// The bell's messages on the phone (Baarali, 07/10/2026), written in the
// admin console, the same the Mac lists. Tapping one reads it; its button
// (or the message, when it has none) leads where it says.

function when(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function follow(n: Notice): void {
  if (n.target === 'chat') router.push({ pathname: '/chat', params: { id: '' } });
  // The plan and the week's use live in Settings on the phone.
  else if (n.target === 'plans' || n.target === 'usage') router.push('/settings');
  else if (n.target === 'link' && n.link?.startsWith('https://')) void Linking.openURL(n.link);
}

export default function InboxScreen() {
  const colors = useColors();
  const { notices, unread, noticeEvent, readAll } = useConsoleMessages();

  const tap = (n: Notice) => {
    if (n.target !== 'none' && !n.button) {
      noticeEvent(n.id, 'click');
      follow(n);
    } else noticeEvent(n.id, 'read');
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={readAll} accessibilityRole="button" hitSlop={8}>
                <Text style={{ fontSize: 16, color: colors.label }}>Read all</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={notices}
        keyExtractor={(n) => n.id}
        ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 36, backgroundColor: colors.separator }} />}
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => tap(n)}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.secondaryBackground : 'transparent' })}
          >
            <View style={{ width: 8, height: 8, marginTop: 7, borderRadius: 4, backgroundColor: n.read ? 'transparent' : colors.label }} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: n.read ? '500' : '700', color: colors.label }}>{n.title}</Text>
                <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>{when(n.sentAt)}</Text>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 20, color: colors.secondaryLabel }}>{n.body}</Text>
              {n.button && n.target !== 'none' ? (
                <Pressable
                  onPress={() => {
                    noticeEvent(n.id, 'click');
                    follow(n);
                  }}
                  accessibilityRole="button"
                  style={{ alignSelf: 'flex-start', marginTop: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.accent }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onAccent }}>{n.button}</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 48, paddingHorizontal: 32, fontSize: 15, lineHeight: 20, color: colors.tertiaryLabel }}>
            No notifications yet
          </Text>
        }
      />
    </>
  );
}
