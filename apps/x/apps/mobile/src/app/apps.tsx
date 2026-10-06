import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { promptLibrary, type rowboatApp } from '@x/shared';

import { Empty, Row, Segmented, Separator } from '@/components/baarali-ui';
import { phoneLang } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): apps and prompts on the phone (validated mockup). The
// person's mini-apps (they run on the computer, which serves them), « Ask for
// an app » in the chat, and the prompt library shared with the desktop:
// « Use » opens a chat with the text written in.

type Tab = 'apps' | 'prompts';
type App = rowboatApp.AppSummary;

export default function AppsScreen() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [tab, setTab] = useState<Tab>('apps');
  const [apps, setApps] = useState<App[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const lang = phoneLang();

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      setApps((await rpc.call('apps:list', {})).apps.filter((a) => a.status === 'ok'));
    } catch {
      setApps([]);
    }
  }, [rpc]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const prompts = useMemo(
    () => promptLibrary.PROMPT_LIBRARY.filter((p) => !category || p.category === category),
    [category],
  );
  const use = (text: string) => router.push({ pathname: '/chat', params: { id: '', draft: text } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {tab === 'apps' ? (
        <FlatList
          data={apps ?? []}
          keyExtractor={(a) => a.folder}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={<Segmented<Tab> items={[{ value: 'apps', label: 'My apps' }, { value: 'prompts', label: 'Prompts' }]} value={tab} onChange={setTab} />}
          ItemSeparatorComponent={() => <Separator inset={68} />}
          renderItem={({ item: a }) => (
            <Row
              title={a.manifest?.name ?? a.folder}
              subtitle={a.manifest?.description || undefined}
              leading={<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondaryBackground, alignItems: 'center', justifyContent: 'center' }}>
                <Image source="sf:square.grid.2x2" style={{ width: 20, height: 20 }} tintColor={colors.accent} />
              </View>}
              onPress={() => Alert.alert(a.manifest?.name ?? a.folder, 'Your apps open in Baarali on your computer, which runs them.')}
            />
          )}
          ListEmptyComponent={apps === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : <Empty title="No app yet" />}
          ListFooterComponent={
            <Pressable onPress={() => use(lang === 'fr' ? 'Construis-moi une petite app : ' : 'Build me a small app: ')}
              style={{ margin: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.secondaryBackground, padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>Ask for an app</Text>
              <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>A till tracker, a form, a delivery note: Baarali builds it.</Text>
            </Pressable>
          }
        />
      ) : (
        <FlatList
          data={prompts}
          keyExtractor={(p) => p.id}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <View>
              <Segmented<Tab> items={[{ value: 'apps', label: 'My apps' }, { value: 'prompts', label: 'Prompts' }]} value={tab} onChange={setTab} />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ id: '', name: { fr: 'Tout', en: 'All' } }, ...promptLibrary.PROMPT_CATEGORIES]}
                keyExtractor={(c) => c.id || 'all'}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
                renderItem={({ item: c }) => {
                  const on = (category ?? '') === c.id;
                  return (
                    <Pressable onPress={() => setCategory(c.id || null)}
                      style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? colors.accent : colors.secondaryBackground }}>
                      <Text style={{ fontSize: 14, fontWeight: on ? '600' : '400', color: on ? colors.onAccent : colors.label }}>{c.name[lang]}</Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          }
          ItemSeparatorComponent={() => <Separator />}
          renderItem={({ item: p }) => (
            <Row title={p.name[lang]} subtitle={p.text[lang]} onPress={() => use(p.text[lang])}
              right={<Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>Use</Text>} />
          )}
        />
      )}
    </View>
  );
}
