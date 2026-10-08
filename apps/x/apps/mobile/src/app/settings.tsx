import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { billing as billingShared } from '@x/shared';

import { phoneLang } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { dayWords, giftProgress, type PartnerState } from '@/lib/partner-code';
import * as analytics from '@/lib/analytics';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the settings on the phone (validated mockup): the
// account with its plan and the week's use, the default model, the computer
// it is linked to, notifications, language and theme (the phone's own).

type Info = billingShared.BillingInfo;
const PLANS_URL = 'https://baarali.com/tarifs';

export default function SettingsScreen() {
  const colors = useColors();
  const { rpc, pairing, unpair, status } = useConnection();
  const models = useModels();
  const [info, setInfo] = useState<Info | null>(null);
  // A creator's partner code (08/10/2026): who recommended Baarali, the offered days.
  const [partner, setPartner] = useState<PartnerState | null>(null);

  useFocusEffect(useCallback(() => {
    if (!rpc) return;
    void rpc.call('billing:getInfo', null).then(setInfo, () => setInfo(null));
    void rpc.call('billing:getPartnerCode', null).then(setPartner, () => setPartner(null));
    void models.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]));

  const plan = info ? billingShared.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  // Baarali's week rides the « monthly » bucket, as on the desktop's gauge.
  const bucket = info?.monthly;
  const used = bucket && bucket.sanctionedCredits > 0 ? Math.min(1, bucket.usedCredits / bucket.sanctionedCredits) : 0;

  const running = partner?.running ?? null;
  const progress = running ? giftProgress(running) : null;

  const group = { marginHorizontal: 16, borderRadius: 14, borderCurve: 'continuous' as const, backgroundColor: colors.background, overflow: 'hidden' as const };
  const head = { marginHorizontal: 20, marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: '600' as const, color: colors.secondaryLabel };
  const SRow = ({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 0.5, borderBottomColor: colors.separator, backgroundColor: pressed && onPress ? colors.secondaryBackground : 'transparent' })}>
      <Text style={{ flex: 1, fontSize: 16, color: danger ? colors.destructive : colors.label }}>{label}</Text>
      {value ? <Text style={{ fontSize: 16, color: colors.secondaryLabel }}>{value}</Text> : null}
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[group, { padding: 14, gap: 10, marginTop: 8 }]}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.label }}>{info?.userEmail ?? '—'}</Text>
        <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>
          {running ? `${running.plan} · free until ${dayWords(running.endsAt)}` : (plan?.displayName ?? '—')}
        </Text>
        {running && progress ? (
          <View style={{ gap: 5 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.secondaryBackground, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round((progress.today / progress.total) * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
            </View>
            <Text style={{ fontSize: 13, color: colors.secondaryLabel, fontVariant: ['tabular-nums'] }}>{`Day ${progress.today} of ${progress.total}`}</Text>
          </View>
        ) : null}
        {bucket ? (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ flex: 1, fontSize: 13, color: colors.secondaryLabel }}>Use this week</Text>
              <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{Math.round(used * 100)} %</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.secondaryBackground, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(used * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(PLANS_URL)}
          style={{ height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
          <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 15 }}>Change plan</Text>
        </Pressable>
      </View>

      <Text style={head}>Baarali</Text>
      <View style={group}>
        {partner?.partner ? <SRow label="Recommended by" value={partner.partner} /> : null}
        {partner?.canRedeem && !partner.partner ? <SRow label="Partner code" value="›" onPress={() => router.push('/partner-code')} /> : null}
        <SRow label="Default model" value={models.display?.name ?? 'Automatic'} />
        <SRow label="Notifications" onPress={() => router.push('/notifications')} />
      </View>

      <Text style={head}>Application</Text>
      <View style={group}>
        <SRow label="Language" value={phoneLang() === 'fr' ? 'Français' : 'English'} />
        <SRow label="Theme" value="System" />
        <SRow label="Linked computer" value={pairing ? `${pairing.name ?? '—'}${status === 'connected' ? '' : ' · …'}` : '—'} />
        {pairing ? <SRow label="Unpair" danger onPress={() => { analytics.mobileUnpaired('user'); void unpair().then(() => router.replace('/spaces')); }} /> : null}
      </View>
      <Text style={{ marginHorizontal: 20, marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.tertiaryLabel }}>
        The language and the theme follow your phone. Connections (Gmail, WhatsApp…) are set up in Baarali on your computer.
      </Text>
    </ScrollView>
  );
}
