import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { baarasseurs as team, sessions as sessionsShared } from '@x/shared';

import { AnnouncementBanner } from '@/components/announcement-banner';
import { BaaraliMark } from '@/components/baarali-mark';
import { BaarasseurAvatar, useBaarasseurs, type Baarasseur } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { NOTIFY_INTRO_KEY } from '@/lib/push';
import { searchKey } from '@/lib/team-directory';
import { useWorkAccess } from '@/lib/work-access-provider';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

type Entry = sessionsShared.SessionIndexEntry;

const tap = () => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); };

/** Today the hour, this week the day's name, before that the date. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** « benewende.yann@… » → BY, as Grok Bot shows who is signed in. */
export function initials(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase() || '·';
}

/** A chat waits for the person when its latest turn stopped to ask. */
const waits = (entry?: Entry) => entry?.latestTurnStatus === 'suspended';

// BAARALI(07/11/2026): the home as Grok Bot's (the founder's call): who you
// are and « + » on top, Baarali in the middle, then your agents, each with
// its latest conversation, and only « apps » and search at the foot.
// Everything else is behind the account (settings.tsx).
export default function HomeScreen() {
  const colors = useColors();
  const { pairing, sessions, events, rpc } = useConnection();
  const { team: agents, reload } = useBaarasseurs();
  const { access } = useWorkAccess();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [email, setEmail] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<TextInput>(null);

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      const list = (await sessions.list()).sessions.filter(sessionsShared.isChatListSession);
      setEntries(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {
      // Keep the last list while the computer reconnects.
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const offEvents = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => { offEvents(); offResync(); };
  }, [events, refresh]);
  useEffect(() => {
    if (!rpc) return;
    let alive = true;
    void rpc.call('billing:getInfo', null).then(info => { if (alive) setEmail(info.userEmail ?? undefined); }, () => {});
    return () => { alive = false; };
  }, [rpc]);
  useFocusEffect(useCallback(() => { void reload(); void refresh(); }, [reload, refresh]));
  // Once linked, say why notifications matter before iPhone asks (notify-intro.tsx).
  useEffect(() => {
    if (!pairing) return;
    let alive = true;
    void (async () => {
      const asked = await AsyncStorage.getItem(NOTIFY_INTRO_KEY).catch(() => 'later');
      if (asked || !alive) return;
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
      if (granted || !canAskAgain) { await AsyncStorage.setItem(NOTIFY_INTRO_KEY, granted ? 'yes' : 'later').catch(() => {}); return; }
      if (alive) router.push('/notify-intro');
    })();
    return () => { alive = false; };
  }, [pairing]);

  // Each agent's latest conversation; Baarali's are the ones no agent had.
  const latest = useMemo(() => {
    const byAgent = new Map<string, Entry>();
    let mine: Entry | undefined;
    for (const entry of entries) {
      const id = team.baarasseurIdOf(entry.lastAgentId);
      if (id) { if (!byAgent.has(id)) byAgent.set(id, entry); } else if (!mine) mine = entry;
    }
    return { byAgent, mine };
  }, [entries]);
  const rows = useMemo(() => [...(agents ?? [])].sort((a, b) =>
    (latest.byAgent.get(b.id)?.updatedAt ?? b.createdAt).localeCompare(latest.byAgent.get(a.id)?.updatedAt ?? a.createdAt)), [agents, latest]);
  const byId = useMemo(() => new Map((agents ?? []).map(b => [b.id, b])), [agents]);
  const needle = searchKey(query);
  const found = useMemo(() => entries.filter(e => {
    if (!needle) return true;
    const b = byId.get(team.baarasseurIdOf(e.lastAgentId) ?? '');
    return searchKey(`${e.title ?? ''} ${b?.name ?? ''}`).includes(needle);
  }), [entries, needle, byId]);

  const openChat = (params: { id?: string; agent?: string; first?: '1' }) => {
    tap(); Keyboard.dismiss();
    router.push({ pathname: '/chat', params: { id: '', ...params } });
  };
  const openAgent = (b: Baarasseur) => openChat({ id: latest.byAgent.get(b.id)?.sessionId ?? '', agent: team.baarasseurAgentId(b.id) });
  const newAgent = () => { tap(); router.push(access === 'paid' ? '/new-agent' : '/plans'); };
  const stopSearch = () => { setSearching(false); setQuery(''); Keyboard.dismiss(); };

  if (!pairing) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, backgroundColor: colors.background }}>
      <BaaraliMark size={64} motion="loading" />
      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.label }}>Connect your computer</Text>
      <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 22, color: colors.secondaryLabel }}>
        Your chats and your baarasseurs show up here once the phone is linked to your Baarali.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/pairing')}
        style={{ marginTop: 6, minHeight: 46, paddingHorizontal: 22, borderRadius: 23, justifyContent: 'center', backgroundColor: colors.label }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.background }}>Connect</Text>
      </Pressable>
    </View>
  );

  const round = { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground } as const;
  const hero = (
    <View style={{ paddingTop: 8, paddingBottom: 24, gap: 18 }}>
      <AnnouncementBanner />
      <Pressable accessibilityRole="button" accessibilityLabel="Baarali" onPress={() => openChat(latest.mine ? { id: latest.mine.sessionId } : { first: '1' })}
        style={({ pressed }) => ({ alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
        <View>
          <BaaraliMark size={104} motion="loading" />
          <View style={{ position: 'absolute', right: -2, bottom: 2, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFA31A', borderWidth: 3, borderColor: colors.background }}>
            <Image source="sf:star.fill" style={{ width: 13, height: 13 }} tintColor="#FFFFFF" />
          </View>
          {waits(latest.mine) && <Dot />}
        </View>
        <Text style={{ fontSize: 16, color: colors.label }}>Baarali</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View style={{ height: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Your account')} onPress={() => { tap(); router.push('/settings'); }} style={round}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.secondaryLabel }}>{initials(email)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('New agent')} onPress={newAgent} style={round}>
          <Image source="sf:plus" style={{ width: 20, height: 20 }} tintColor={colors.label} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        {searching ? (
          <FlatList data={found} keyExtractor={e => e.sessionId} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingVertical: 8 }}
            ListEmptyComponent={<Text style={{ padding: 24, textAlign: 'center', fontSize: 15, color: colors.secondaryLabel }}>No conversation found</Text>}
            renderItem={({ item }) => {
              const b = byId.get(team.baarasseurIdOf(item.lastAgentId) ?? '');
              return <Line avatar={b ? <BaarasseurAvatar b={b} size={44} /> : <BaaraliMark size={40} />}
                title={item.title || translate('New chat')} subtitle={b?.name ?? 'Baarali'} date={when(item.updatedAt)} waiting={waits(item)}
                onPress={() => openChat({ id: item.sessionId, agent: b ? team.baarasseurAgentId(b.id) : undefined })} />;
            }} />
        ) : (
          <FlatList data={rows} keyExtractor={b => b.id} ListHeaderComponent={hero} contentContainerStyle={{ paddingBottom: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
              setRefreshing(true);
              try { await Promise.all([refresh(), reload()]); } finally { setRefreshing(false); }
            }} />}
            ListEmptyComponent={agents ? <Text style={{ paddingHorizontal: 40, textAlign: 'center', fontSize: 15, lineHeight: 21, color: colors.tertiaryLabel }}>Your agents show up here. Make one with +.</Text> : null}
            renderItem={({ item }) => {
              const entry = latest.byAgent.get(item.id);
              return <Line avatar={<BaarasseurAvatar b={item} size={56} />} title={item.name}
                subtitle={entry?.title || item.role || translate('New chat')} date={entry ? when(entry.updatedAt) : ''} waiting={waits(entry)}
                onPress={() => openAgent(item)} />;
            }} />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          {!searching && <Pressable accessibilityRole="button" accessibilityLabel={translate('Connect apps')} onPress={() => { tap(); router.push('/connect'); }} style={{ ...round, width: 54, height: 54, borderRadius: 27 }}>
            <Image source="sf:square.grid.2x2" style={{ width: 22, height: 22 }} tintColor={colors.label} />
          </Pressable>}
          <Pressable accessibilityRole="search" onPress={() => { setSearching(true); setTimeout(() => input.current?.focus(), 50); }}
            style={{ flex: 1, height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, backgroundColor: colors.secondaryBackground }}>
            <Image source="sf:magnifyingglass" style={{ width: 19, height: 19 }} tintColor={colors.secondaryLabel} />
            {searching
              ? <TextInput ref={input} value={query} onChangeText={setQuery} placeholder={translate('Search')} placeholderTextColor={colors.tertiaryLabel}
                  returnKeyType="search" style={{ flex: 1, fontSize: 17, color: colors.label }} />
              : <Text style={{ flex: 1, fontSize: 17, color: colors.tertiaryLabel }}>Search</Text>}
          </Pressable>
          {searching && <Pressable accessibilityRole="button" accessibilityLabel={translate('Close')} onPress={stopSearch} style={{ ...round, width: 54, height: 54, borderRadius: 27 }}>
            <Image source="sf:xmark" style={{ width: 18, height: 18 }} tintColor={colors.label} />
          </Pressable>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Dot() {
  const colors = useColors();
  return <View accessibilityLabel={translate('Waits for you')} style={{ position: 'absolute', right: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.label, borderWidth: 2, borderColor: colors.background }} />;
}

function Line({ avatar, title, subtitle, date, waiting, onPress }: {
  avatar: ReactNode; title: string; subtitle: string; date: string; waiting?: boolean; onPress: () => void;
}) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? colors.secondaryBackground : 'transparent' })}>
    <View style={{ width: 56, alignItems: 'center' }}>{avatar}{waiting && <Dot />}</View>
    <View style={{ flex: 1, gap: 3 }}>
      <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '500', color: colors.label }}>{title}</Text>
      <Text numberOfLines={1} style={{ fontSize: 15, color: colors.secondaryLabel }}>{subtitle}</Text>
    </View>
    {!!date && <Text style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: 14, color: colors.tertiaryLabel }}>{date}</Text>}
  </Pressable>;
}
