import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { billing } from '@x/shared';
import { useConnection } from '@/lib/connection';
import { withPlanAccess } from '@/lib/plan-access-copy';
import { phoneLang } from '@/lib/baarasseurs';
import { dayWords, giftProgress, type PartnerState } from '@/lib/partner-code';
import { useModels } from '@/lib/use-models';
import { useReadAloud } from '@/lib/voice';
import { useAppTheme } from '@/lib/app-theme';
import { usageMetrics } from '@/lib/usage-metrics';
import { canUseWork } from '@/lib/work-access';
import { UsagePanel } from '@/components/usage-panel';
import { ModelPill } from '@/components/model-picker';
import { say } from '@/lib/say';
import { useColors } from '@/theme/colors';
import * as analytics from '@/lib/analytics';

type Section = 'account' | 'usage' | 'app';
// BAARALI(13/10/2026): three daily-use sections complement the desktop;
// focused, foreground polling stops when the phone leaves these settings.
export default function SettingsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(params.section === 'usage' ? 'usage' : 'account');
  useEffect(() => { if (params.section === 'usage') setSection('usage'); }, [params.section]);
  const { rpc, pairing, unpair, status } = useConnection();
  const [info, setInfo] = useState<billing.BillingInfo | null>(null);
  const [media, setMedia] = useState<billing.MediaCredits | null>(null);
  const [partner, setPartner] = useState<PartnerState | null>(null);
  const [offers, setOffers] = useState<billing.PlanOffers | null>(null);
  const [error, setError] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const models = useModels();
  const [readAloud, setReadAloud] = useReadAloud();
  const { theme, choose } = useAppTheme();
  const [changingTheme, setChangingTheme] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { setInfo(null); setMedia(null); setPartner(null); setOffers(null); setRefreshing(false); }, [rpc]);
  useFocusEffect(useCallback(() => {
    let alive = true, busy = false;
    const refresh = async () => {
      if (!alive || busy || AppState.currentState !== 'active') return;
      if (!rpc) { setError(true); return; }
      busy = true; setRefreshing(true);
      const [quota, credits, recommendation, catalog] = await Promise.allSettled([
        rpc.call('billing:getInfo', null), rpc.call('billing:getMedia', null),
        rpc.call('billing:getPartnerCode', null), rpc.call('billing:getPlans', { lang: phoneLang() }),
      ]);
      busy = false;
      if (!alive) return;
      setRefreshing(false); setNow(Date.now());
      setError(quota.status === 'rejected' || !quota.value);
      if (quota.status === 'fulfilled' && quota.value) { setInfo(quota.value); setLoadedAt(Date.now()); }
      setMediaFailed(credits.status === 'rejected');
      if (credits.status === 'fulfilled') setMedia(credits.value);
      if (recommendation.status === 'fulfilled') setPartner(recommendation.value);
      if (catalog.status === 'fulfilled') setOffers(catalog.value ? withPlanAccess(catalog.value) : null);
    };
    refreshRef.current = refresh;
    void refresh(); void models.refresh();
    const poll = setInterval(() => { void refresh(); }, 60000);
    const clock = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()); }, 30000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive = false; clearInterval(poll); clearInterval(clock); sub.remove(); refreshRef.current = async () => {}; };
    // The model catalog is refreshed on focus without creating a poll per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]));
  const plan = info ? billing.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  const metrics = info ? usageMetrics(info, now) : null;
  const offer = offers?.plans.find(item => item.levels.some(level => level.id === info?.subscriptionPlanId));
  const running = partner?.running;
  const progress = running ? giftProgress(running) : null;
  const card = { padding: 18, borderRadius: 18, backgroundColor: colors.background, gap: 14 };
  const text = { fontSize: 14, lineHeight: 21, color: colors.secondaryLabel };
  const pickTheme = async (next: 'system' | 'light' | 'dark') => {
    setChangingTheme(true);
    try { await choose(next); } catch { Alert.alert(say('Theme'), say('The appearance could not be saved. Please try again.')); }
    finally { setChangingTheme(false); }
  };
  const disconnect = () => Alert.alert(say('Unpair this phone?'), say('Your conversations remain available on your computer. You can reconnect this phone later.'), [
    { text: say('Cancel'), style: 'cancel' },
    { text: say('Unpair'), style: 'destructive', onPress: () => { analytics.mobileUnpaired('user'); void unpair().then(() => router.replace('/spaces')).catch(() => Alert.alert(say('Unable to unpair'), say('Please try again.'))); } },
  ]);
  return <ScrollView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshRef.current()} tintColor={colors.label} />} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 24, backgroundColor: colors.background }}>
      {([{ id: 'account', title: 'Account' }, { id: 'usage', title: 'Usage' }, { id: 'app', title: 'App' }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} onPress={() => setSection(item.id)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: section === item.id ? colors.secondaryBackground : 'transparent' }}><Text style={{ color: colors.label, fontSize: 14, fontWeight: section === item.id ? '600' : '400' }}>{say(item.title)}</Text></Pressable>)}
    </View>
    {section !== 'app' && error && <Pressable accessibilityRole="button" onPress={() => void refreshRef.current()} style={card}><Text style={{ ...text, color: colors.destructive }}>Your account could not be refreshed. Tap to retry.</Text></Pressable>}
    {section !== 'app' && !info && !error && <ActivityIndicator color={colors.label} />}
    {section === 'account' && <>
      {info && <View style={card}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }} selectable>{info.userEmail ?? '—'}</Text>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.label }}>{plan?.displayName ?? say('No plan')}</Text>
        <Text style={text}>{canUseWork(info) ? say('Chat and Work included') : say('Chat included. Work is available with a paid plan.')}</Text>
        {running && <Text style={text}>{`${running.plan} · free until ${dayWords(running.endsAt)}`}</Text>}
        {progress && <Text style={text}>{`Day ${progress.today} of ${progress.total}`}</Text>}
        {offer?.points.slice(0, 3).map(point => <Text key={point} style={text}>{point}</Text>)}
        <Row label="Change plan" onPress={() => router.push('/plans')} />
        {metrics && <Row label="Usage" value={say(`${metrics.week}% used this week`)} onPress={() => setSection('usage')} />}
      </View>}
      <View style={card}>
        {partner?.partner && <Row label="Recommended by" value={partner.partner} />}
        {partner?.canRedeem && !partner.partner && <Row label="Partner code" onPress={() => router.push('/partner-code')} />}
        {info?.adminUrl?.startsWith('https://') && <Row label="Admin console" onPress={() => void WebBrowser.openBrowserAsync(info.adminUrl!)} />}
        <Row label="Linked computer" value={pairing?.name ?? '—'} />
        <Text style={text}>{status === 'connected' ? say('Connected') : say('Reconnecting…')}</Text>
        {pairing && <Row label="Unpair" danger onPress={disconnect} />}
      </View>
    </>}
    {section === 'usage' && info && <UsagePanel info={info} media={media} mediaFailed={mediaFailed} now={now} loadedAt={loadedAt} />}
    {section === 'app' && <>
      <View style={card}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ flex: 1, color: colors.label, fontSize: 15 }}>Default model</Text><ModelPill models={models} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: colors.label, fontSize: 15 }}>Read replies aloud</Text><Switch value={readAloud} onValueChange={setReadAloud} trackColor={{ true: colors.accent }} accessibilityLabel="Read replies aloud" /></View>
        <Row label="Notifications" onPress={() => router.push('/notifications')} />
      </View>
      <View style={card}><Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>Appearance</Text>
        {([{ id: 'system', title: 'System' }, { id: 'light', title: 'Light' }, { id: 'dark', title: 'Dark' }] as const).map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: theme === item.id, disabled: changingTheme }} disabled={changingTheme} onPress={() => void pickTheme(item.id)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.label, fontSize: 15 }}>{say(item.title)}</Text><Text style={{ color: colors.accent, fontSize: 18 }}>{theme === item.id ? '✓' : ''}</Text></Pressable>)}
      </View>
      <View style={card}><Row label="Language" value={phoneLang() === 'fr' ? 'Français' : 'English'} /><Text style={text}>The language follows your phone. Connections and technical settings are managed on your computer.</Text></View>
    </>}
  </ScrollView>;
}
function Row({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const colors = useColors();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: danger ? colors.destructive : colors.label, fontSize: 15 }}>{say(label)}</Text>{value && <Text style={{ maxWidth: '55%', textAlign: 'right', color: colors.secondaryLabel, fontSize: 14 }}>{value}</Text>}{onPress && <Text style={{ color: colors.secondaryLabel }}>›</Text>}</Pressable>;
}
