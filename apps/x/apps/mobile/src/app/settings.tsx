import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { billing as billingShared } from '@x/shared';

import { phoneLang } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import * as analytics from '@/lib/analytics';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the settings on the phone (validated mockup): the
// account with its plan and the week's use, the default model, the computer
// it is linked to, notifications, language and theme (the phone's own).

type Info = billingShared.BillingInfo;
type PartnerState = billingShared.PartnerCodeState;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
const PLANS_URL = 'https://baarali.com/tarifs';

export default function SettingsScreen() {
  const colors = useColors();
  const { rpc, pairing, unpair, status } = useConnection();
  const models = useModels();
  const [info, setInfo] = useState<Info | null>(null);
  // A creator's partner code (08/10/2026): typed in the days after signing up.
  const [partner, setPartner] = useState<PartnerState | null>(null);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

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

  const redeem = async () => {
    if (!rpc || !code.trim() || codeBusy) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const result = await rpc.call('billing:redeemPartnerCode', { code: code.trim() });
      if (result.ok) {
        setApplied(result.gift ? `${result.gift.plan} is yours until ${day(result.gift.endsAt)}.` : null);
        setPartner((p) => (p ? { ...p, partner: result.partner, canRedeem: false, until: null } : p));
        void rpc.call('billing:getInfo', null).then(setInfo, () => {});
      } else {
        setCodeError(result.message);
      }
    } catch {
      setCodeError('The code could not be checked. Try again in a moment.');
    } finally {
      setCodeBusy(false);
    }
  };

  const group = { marginHorizontal: 16, borderRadius: 14, borderCurve: 'continuous' as const, backgroundColor: colors.background, overflow: 'hidden' as const };
  const head = { marginHorizontal: 20, marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: '600' as const, color: colors.secondaryLabel };
  const foot = { marginHorizontal: 20, marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.tertiaryLabel };
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
        <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{plan?.displayName ?? '—'}</Text>
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

      {partner?.partner ? (
        <>
          <View style={[group, { marginTop: 18 }]}>
            <SRow label="Recommended by" value={partner.partner} />
          </View>
          {applied ? <Text style={foot}>{applied}</Text> : null}
        </>
      ) : partner?.canRedeem && partner.until ? (
        <>
          <Text style={head}>Partner code</Text>
          <View style={[group, { padding: 12, gap: 10 }]}>
            <TextInput value={code} onChangeText={(t) => { setCode(t); setCodeError(null); }} onSubmitEditing={() => void redeem()}
              placeholder="AWATECH" placeholderTextColor={colors.tertiaryLabel} autoCapitalize="characters" autoCorrect={false} maxLength={16}
              accessibilityLabel="Partner code" returnKeyType="done"
              style={{ height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 0.5, borderColor: colors.separator, fontSize: 16, color: colors.label, backgroundColor: colors.secondaryBackground }} />
            {codeError ? <Text style={{ fontSize: 13, color: colors.destructive }}>{codeError}</Text> : null}
            <Pressable onPress={() => void redeem()} disabled={!code.trim() || codeBusy}
              style={{ height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: !code.trim() ? 0.5 : 1 }}>
              {codeBusy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 15 }}>Apply</Text>}
            </Pressable>
          </View>
          <Text style={foot}>
            {partner.gift
              ? `Did a creator recommend Baarali? Their code gives you ${partner.gift.plan} for ${partner.gift.days} days. Enter it before ${day(partner.until)}.`
              : `Did a creator recommend Baarali? Enter their code before ${day(partner.until)}.`}
          </Text>
        </>
      ) : null}

      <Text style={head}>Baarali</Text>
      <View style={group}>
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
