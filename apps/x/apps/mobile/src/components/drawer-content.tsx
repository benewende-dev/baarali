import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sessions as sessionsShared } from '@x/shared';

import * as analytics from '@/lib/analytics';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

type Entry = sessionsShared.SessionIndexEntry;

// The drawer: chat history + search up top, Brain and the connection row at
// the foot — the Claude-app sidebar, minimal.
export function DrawerContent(props: DrawerContentComponentProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessions, events, status, pairing, unpair } = useConnection();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      const result = await sessions.list();
      // Space-thread sessions belong to Spaces, not the Mac chat list (main 9bc0e44e).
      setEntries(
        result.sessions
          .filter(sessionsShared.isChatListSession)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      );
    } catch {
      // keep the last list; the connection row shows the state
    }
  }, [sessions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!events) return;
    const offEvents = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => {
      offEvents();
      offResync();
    };
  }, [events, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => (e.title ?? '').toLowerCase().includes(q));
  }, [entries, query]);

  const openChat = (id?: string) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.replace({ pathname: '/chat', params: id ? { id } : { id: '' } });
    props.navigation.closeDrawer();
  };

  const paired = Boolean(pairing);
  const go = (path: '/baarasseurs' | '/spaces' | '/notes' | '/email' | '/tasks' | '/routines' | '/meetings' | '/projects' | '/apps' | '/settings') => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.push(path);
    props.navigation.closeDrawer();
  };
  const connected = status === 'connected';

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, backgroundColor: colors.background }}>
      {/* Search + new chat — the Mac chat's tools, present once paired */}
      {paired ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        <View
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: colors.secondaryBackground, borderRadius: 10,
            borderCurve: 'continuous', paddingHorizontal: 10, height: 36,
          }}
        >
          <Image source="sf:magnifyingglass" style={{ width: 14, height: 14 }} tintColor={colors.tertiaryLabel} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: colors.label }}
            placeholder="Search"
            placeholderTextColor={colors.tertiaryLabel}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
        </View>
        <Pressable hitSlop={8} onPress={() => openChat()}>
          <Image source="sf:square.and.pencil" style={{ width: 22, height: 22 }} tintColor={colors.label} />
        </Pressable>
      </View>
      ) : null}

      {/* BAARALI(06/10/2026): the destinations as tiles, as the validated mobile
          mockup draws them (claude.ai/artifact/5hiVQMibobFRRitE7ictcw). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 10 }}>
        {paired ? <Tile icon="sf:bubble.left" label="Chat" onPress={() => openChat()} /> : null}
        {paired ? <Tile icon="sf:person.2.fill" label="Baarasseurs" onPress={() => go('/baarasseurs')} /> : null}
        <Tile icon="sf:square.grid.2x2" label="Spaces" onPress={() => go('/spaces')} />
        {paired ? <Tile icon="sf:envelope" label="Email" onPress={() => go('/email')} /> : null}
        {paired ? <Tile icon="sf:checkmark.square" label="Tasks" onPress={() => go('/tasks')} /> : null}
        {paired ? <Tile icon="sf:clock" label="Routines" onPress={() => go('/routines')} /> : null}
        {paired ? <Tile icon="sf:mic" label="Meetings" onPress={() => go('/meetings')} /> : null}
        {paired ? <Tile icon="sf:books.vertical" label="Library" onPress={() => go('/notes')} /> : null}
        {paired ? <Tile icon="sf:folder" label="Projects" onPress={() => go('/projects')} /> : null}
        {paired ? <Tile icon="sf:square.grid.2x2.fill" label="Apps and prompts" onPress={() => go('/apps')} /> : null}
      </View>

      {/* History */}
      {paired ? (
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.sessionId}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openChat(item.sessionId)}
            style={({ pressed }) => ({
              minHeight: 42, justifyContent: 'center',
              paddingHorizontal: 10, borderRadius: 10, borderCurve: 'continuous',
              backgroundColor: pressed ? (colors.secondaryBackground) : 'transparent',
            })}
          >
            <Text numberOfLines={1} style={{ fontSize: 16, color: colors.label }}>
              {item.title || 'New chat'}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 32, fontSize: 14, color: colors.tertiaryLabel }}>
            {query ? 'No matches' : 'No chats yet'}
          </Text>
        }
      />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 }}>
          <Image source="sf:bubble.left.and.bubble.right" style={{ width: 30, height: 30 }} tintColor={colors.tertiaryLabel} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.secondaryLabel }}>Nothing here yet</Text>
          <Text style={{ fontSize: 13, textAlign: 'center', lineHeight: 18, color: colors.tertiaryLabel }}>
            Chats with your Mac and your Brain show up here once you connect your Mac.
          </Text>
        </View>
      )}

      {/* Foot: Brain, then the connection row */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: colors.separator, paddingTop: 6, paddingBottom: insets.bottom + 8, gap: 2 }}>
        {paired ? (
        <FootRow
          icon="sf:gearshape"
          label="Settings"
          onPress={() => go('/settings')}
        />
        ) : null}
        <FootRow
          icon="sf:bell"
          label="Notifications"
          onPress={() => {
            router.push('/notifications');
            props.navigation.closeDrawer();
          }}
        />
        {paired ? (
        <FootRow
          icon={connected ? 'sf:laptopcomputer' : 'sf:wifi.slash'}
          label={connected ? (pairing?.name ?? 'Connected') : 'Reconnecting…'}
          detail="Unpair"
          detailColor={colors.destructive}
          onDetail={() => {
            analytics.mobileUnpaired('user');
            void unpair().then(() => router.replace('/spaces'));
          }}
        />
        ) : (
        <FootRow
          icon="sf:laptopcomputer"
          label="Connect your Mac"
          onPress={() => {
            router.push('/pairing');
            props.navigation.closeDrawer();
          }}
        />
        )}
      </View>
    </View>
  );
}

function FootRow({ icon, label, onPress, detail, detailColor, onDetail }: {
  icon: string;
  label: string;
  onPress?: () => void;
  detail?: string;
  detailColor?: string;
  onDetail?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42,
        marginHorizontal: 8, paddingHorizontal: 8, borderRadius: 10, borderCurve: 'continuous',
        backgroundColor: pressed && onPress ? colors.secondaryBackground : 'transparent',
      })}
    >
      <View style={{ width: 28, alignItems: 'center' }}>
        <Image source={icon} style={{ width: 18, height: 18 }} tintColor={colors.secondaryLabel} />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.label }}>{label}</Text>
      {detail ? (
        <Pressable hitSlop={8} onPress={onDetail} style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, color: detailColor ?? colors.secondaryLabel }}>{detail}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** A destination tile: an icon over its name, three to a row. */
function Tile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: '31.5%', height: 72, borderRadius: 16, borderCurve: 'continuous',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: pressed ? colors.separator : colors.secondaryBackground,
      })}
    >
      <Image source={icon} style={{ width: 22, height: 22 }} tintColor={colors.label} />
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{label}</Text>
    </Pressable>
  );
}
