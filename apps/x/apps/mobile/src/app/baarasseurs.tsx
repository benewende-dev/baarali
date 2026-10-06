import { Redirect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';

import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the baarasseurs as contacts, as WhatsApp lists them
// (the founder's call): the face, the name, the latest conversation and its
// time. A tap opens its latest chat, or a fresh one with it. They are
// recruited and set up on the computer; the list reads the same workspace file.

type Baarasseur = shared.Baarasseur;
type Entry = sessionsShared.SessionIndexEntry;

/** The desktop's avatar tints, as light ground + dark ink (and the reverse at night). */
const TINTS: Record<string, [string, string, string, string]> = {
  clay: ['#ffedd5', '#9a3412', 'rgba(249,115,22,0.2)', '#fdba74'],
  blue: ['#dbeafe', '#1e40af', 'rgba(59,130,246,0.2)', '#93c5fd'],
  green: ['#d1fae5', '#065f46', 'rgba(16,185,129,0.2)', '#6ee7b7'],
  violet: ['#ede9fe', '#5b21b6', 'rgba(139,92,246,0.2)', '#c4b5fd'],
  rose: ['#ffe4e6', '#9f1239', 'rgba(244,63,94,0.2)', '#fda4af'],
  amber: ['#fef3c7', '#78350f', 'rgba(245,158,11,0.2)', '#fcd34d'],
  teal: ['#ccfbf1', '#115e59', 'rgba(20,184,166,0.2)', '#5eead4'],
};

export function BaarasseurAvatar({ b, size = 48 }: { b: Pick<Baarasseur, 'name' | 'color'>; size?: number }) {
  const dark = useColorScheme() === 'dark';
  const [bg, fg, bgDark, fgDark] = TINTS[b.color] ?? TINTS.clay;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? bgDark : bg }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: dark ? fgDark : fg }}>{(b.name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/** The team, read from the Mac's workspace; null while loading. */
export function useBaarasseurs(): Baarasseur[] | null {
  const { rpc, status } = useConnection();
  const [team, setTeam] = useState<Baarasseur[] | null>(null);
  useEffect(() => {
    if (!rpc || status !== 'connected') return;
    let live = true;
    rpc.call('workspace:readFile', { path: shared.BAARASSEURS_PATH }).then(
      (r) => live && setTeam(shared.parseBaarasseurs((r as { data?: string }).data)),
      () => live && setTeam([]),
    );
    return () => { live = false; };
  }, [rpc, status]);
  return team;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function BaarasseursScreen() {
  const colors = useColors();
  const { pairing, sessions, events } = useConnection();
  const team = useBaarasseurs();
  const [entries, setEntries] = useState<Entry[]>([]);

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      setEntries((await sessions.list()).sessions);
    } catch {
      // keep the last list
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const off = events.on('sessions:events', () => void refresh());
    return off;
  }, [events, refresh]);

  // The newest conversation of each, and the latest first, as in a messenger.
  const rows = useMemo(() => {
    const latest = new Map<string, Entry>();
    for (const e of entries) {
      const agent = e.lastAgentId;
      if (!agent || !shared.baarasseurIdOf(agent)) continue;
      const prev = latest.get(agent);
      if (!prev || e.updatedAt > prev.updatedAt) latest.set(agent, e);
    }
    return (team ?? [])
      .map((b) => ({ b, last: latest.get(shared.baarasseurAgentId(b.id)) ?? null }))
      .sort((x, y) => (y.last?.updatedAt ?? y.b.createdAt).localeCompare(x.last?.updatedAt ?? x.b.createdAt));
  }, [team, entries]);

  if (pairing === null) return <Redirect href="/pairing" />;

  const open = (b: Baarasseur, last: Entry | null) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.push({ pathname: '/chat', params: { id: last?.sessionId ?? '', agent: shared.baarasseurAgentId(b.id) } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      {team === null ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.b.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 76, backgroundColor: colors.separator }} />}
          renderItem={({ item: { b, last } }) => (
            <Pressable
              onPress={() => open(b, last)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
                backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
              })}
            >
              <BaarasseurAvatar b={b} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.label }}>{b.name}</Text>
                  {last ? <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(last.updatedAt)}</Text> : null}
                </View>
                <Text numberOfLines={1} style={{ fontSize: 15, color: colors.secondaryLabel }}>{last?.title || b.role}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32, marginTop: 48 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>No baarasseur yet</Text>
              <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 20, color: colors.tertiaryLabel }}>
                Recruit them in Baarali on your computer: they show up here, like contacts.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
