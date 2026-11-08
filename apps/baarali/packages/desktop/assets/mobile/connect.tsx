import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { composio } from '@x/shared';

import { useConnection } from '@/lib/connection';
import { searchKey } from '@/lib/team-directory';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(07/11/2026): Grok Bot's « Connect apps » (the founder's call): every
// app the agents can use, one tap to connect, filtered by kind, searched at
// the foot. Google, Microsoft and Fireflies connect directly (the sign-in
// opens on the linked computer, which keeps the keys); the others go through
// Composio when the computer has it, the sign-in then opens on the phone.

type Item = { key: string; name: string; detail: string; kind: string; logo?: string; icon?: string; native: boolean };

const NATIVE: Item[] = [
  { key: 'google', name: 'Google', detail: 'Gmail, Calendar, Drive', kind: 'productivity', icon: 'sf:envelope', native: true },
  { key: 'microsoft', name: 'Microsoft', detail: 'Outlook, Calendar', kind: 'productivity', icon: 'sf:tray', native: true },
  { key: 'fireflies-ai', name: 'Fireflies', detail: 'Meeting notes', kind: 'communication', icon: 'sf:mic', native: true },
];
const KINDS = ['all', 'communication', 'productivity', 'crm', 'social', 'storage', 'development', 'marketing', 'finance', 'support', 'design'] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  all: 'All', communication: 'Communication', productivity: 'Productivity', crm: 'CRM', social: 'Social networks',
  storage: 'Storage', development: 'Development', marketing: 'Marketing', finance: 'Finance', support: 'Support', design: 'Design',
};

export default function ConnectAppsScreen() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [native, setNative] = useState<Record<string, boolean>>({});
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [composioOn, setComposioOn] = useState(false);
  const [logos, setLogos] = useState<Record<string, { logo: string; detail: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!rpc) return;
    const [state, configured] = await Promise.allSettled([rpc.call('oauth:getState', null), rpc.call('composio:is-configured', null)]);
    if (state.status === 'fulfilled') setNative(Object.fromEntries(Object.entries(state.value.config).map(([k, v]) => [k, v.connected])));
    const on = configured.status === 'fulfilled' && configured.value.configured;
    setComposioOn(on);
    if (on) {
      const [connected, toolkits] = await Promise.allSettled([rpc.call('composio:list-connected', null), rpc.call('composio:list-toolkits', {})]);
      if (connected.status === 'fulfilled') setLinked(new Set(connected.value.toolkits));
      if (toolkits.status === 'fulfilled') setLogos(Object.fromEntries(toolkits.value.items.map(t => [t.slug, { logo: t.meta.logo, detail: t.meta.description }])));
    }
    setLoading(false);
  }, [rpc]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const items = useMemo<Item[]>(() => [
    ...NATIVE,
    ...(composioOn ? composio.CURATED_TOOLKITS.filter(t => !['gmail', 'googlecalendar', 'googledrive', 'outlook'].includes(t.slug)).map(t => ({
      key: t.slug, name: t.displayName, detail: logos[t.slug]?.detail ?? '', kind: t.category, logo: logos[t.slug]?.logo, native: false,
    })) : []),
  ], [composioOn, logos]);
  const isOn = (item: Item) => item.native ? !!native[item.key] : linked.has(item.key);
  const count = items.filter(isOn).length;
  const needle = searchKey(query);
  const shown = items.filter(item => (kind === 'all' || item.kind === kind) && (!needle || searchKey(`${item.name} ${item.detail}`).includes(needle)))
    .sort((a, b) => Number(isOn(b)) - Number(isOn(a)));
  const kinds = KINDS.filter(k => k === 'all' || items.some(item => item.kind === k));

  const connect = async (item: Item) => {
    if (!rpc || busy) return;
    if (isOn(item)) {
      Alert.alert(translate('Disconnect $1?', [item.name]), translate('Your agents will no longer use it.'), [
        { text: translate('Cancel'), style: 'cancel' },
        { text: translate('Disconnect'), style: 'destructive', onPress: () => void (item.native
          ? rpc.call('oauth:disconnect', { provider: item.key }) : rpc.call('composio:disconnect', { toolkitSlug: item.key })).then(load, () => {}) },
      ]);
      return;
    }
    setBusy(item.key);
    try {
      if (item.native) {
        const result = await rpc.call('oauth:connect', { provider: item.key });
        if (!result.success) throw new Error(result.error);
        Alert.alert(translate('Continue on your computer'), translate('The sign-in page for $1 opened on your computer.', [item.name]));
      } else {
        const started = await rpc.call('composio:initiate-connection', { toolkitSlug: item.key });
        if (!started.success) throw new Error(started.error);
        if (started.redirectUrl) {
          await WebBrowser.openBrowserAsync(started.redirectUrl);
          if (started.connectedAccountId) await rpc.call('composio:sync-connection', { toolkitSlug: item.key, connectedAccountId: started.connectedAccountId }).catch(() => {});
        }
      }
      await load();
    } catch {
      Alert.alert(translate('$1 could not be connected', [item.name]), translate('Please try again.'));
    } finally { setBusy(null); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <View style={{ height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={translate('Close')} onPress={() => router.back()}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:xmark" style={{ width: 18, height: 18 }} tintColor={colors.label} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.label }}>Connect apps</Text>
      {count > 0 && <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Text style={{ fontSize: 15, color: colors.label }}>{translate('$1 connected', [count])}</Text>
      </View>}
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          {kinds.map(k => <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', backgroundColor: kind === k ? colors.label : colors.secondaryBackground }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: kind === k ? colors.background : colors.label }}>{translate(KIND_LABEL[k])}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.label} /> : (
        <FlatList data={shown} keyExtractor={item => item.key} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingVertical: 8 }}
          ListFooterComponent={!composioOn ? <Text style={{ padding: 24, fontSize: 14, lineHeight: 20, color: colors.tertiaryLabel }}>More apps (Slack, Notion, WhatsApp…) appear here once Composio is turned on on your computer.</Text> : null}
          renderItem={({ item }) => {
            const on = isOn(item);
            return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                {item.logo ? <Image source={item.logo} style={{ width: 32, height: 32 }} contentFit="contain" />
                  : <Image source={item.icon ?? 'sf:app'} style={{ width: 24, height: 24 }} tintColor="#0A0A0A" />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 17, color: colors.label }}>{item.name}</Text>
                {!!item.detail && <Text numberOfLines={2} style={{ fontSize: 14, color: colors.secondaryLabel }}>{translate(item.detail)}</Text>}
              </View>
              <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void connect(item)}
                style={{ height: 40, minWidth: 104, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground, opacity: busy && busy !== item.key ? 0.5 : 1 }}>
                {busy === item.key ? <ActivityIndicator color={colors.label} />
                  : <Text style={{ fontSize: 15, fontWeight: '500', color: on ? colors.secondaryLabel : colors.label }}>{on ? translate('Connected') : translate('Connect')}</Text>}
              </Pressable>
            </View>;
          }} />
      )}
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 }}>
        <View style={{ height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, backgroundColor: colors.secondaryBackground }}>
          <Image source="sf:magnifyingglass" style={{ width: 19, height: 19 }} tintColor={colors.secondaryLabel} />
          <TextInput value={query} onChangeText={setQuery} placeholder={translate('Search apps')} placeholderTextColor={colors.tertiaryLabel}
            returnKeyType="search" style={{ flex: 1, fontSize: 17, color: colors.label }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
