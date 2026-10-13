import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';

import { AnnouncementBanner } from '@/components/announcement-banner';
import { BaaraliLogo } from '@/components/baarali-logo';
import { TopNavigation } from '@/components/top-navigation';
import { BaaraliMark } from '@/components/baarali-mark';
import { ChatComposer } from '@/components/chat-composer';
import { useComposerAttachments, stageAttachments } from '@/lib/composer-attachments';
import { ModelPill } from '@/components/model-picker';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';

type Entry = sessionsShared.SessionIndexEntry;

function when(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const tap = () => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); };

// BAARALI(12/10/2026): the founder requested a calmer home: three recent
// chats, one agent shortcut and the composer; the full history stays reachable.
export default function HomeScreen() {
  const colors = useColors();
  const { pairing, sessions, events } = useConnection();
  const { team, reload } = useBaarasseurs();
  const models = useModels();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [allChats, setAllChats] = useState(false);
  const attachments = useComposerAttachments();

  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      setEntries((await sessions.list()).sessions.filter(sessionsShared.isChatListSession));
    } catch {
      // Keep the last list when the instance is reconnecting.
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const offEvents = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => { offEvents(); offResync(); };
  }, [events, refresh]);
  const refreshModels = models.refresh;
  useFocusEffect(useCallback(() => {
    void reload();
    void refresh();
    void refreshModels().catch(() => {});
  }, [reload, refresh, refreshModels]));

  const chats = useMemo(() => [...entries].sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1), [entries]);
  const byAgent = useMemo(() => new Map((team ?? []).map(b => [shared.baarasseurAgentId(b.id), b])), [team]);
  const openChat = (params: { id?: string; agent?: string; talk?: '1'; draft?: string; submit?: '1'; attachments?: string }) => {
    tap();
    router.push({ pathname: '/chat', params: { id: '', ...params } });
  };
  const sendDraft = () => {
    if (!draft.trim() && !attachments.files.length) return;
    openChat({ draft: draft.trim(), submit: '1', attachments: stageAttachments(attachments.files) });
    attachments.clear();
    setDraft('');
  };

  if (!pairing) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, backgroundColor: colors.background }}>
      <BaaraliMark size={54} />
      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.label }}>Connect your computer</Text>
      <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 22, color: colors.secondaryLabel }}>
        Your chats and your baarasseurs show up here once the phone is linked to your Baarali.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/pairing')}
        style={{ marginTop: 6, minHeight: 46, paddingHorizontal: 22, borderRadius: 23, justifyContent: 'center', backgroundColor: colors.accent }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>Connect</Text>
      </Pressable>
    </View>
  );

  const head = (
    <View style={{ paddingBottom: 8, gap: 26 }}>
      <AnnouncementBanner />
      <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, gap: 14 }}>
        <BaaraliLogo />
        <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '600', color: colors.label }}>Hello.</Text>
        <Text style={{ fontSize: 17, lineHeight: 24, color: colors.secondaryLabel }}>How can I help you?</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.secondaryLabel }}>{allChats ? 'Your conversations' : 'Recent conversations'}</Text>
        {chats.length > 3 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: allChats }} onPress={() => { tap(); setAllChats(value => !value); }} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}><Text style={{ fontSize: 14, color: colors.accent }}>{allChats ? 'Show less' : 'See all'}</Text></Pressable>}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
    <TopNavigation />
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <FlatList data={allChats ? chats : chats.slice(0, 3)} keyExtractor={entry => entry.sessionId} ListHeaderComponent={head}
        keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          try { await Promise.all([refresh(), reload()]); } finally { setRefreshing(false); }
        }} />}
        renderItem={({ item }) => {
          const b = item.lastAgentId ? byAgent.get(item.lastAgentId) : undefined;
          return <Pressable accessibilityRole="button" onPress={() => openChat({ id: item.sessionId, agent: b ? shared.baarasseurAgentId(b.id) : undefined })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: pressed ? colors.secondaryBackground : 'transparent' })}>
            {b ? <BaarasseurAvatar b={b} size={38} /> : <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><BaaraliMark size={25} /></View>}
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '500', color: colors.label }}>{item.title || 'New chat'}</Text>
              {b && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondaryLabel }}>{b.name}</Text>}
            </View>
            <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{when(item.updatedAt)}</Text>
          </Pressable>;
        }}
        ListEmptyComponent={<Text style={{ paddingHorizontal: 20, fontSize: 14, lineHeight: 20, color: colors.secondaryLabel }}>Start a conversation below or choose an agent.</Text>}
      />
      <View style={{ marginHorizontal: 12, marginBottom: 10 }}>
        <ChatComposer draft={draft} onChange={setDraft} placeholder="Message Baarali" files={attachments.files} onRemove={attachments.remove}
          onAttach={() => void attachments.pick()} picking={attachments.picking} onSend={sendDraft}
          leading={<ModelPill models={models} />} onVoice={() => openChat({ talk: '1' })} voiceLabel="Talk with Baarali" />
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
