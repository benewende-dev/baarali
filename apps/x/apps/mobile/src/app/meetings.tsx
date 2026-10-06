import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import type { z } from 'zod';
import type { workspace } from '@x/shared';

import { Empty, Row, Separator, when } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the meetings on the phone (validated mockup): the
// minutes Baarali wrote (knowledge/Meetings/<source>/<day>/…), newest first;
// a tap opens them. Recording a meeting stays on the computer for now: the
// phone app has no recorder module yet.

type DirEntry = z.infer<typeof workspace.DirEntry>;

function title(e: DirEntry): string {
  return e.name.replace(/\.md$/, '').replace(/^meeting-/, '').replace(/-/g, ' ');
}

export default function MeetingsScreen() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      setEntries(await rpc.call('workspace:readdir', { path: 'knowledge/Meetings', opts: { recursive: true, includeStats: true } }));
    } catch {
      setEntries([]);
    }
  }, [rpc]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const notes = useMemo(
    () => (entries ?? []).filter((e) => e.kind === 'file' && e.name.endsWith('.md')).sort((a, b) => (b.stat?.mtimeMs ?? 0) - (a.stat?.mtimeMs ?? 0)),
    [entries],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={notes}
        keyExtractor={(e) => e.path}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <Text style={{ marginHorizontal: 16, marginBottom: 10, fontSize: 15, lineHeight: 21, color: colors.secondaryLabel }}>
            The minutes of your meetings: decisions, tasks and who said what. Record a meeting in Baarali on your computer.
          </Text>
        }
        ItemSeparatorComponent={() => <Separator />}
        renderItem={({ item: e }) => (
          <Row
            title={title(e)}
            subtitle={e.path.split('/').slice(2, -1).join(' · ')}
            right={<Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{e.stat?.mtimeMs ? when(new Date(e.stat.mtimeMs).toISOString()) : ''}</Text>}
            onPress={() => router.push({ pathname: '/notes/view', params: { path: e.path } })}
          />
        )}
        ListEmptyComponent={entries === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : <Empty title="No meeting yet" />}
      />
    </View>
  );
}
