import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { todo } from '@x/shared';

import { Empty, Segmented, Separator } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the to-do list on the phone (validated mockup): what
// is left and what is done, a tap to tick, « Baarali » to hand one over, and
// a field to add one (the keyboard's microphone dictates it).

type List = { blocks: Array<{ kind: 'item'; item: todo.TodoItem } | { kind: 'raw'; text: string }> };
type Tab = 'open' | 'done';

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rpc, events, status } = useConnection();
  const [list, setList] = useState<List | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('open');
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      const res = await rpc.call('todo:get', null);
      setList(res.list as List);
      setRunning(res.running);
    } catch {
      setList({ blocks: [] });
    }
  }, [rpc]);
  useEffect(() => { if (status === 'connected') void load(); }, [load, status]);
  useEffect(() => (events ? events.on('todo:events', () => void load()) : undefined), [events, load]);

  const items = useMemo(
    () => (list?.blocks ?? []).flatMap((b) => (b.kind === 'item' ? [b.item] : [])).filter((it) => (tab === 'done' ? it.checked : !it.checked)),
    [list, tab],
  );

  const toggle = async (key: string) => {
    if (!rpc || !list) return;
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: List = { blocks: list.blocks.map((b) => (b.kind === 'item' && b.item.key === key ? { ...b, item: { ...b.item, checked: !b.item.checked } } : b)) };
    setList(next);
    try {
      const res = await rpc.call('todo:save', { list: next as never });
      if (res.list) setList(res.list as List);
    } catch {
      void load();
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text || !rpc) return;
    setDraft('');
    try {
      await rpc.call('todo:addItem', { text, run: false });
    } finally {
      void load();
    }
  };

  const delegate = async (key: string) => {
    if (!rpc) return;
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setRunning((r) => [...r, key]);
    await rpc.call('todo:runItem', { key }).catch(() => {});
    void load();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.key}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={<Segmented<Tab> items={[{ value: 'open', label: 'To do' }, { value: 'done', label: 'Done' }]} value={tab} onChange={setTab} />}
        ItemSeparatorComponent={() => <Separator inset={52} />}
        renderItem={({ item: it }) => {
          const busy = running.includes(it.key);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52 }}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: it.checked }} accessibilityLabel={it.text} hitSlop={10} onPress={() => void toggle(it.key)}
                style={{ width: 26, height: 26, borderRadius: 13, borderWidth: it.checked ? 0 : 2, borderColor: colors.tertiaryLabel, backgroundColor: it.checked ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {it.checked ? <Image source="sf:checkmark" style={{ width: 13, height: 13 }} tintColor={colors.onAccent} /> : null}
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, color: it.checked ? colors.tertiaryLabel : colors.label, textDecorationLine: it.checked ? 'line-through' : 'none' }}>{it.text}</Text>
                {it.delegated || busy ? <Text style={{ fontSize: 13, color: colors.accent }}>{busy ? 'Baarali is on it…' : 'Handed to Baarali'}</Text> : null}
              </View>
              {!it.checked && !it.delegated && !busy ? (
                <Pressable onPress={() => void delegate(it.key)} hitSlop={6} accessibilityRole="button"
                  style={{ paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>Baarali</Text>
                </Pressable>
              ) : busy ? <ActivityIndicator /> : null}
            </View>
          );
        }}
        ListEmptyComponent={list === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : <Empty title={tab === 'done' ? 'Nothing done yet' : 'Nothing left to do'} />}
      />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: insets.bottom + 8, borderTopWidth: 0.5, borderTopColor: colors.separator }}>
        <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={() => void add()} returnKeyType="done" placeholder="Add a task"
          placeholderTextColor={colors.tertiaryLabel}
          style={{ flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: colors.secondaryBackground, color: colors.label, fontSize: 16 }} />
        <Pressable onPress={() => void add()} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel="Add"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: draft.trim() ? 1 : 0.4 }}>
          <Image source="sf:plus" style={{ width: 18, height: 18 }} tintColor={colors.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
