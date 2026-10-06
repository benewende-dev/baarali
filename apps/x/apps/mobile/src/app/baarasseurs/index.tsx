import { Redirect, router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';

import { ChatView } from '@/app/chat';
import { BaarasseurAvatar, TWO_PANES_AT, phoneLang, useBaarasseurs, type Baarasseur } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the baarasseurs as contacts, as WhatsApp lists them
// (the founder's call, validated mockup claude.ai/artifact/5hiVQMibobFRRitE7ictcw):
// the face, the name, the latest conversation and its time, then templates to
// recruit from. On a phone a tap opens the conversation; on a wide screen (a
// foldable opened, iPhone Duo or Galaxy Z Fold) it opens beside the list.

type Entry = sessionsShared.SessionIndexEntry;

function when(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function BaarasseursScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_PANES_AT;
  const { pairing, sessions, events } = useConnection();
  const { team, reload } = useBaarasseurs();
  // Read again on each visit: the computer may have changed the team.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const [entries, setEntries] = useState<Entry[]>([]);
  // On a wide screen: the open conversation (its baarasseur, and its session once there is one).
  const [open, setOpen] = useState<{ agent: string; id: string | null } | null>(null);

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      setEntries((await sessions.list()).sessions);
    } catch {
      // keep the last list
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => (events ? events.on('sessions:events', () => void refresh()) : undefined), [events, refresh]);

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
  const templates = shared.TEMPLATES.filter((t) => !(team ?? []).some((b) => b.name === t.name));
  const lang = phoneLang();

  if (pairing === null) return <Redirect href="/pairing" />;

  const openOne = (b: Baarasseur, last: Entry | null) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    const agent = shared.baarasseurAgentId(b.id);
    if (wide) setOpen({ agent, id: last?.sessionId ?? null });
    else router.push({ pathname: '/chat', params: { id: last?.sessionId ?? '', agent } });
  };

  const list = team === null ? (
    <ActivityIndicator style={{ marginTop: 32 }} />
  ) : (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.b.id}
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 80, backgroundColor: colors.separator }} />}
      renderItem={({ item: { b, last } }) => {
        const active = open?.agent === shared.baarasseurAgentId(b.id);
        return (
          <Pressable
            onPress={() => openOne(b, last)}
            onLongPress={() => router.push({ pathname: '/baarasseurs/recruit', params: { id: b.id } })}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
              backgroundColor: pressed || active ? colors.secondaryBackground : 'transparent',
            })}
          >
            <BaarasseurAvatar b={b} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.label }}>{b.name}</Text>
                {last ? <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(last.updatedAt)}</Text> : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 15, color: colors.secondaryLabel }}>{last?.title || b.role}</Text>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32, marginTop: 32 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>No baarasseur yet</Text>
          <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 20, color: colors.tertiaryLabel }}>
            Recruit your first one: describe it in a sentence, or start from a template below.
          </Text>
        </View>
      }
      ListFooterComponent={
        templates.length > 0 ? (
          <View style={{ paddingTop: 20, paddingBottom: 32, gap: 8 }}>
            <Text style={{ paddingHorizontal: 16, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>Start from a template</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {templates.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push({ pathname: '/baarasseurs/recruit', params: { template: t.id } })}
                  style={{ width: 140, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.separator, padding: 12, gap: 6 }}
                >
                  <BaarasseurAvatar b={{ name: t.name, color: t.color }} size={36} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>{t.name}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 13, color: colors.secondaryLabel }}>{t.role[lang]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null
      }
    />
  );

  if (!wide) return <View style={{ flex: 1, backgroundColor: colors.background }}>{list}</View>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <View style={{ width: 340, borderRightWidth: 0.5, borderRightColor: colors.separator }}>{list}</View>
      <View style={{ flex: 1 }}>
        {open ? (
          <ChatView
            key={open.agent}
            id={open.id}
            agent={open.agent}
            embedded
            onCreated={(sessionId) => setOpen((o) => (o ? { ...o, id: sessionId } : o))}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 15, color: colors.tertiaryLabel, textAlign: 'center' }}>Pick a baarasseur to write to.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
