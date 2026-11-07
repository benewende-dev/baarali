import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { billing } from '@x/shared';
import { useConnection } from '@/lib/connection';
import { phoneLang } from '@/lib/baarasseurs';
import { dayWords, type PartnerState } from '@/lib/partner-code';
import { useModels } from '@/lib/use-models';
import { useReadAloud } from '@/lib/voice';
import { useAppTheme } from '@/lib/app-theme';
import { usageMetrics } from '@/lib/usage-metrics';
import { useWorkAccess } from '@/lib/work-access-provider';
import { UsagePanel } from '@/components/usage-panel';
import { ModelPill } from '@/components/model-picker';
import { BaaraliMark } from '@/components/baarali-mark';
import { initials } from '@/app/(tabs)/home';
import { say } from '@/lib/say';
import { useColors } from '@/theme/colors';
import * as analytics from '@/lib/analytics';

const THEMES = [{ id: 'system', title: 'System' }, { id: 'light', title: 'Light' }, { id: 'dark', title: 'Dark' }] as const;
type Path = Parameters<typeof router.push>[0];

// BAARALI(07/11/2026): Grok Bot's settings (the founder's call): one sheet
// opened from the account on the home; everything the home hides is here:
// the account and its use, the apps, the agents and Work, the phone and the
// computer it is linked to; the B and the version at the foot.
export default function SettingsScreen() {
  const colors = useColors();
  const { rpc, pairing, unpair, status } = useConnection();
  const { access } = useWorkAccess();
  const [info, setInfo] = useState<billing.BillingInfo | null>(null);
  const [media, setMedia] = useState<billing.MediaCredits | null>(null);
  const [partner, setPartner] = useState<PartnerState | null>(null);
  const [error, setError] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const models = useModels();
  const [readAloud, setReadAloud] = useReadAloud();
  const { theme, choose } = useAppTheme();
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { setInfo(null); setMedia(null); setPartner(null); setRefreshing(false); }, [rpc]);
  useFocusEffect(useCallback(() => {
    let alive = true, busy = false;
    const refresh = async () => {
      if (!alive || busy || AppState.currentState !== 'active') return;
      if (!rpc) { setError(true); return; }
      busy = true; setRefreshing(true);
      const [quota, credits, recommendation] = await Promise.allSettled([
        rpc.call('billing:getInfo', null), rpc.call('billing:getMedia', null), rpc.call('billing:getPartnerCode', null),
      ]);
      busy = false;
      if (!alive) return;
      setRefreshing(false); setNow(Date.now());
      setError(quota.status === 'rejected' || !quota.value);
      if (quota.status === 'fulfilled' && quota.value) { setInfo(quota.value); setLoadedAt(Date.now()); }
      setMediaFailed(credits.status === 'rejected');
      if (credits.status === 'fulfilled') setMedia(credits.value);
      if (recommendation.status === 'fulfilled') setPartner(recommendation.value);
    };
    refreshRef.current = refresh;
    void refresh(); void models.refresh();
    const poll = setInterval(() => { void refresh(); }, 60000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive = false; clearInterval(poll); sub.remove(); refreshRef.current = async () => {}; };
    // The model catalog is refreshed on focus without creating a poll per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]));
  const plan = info ? billing.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  const metrics = info ? usageMetrics(info, now) : null;
  const running = partner?.running;
  const go = (path: Path) => router.push(path);
  // Work's places: behind the plan, the gate explains it (work-home.tsx).
  const work = (path: Path) => router.push(access === 'paid' ? path : '/(tabs)/more');
  const pickTheme = () => Alert.alert(say('Appearance'), undefined, [
    ...THEMES.map(item => ({ text: `${say(item.title)}${theme === item.id ? '  ✓' : ''}`, onPress: () => { void choose(item.id).catch(() => Alert.alert(say('Theme'), say('The appearance could not be saved. Please try again.'))); } })),
    { text: say('Cancel'), style: 'cancel' as const },
  ]);
  const disconnect = () => Alert.alert(say('Unpair this phone?'), say('Your conversations remain available on your computer. You can reconnect this phone later.'), [
    { text: say('Cancel'), style: 'cancel' },
    { text: say('Unpair'), style: 'destructive', onPress: () => { analytics.mobileUnpaired('user'); void unpair().then(() => router.replace('/')).catch(() => Alert.alert(say('Unable to unpair'), say('Please try again.'))); } },
  ]);
  const card = { borderRadius: 22, backgroundColor: colors.secondaryBackground, overflow: 'hidden' } as const;
  const heading = { marginTop: 8, marginBottom: -8, paddingHorizontal: 20, fontSize: 14, color: colors.tertiaryLabel } as const;
  const version = Constants.expoConfig?.version ?? '';

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <View style={{ height: 64, paddingHorizontal: 16, justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={say('Close')} onPress={() => router.back()}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:xmark" style={{ width: 18, height: 18 }} tintColor={colors.label} />
      </Pressable>
    </View>
    <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshRef.current()} tintColor={colors.label} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 18 }}>
      {error && <Pressable accessibilityRole="button" onPress={() => void refreshRef.current()} style={[card, { padding: 18 }]}><Text style={{ fontSize: 15, color: colors.destructive }}>Your account could not be refreshed. Tap to retry.</Text></Pressable>}
      {!info && !error && <ActivityIndicator color={colors.label} />}

      {info && <View style={card}>
        <Pressable accessibilityRole="button" onPress={() => go('/plans')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.secondaryLabel }}>{initials(info.userEmail ?? undefined)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, color: colors.label }}>{plan?.displayName ?? say('No plan')}</Text>
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.secondaryLabel }}>{info.userEmail ?? '—'}</Text>
          </View>
          <Chevron />
        </Pressable>
        {metrics && <Row label="Usage" value={`${metrics.week} %`} onPress={() => setUsageOpen(open => !open)} open={usageOpen} />}
        {usageOpen && <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><UsagePanel info={info} media={media} mediaFailed={mediaFailed} now={now} loadedAt={loadedAt} /></View>}
        <Row label="Manage subscription" onPress={() => go('/plans')} />
        {running && <Row label={`${running.plan} · free until ${dayWords(running.endsAt)}`} />}
        {partner?.partner && <Row label="Recommended by" value={partner.partner} />}
        {partner?.canRedeem && !partner.partner && <Row label="Partner code" onPress={() => go('/partner-code')} />}
        {info.adminUrl?.startsWith('https://') && <Row label="Admin console" external onPress={() => void WebBrowser.openBrowserAsync(info.adminUrl!)} />}
      </View>}

      <View style={card}>
        <Row first label="Your Baarali" detail="Its shape and its colour" onPress={() => go('/look')} />
        <Row label="Connect apps" detail="Gmail, Calendar, Drive and more" onPress={() => go('/connect')} />
        {/* BAARALI(07/11/2026): the announcements box had its bell in the old sidebar. */}
        <Row label="Messages from Baarali" detail="News and notices about your account" onPress={() => go('/inbox')} />
      </View>

      <Text style={heading}>Agents</Text>
      <View style={card}>
        <Row first label="Your agents" onPress={() => work('/baarasseurs')} />
        <Row label="Tasks" onPress={() => go('/tasks')} />
        <Row label="Routines" onPress={() => work('/routines')} />
        <Row label="Library" onPress={() => go('/notes')} />
        <Row label="Apps and prompts" onPress={() => work('/apps')} />
      </View>

      <Text style={heading}>Work</Text>
      <View style={card}>
        <Row first label="Projects" onPress={() => work('/projects')} />
        <Row label="Email" onPress={() => work('/(tabs)/email')} />
        <Row label="Meetings" onPress={() => work('/(tabs)/meetings')} />
        <Row label="Spaces" onPress={() => work('/(tabs)/spaces')} />
        <Row label="Studio" onPress={() => work('/studio')} />
      </View>

      <Text style={heading}>This phone</Text>
      <View style={card}>
        <Row first label="Linked computer" value={pairing?.name ?? '—'} detail={status === 'connected' ? 'Connected' : 'Reconnecting…'} />
        <Row label="Notifications" onPress={() => go('/notifications')} />
        <Row label="Default model" right={<ModelPill models={models} />} />
        <Row label="Read replies aloud" right={<Switch value={readAloud} onValueChange={setReadAloud} accessibilityLabel={say('Read replies aloud')} />} />
        <Row label="Appearance" value={say(THEMES.find(item => item.id === theme)?.title ?? 'System')} onPress={pickTheme} />
        <Row label="Language" value={phoneLang() === 'fr' ? 'Français' : 'English'} detail="The language follows your phone." />
      </View>

      {pairing && <View style={card}><Row first label="Unpair this phone" danger onPress={disconnect} /></View>}

      <View style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
        <BaaraliMark size={64} />
        <Text style={{ fontSize: 22, fontWeight: '600', color: colors.label }}>Baarali</Text>
        {!!version && <Text style={{ fontSize: 15, color: colors.tertiaryLabel }}>{version}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Chevron({ external, open }: { external?: boolean; open?: boolean }) {
  const colors = useColors();
  return <Image source={external ? 'sf:arrow.up.right' : open ? 'sf:chevron.down' : 'sf:chevron.right'} style={{ width: 13, height: 13 }} tintColor={colors.tertiaryLabel} />;
}

function Row({ label, value, detail, onPress, danger, external, open, first, right }: {
  label: string; value?: string; detail?: string; onPress?: () => void; danger?: boolean; external?: boolean; open?: boolean; first?: boolean; right?: ReactNode;
}) {
  const colors = useColors();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: first ? 0 : 0.5, borderTopColor: colors.separator, opacity: pressed ? 0.6 : 1 })}>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ color: danger ? colors.destructive : colors.label, fontSize: 17 }}>{say(label)}</Text>
      {detail ? <Text style={{ color: colors.tertiaryLabel, fontSize: 14 }}>{say(detail)}</Text> : null}
    </View>
    {value ? <Text numberOfLines={1} style={{ maxWidth: '50%', textAlign: 'right', color: colors.secondaryLabel, fontSize: 16 }}>{value}</Text> : null}
    {right}
    {onPress && !danger && <Chevron external={external} open={open} />}
  </Pressable>;
}
