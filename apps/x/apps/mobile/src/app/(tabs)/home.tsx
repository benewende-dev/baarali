import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';

import { AnnouncementBanner } from '@/components/announcement-banner';
import { BaarasseurAvatar, useBaarasseurs, type Baarasseur } from '@/lib/baarasseurs';
import { useConsoleMessages } from '@/lib/console-messages';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(07/10/2026): the home tab, one place to ask (mockup artboard 15,
// claude.ai/artifact/5hiVQMibobFRRitE7ictcw): ask or talk, and Rowboat takes
// care of it; the baarasseurs in a row with « Create » first, as on the
// computer; then every chat, Rowboat's and theirs, the newest first.

type Entry = sessionsShared.SessionIndexEntry;

function when(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const tap = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { pairing, sessions, events } = useConnection();
  const { team, reload } = useBaarasseurs();
  const { unread } = useConsoleMessages();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      // Space-thread sessions belong to Spaces, not this list (main 9bc0e44e).
      setEntries((await sessions.list()).sessions.filter(sessionsShared.isChatListSession));
    } catch {
      // keep the last list
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const offEvents = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => {
      offEvents();
      offResync();
    };
  }, [events, refresh]);
  // The computer may have changed the team.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const chats = useMemo(() => [...entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)), [entries]);
  const byAgent = useMemo(() => new Map((team ?? []).map((b) => [shared.baarasseurAgentId(b.id), b])), [team]);

  const openChat = (params: { id?: string; agent?: string; talk?: '1' }) => {
    tap();
    router.push({ pathname: '/chat', params: { id: '', ...params } });
  };
  // A baarasseur's face opens its latest chat, as a contact does.
  const openBaarasseur = (b: Baarasseur) => {
    const agent = shared.baarasseurAgentId(b.id);
    const last = chats.find((e) => e.lastAgentId === agent);
    openChat({ id: last?.sessionId ?? '', agent });
  };

  if (!pairing) {
    // Signed in to Spaces only: the chats need the person's instance.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, backgroundColor: colors.background }}>
        <Image source="sf:bubble.left.and.bubble.right" style={{ width: 34, height: 34 }} tintColor={colors.tertiaryLabel} />
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>Connect your computer</Text>
        <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 20, color: colors.tertiaryLabel }}>
          Your chats and your baarasseurs show up here once the phone is linked to your Rowboat.
        </Text>
        <Pressable
          onPress={() => router.push('/pairing')}
          style={{ marginTop: 6, height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.accent }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>Connect</Text>
        </Pressable>
      </View>
    );
  }

  const head = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <Text style={{ flex: 1, fontSize: 32, fontWeight: '700', color: colors.label }}>Rowboat</Text>
        {/* BAARALI(07/10/2026): the admin console's messages. */}
        <Pressable
          onPress={() => { tap(); router.push('/inbox'); }}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={6}
          style={{ width: 44, height: 44, marginRight: 8, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}
        >
          <Image source="sf:bell" style={{ width: 18, height: 18 }} contentFit="contain" tintColor={colors.label} />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.destructive }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#ffffff' }}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        {/* BAARALI(10/10/2026): « New chat » in words, as on the computer (mockup validated). */}
        <Pressable
          onPress={() => openChat({})}
          accessibilityRole="button"
          hitSlop={6}
          style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent }}
        >
          <Image source="sf:plus" style={{ width: 14, height: 14 }} contentFit="contain" tintColor={colors.onAccent} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onAccent }}>New chat</Text>
        </Pressable>
      </View>

      <AnnouncementBanner />

      {/* Ask in words, or tap the wave and talk. */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
        <Pressable
          onPress={() => openChat({})}
          accessibilityRole="button"
          style={{ flex: 1, height: 52, borderRadius: 26, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: colors.secondaryBackground }}
        >
          <Text numberOfLines={1} style={{ fontSize: 16, color: colors.tertiaryLabel }}>Ask, Rowboat takes care of it…</Text>
        </Pressable>
        <Pressable
          onPress={() => openChat({ talk: '1' })}
          accessibilityRole="button"
          accessibilityLabel="Talk with Rowboat"
          style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}
        >
          <Image source="sf:waveform" style={{ width: 22, height: 22 }} contentFit="contain" tintColor={colors.onAccent} />
        </Pressable>
      </View>

      <Text style={{ paddingHorizontal: 16, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>Your baarasseurs</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
        <Pressable onPress={() => { tap(); router.push('/baarasseurs/recruit'); }} accessibilityRole="button" style={{ width: 60, alignItems: 'center', gap: 5 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Image source="sf:plus" style={{ width: 20, height: 20 }} contentFit="contain" tintColor={colors.accent} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>Create</Text>
        </Pressable>
        {(team ?? []).map((b) => (
          <Pressable
            key={b.id}
            onPress={() => openBaarasseur(b)}
            onLongPress={() => router.push({ pathname: '/baarasseurs/recruit', params: { id: b.id } })}
            accessibilityRole="button"
            accessibilityLabel={b.name}
            style={{ width: 60, alignItems: 'center', gap: 5 }}
          >
            <BaarasseurAvatar b={b} size={56} />
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: colors.label }}>{b.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={{ paddingHorizontal: 16, paddingTop: 6, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>Chats</Text>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 16 }}
      data={chats}
      keyExtractor={(e) => e.sessionId}
      ListHeaderComponent={head}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([refresh(), reload()]);
            setRefreshing(false);
          }}
        />
      }
      renderItem={({ item }) => {
        const b = item.lastAgentId ? byAgent.get(item.lastAgentId) : undefined;
        return (
          <Pressable
            onPress={() => openChat({ id: item.sessionId })}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
              backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
            })}
          >
            {b ? (
              <BaarasseurAvatar b={b} size={44} />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
                <Image source="sf:sparkles" style={{ width: 20, height: 20 }} contentFit="contain" tintColor={colors.accent} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>{item.title || 'New chat'}</Text>
              <Text numberOfLines={1} style={{ fontSize: 14, color: colors.secondaryLabel }}>{b ? `${b.name} · ${b.role}` : 'Rowboat'}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>{when(item.updatedAt)}</Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', marginTop: 24, paddingHorizontal: 32, fontSize: 15, lineHeight: 20, color: colors.tertiaryLabel }}>
          No chats yet. Ask anything above, or tap the wave and talk.
        </Text>
      }
    />
  );
}
