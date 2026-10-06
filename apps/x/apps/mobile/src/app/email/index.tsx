import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import type { blocks } from '@x/shared';

import { Empty, Row, Segmented, Separator, senderName, when } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { setOpenThread } from '@/lib/email-thread';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the mailbox on the phone (validated mockup): the
// important threads, the rest, and the drafts; a reply Baarali prepared shows
// on its row, and the thread lets you send or edit it.

type Thread = blocks.GmailThread;
type Box = 'important' | 'all' | 'drafts';

export default function EmailScreen() {
  const colors = useColors();
  const { rpc, status } = useConnection();
  const [box, setBox] = useState<Box>('important');
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      const state = (await rpc.call('gmail:getConnectionStatus', {})) as { connected?: boolean } | null;
      if (state && state.connected === false) { setConnected(false); setThreads([]); return; }
    } catch {
      // older Macs: assume connected and let the list speak
    }
    try {
      const res = box === 'drafts'
        ? await rpc.call('gmail:getDrafts', {})
        : await rpc.call(box === 'important' ? 'gmail:getImportant' : 'gmail:getEverythingElse', { limit: 50 });
      setThreads(res.threads ?? []);
      setConnected(true);
    } catch {
      setThreads([]);
    }
  }, [rpc, box]);

  useEffect(() => {
    setThreads(null);
    if (status === 'connected') void load();
  }, [load, status]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await rpc?.call('gmail:triggerSync', {});
    } catch {
      // the list below is still worth reloading
    }
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.threadId}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <Segmented<Box>
            items={[{ value: 'important', label: 'Important' }, { value: 'all', label: 'All' }, { value: 'drafts', label: 'Drafts' }]}
            value={box}
            onChange={setBox}
          />
        }
        ItemSeparatorComponent={() => <Separator inset={34} />}
        renderItem={({ item: t }) => (
          <Row
            bold={t.unread}
            title={senderName(t.from) || t.subject || '—'}
            subtitle={`${t.subject ?? ''}${t.preview ? ` — ${t.preview}` : ''}`}
            leading={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.unread ? colors.accent : 'transparent' }} />}
            right={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(t.date)}</Text>
                {t.draft_response ? <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>Reply ready</Text> : null}
              </View>
            }
            onPress={() => {
              setOpenThread(t);
              router.push({ pathname: '/email/thread', params: { id: t.threadId } });
            }}
          />
        )}
        ListEmptyComponent={
          threads === null ? <ActivityIndicator style={{ marginTop: 32 }} />
          : !connected ? <Empty title="No mailbox connected" text="Connect Gmail or Outlook in Baarali on your computer: your emails show up here." />
          : <Empty title="Nothing here" />
        }
      />
    </View>
  );
}
