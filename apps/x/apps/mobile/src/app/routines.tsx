import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Switch, Text, View } from 'react-native';
import type { backgroundTask } from '@x/shared';

import { Empty, Separator, when } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { scheduleWords } from '@/lib/schedule-words';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the routines on the phone (validated mockup): what
// Baarali does on its own, when, its last report, a switch to pause one, a tap
// to run it now. A new one is asked for in the chat, in plain words.

type Task = backgroundTask.BackgroundTaskSummary;

export default function RoutinesScreen() {
  const colors = useColors();
  const { rpc, status } = useConnection();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      setTasks((await rpc.call('bg-task:list', { sort: 'name:asc' })).items);
    } catch {
      setTasks([]);
    }
  }, [rpc]);
  useEffect(() => { if (status === 'connected') void load(); }, [load, status]);

  const setActive = async (t: Task, active: boolean) => {
    setTasks((all) => all?.map((x) => (x.slug === t.slug ? { ...x, active } : x)) ?? all);
    await rpc?.call('bg-task:patch', { slug: t.slug, partial: { active } }).catch(() => void load());
  };

  const runNow = (t: Task) => {
    Alert.alert(t.name, 'Run it now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Run', onPress: () => {
          if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void rpc?.call('bg-task:run', { slug: t.slug }).then(() => load(), () => load());
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tasks ?? []}
        keyExtractor={(t) => t.slug}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <Text style={{ marginHorizontal: 16, marginBottom: 10, fontSize: 15, lineHeight: 21, color: colors.secondaryLabel }}>
            What Baarali does on its own, when you said. It reports here and in your notifications.
          </Text>
        }
        ItemSeparatorComponent={() => <Separator />}
        renderItem={({ item: t }) => (
          <Pressable onPress={() => runNow(t)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.secondaryBackground : 'transparent' })}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>{t.name}</Text>
              <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{scheduleWords(t.triggers)}</Text>
              {t.lastRunError ? <Text numberOfLines={2} style={{ fontSize: 13, color: colors.destructive }}>{t.lastRunError}</Text>
                : t.lastRunSummary ? <Text numberOfLines={2} style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(t.lastRunAt)} · {t.lastRunSummary}</Text> : null}
            </View>
            <Switch value={t.active} onValueChange={(v) => void setActive(t, v)} accessibilityLabel={t.name} />
          </Pressable>
        )}
        ListEmptyComponent={tasks === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : <Empty title="No routine yet" />}
        ListFooterComponent={
          <Pressable
            onPress={() => router.push({ pathname: '/chat', params: { id: '' } })}
            style={{ margin: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.secondaryBackground, padding: 14, gap: 4 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>New routine</Text>
            <Text style={{ fontSize: 14, lineHeight: 19, color: colors.secondaryLabel }}>Say it simply: « Every morning, sum up yesterday’s WhatsApp orders. »</Text>
          </Pressable>
        }
      />
    </View>
  );
}
