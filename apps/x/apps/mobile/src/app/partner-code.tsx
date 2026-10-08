import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { billing as billingShared } from '@x/shared';

import { phoneLang } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { cleanCode, dayWords, giftProgress, initials, type PartnerCheck, type PartnerState } from '@/lib/partner-code';
import { useColors } from '@/theme/colors';

// BAARALI(08/10/2026): typing a creator's partner code (mockup v2). Checked
// as it is typed: whose it is shows before it is applied, with what it
// brings; then the offered plan's first day.

export default function PartnerCodeScreen() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [state, setState] = useState<PartnerState | null>(null);
  const [points, setPoints] = useState<string[]>([]);
  const [backTo, setBackTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<{ code: string; result: PartnerCheck } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rpc) return;
    void rpc.call('billing:getPartnerCode', null).then(setState, () => setState(null));
    void rpc.call('billing:getInfo', null).then(
      (info) => setBackTo(billingShared.getBillingPlanData(info.catalog, info.subscriptionPlanId)?.displayName ?? null),
      () => {},
    );
  }, [rpc]);

  // What the offered plan brings, worded as on the pricing page.
  const giftPlanId = state?.gift?.planId;
  useEffect(() => {
    if (!rpc || !giftPlanId) return;
    void rpc.call('billing:getPlans', { lang: phoneLang() }).then(
      (offers) => setPoints((offers?.plans.find((o) => o.levels.some((l) => l.id === giftPlanId))?.points ?? []).slice(0, 3)),
      () => {},
    );
  }, [rpc, giftPlanId]);

  const typed = cleanCode(code);
  useEffect(() => {
    if (!rpc || typed.length < 3) return;
    let live = true;
    const timer = setTimeout(() => {
      void rpc.call('billing:checkPartnerCode', { code: typed }).then((result) => { if (live) setChecked({ code: typed, result }); }, () => {});
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [rpc, typed]);

  const check = checked?.code === typed ? checked.result : null;
  const known = check?.ok ? check : null;
  const refused = check && !check.ok ? check.message : null;

  const apply = async () => {
    if (!rpc || !known || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.call('billing:redeemPartnerCode', { code: typed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const fresh = await rpc.call('billing:getPartnerCode', null).catch(() => null);
      setState(fresh ?? (state ? { ...state, partner: result.partner, canRedeem: false, until: null, gift: null } : null));
    } catch {
      setError('The code could not be checked. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const group = { marginHorizontal: 16, borderRadius: 14, borderCurve: 'continuous' as const, backgroundColor: colors.background, overflow: 'hidden' as const };
  const foot = { marginHorizontal: 20, marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.secondaryLabel };
  const button = { height: 48, borderRadius: 12, borderCurve: 'continuous' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.accent };

  if (!state) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}><ActivityIndicator /></View>;
  }

  // Applied (here or by the site's link): who recommended Baarali, and the offered days.
  if (state.partner) {
    const running = state.running;
    const progress = running ? giftProgress(running) : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <View style={[group, { padding: 16, gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source="sf:checkmark.circle.fill" style={{ width: 22, height: 22 }} tintColor={colors.accent} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.label }}>
              {running ? `${running.plan} is yours until ${dayWords(running.endsAt)}` : 'Code applied'}
            </Text>
          </View>
          {running && progress ? (
            <View style={{ gap: 6 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.secondaryBackground, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round((progress.today / progress.total) * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
              </View>
              <Text style={{ fontSize: 13, color: colors.secondaryLabel, fontVariant: ['tabular-nums'] }}>{`Day ${progress.today} of ${progress.total}`}</Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 15, color: colors.secondaryLabel }}>{`Recommended by ${state.partner}`}</Text>
        </View>
        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <Pressable onPress={() => router.back()} style={button}>
            <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 16 }}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!state.canRedeem || !state.until) {
    return (
      <View style={{ flex: 1, padding: 24, backgroundColor: colors.secondaryBackground }}>
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.secondaryLabel }}>A partner code is typed within 7 days of signing up.</Text>
      </View>
    );
  }

  const gift = state.gift;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
      <View style={[group, { padding: 12, gap: 12 }]}>
        <View style={{ height: 50, borderRadius: 11, borderCurve: 'continuous', borderWidth: 1, borderColor: known ? colors.accent : colors.separator, backgroundColor: colors.secondaryBackground, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={(t) => { setCode(t); setError(null); }}
            onSubmitEditing={() => void apply()}
            placeholder="AWATECH"
            placeholderTextColor={colors.tertiaryLabel}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            accessibilityLabel="Partner code"
            style={{ flex: 1, fontSize: 18, fontWeight: '600', letterSpacing: 1.5, color: colors.label, fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' }}
          />
          {typed.length >= 3 && !check ? <ActivityIndicator size="small" /> : known ? <Image source="sf:checkmark.circle.fill" style={{ width: 20, height: 20 }} tintColor={colors.accent} /> : null}
        </View>
        {refused || error ? <Text style={{ fontSize: 13, color: colors.destructive }}>{error ?? refused}</Text> : null}
        {known ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, borderCurve: 'continuous', backgroundColor: colors.secondaryBackground }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 14 }}>{initials(known.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>{known.name}</Text>
              {known.network || known.city ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.secondaryLabel }}>{[known.network, known.city].filter(Boolean).join(' · ')}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => void apply()} disabled={!known || busy} accessibilityRole="button" style={[button, { opacity: known ? 1 : 0.45 }]}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 16 }}>{gift ? `Get ${gift.plan}` : 'Apply'}</Text>}
        </Pressable>
      </View>

      {gift ? (
        <>
          <Text style={{ marginHorizontal: 20, marginTop: 22, marginBottom: 6, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>
            {`${gift.plan} free for ${gift.days} days`}
          </Text>
          {points.length ? (
            <View style={[group, { paddingVertical: 4 }]}>
              {points.map((point, i) => (
                <View key={point} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i === points.length - 1 ? 0 : 0.5, borderBottomColor: colors.separator }}>
                  <Image source="sf:checkmark" style={{ width: 14, height: 14, marginTop: 3 }} tintColor={colors.accent} />
                  <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: colors.label }}>{point}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={foot}>
            {backTo
              ? `Then back to ${backTo}. No card, nothing to pay. Enter the code before ${dayWords(state.until)}.`
              : `No card, nothing to pay. Enter the code before ${dayWords(state.until)}.`}
          </Text>
        </>
      ) : (
        <Text style={foot}>{`Did a creator recommend Baarali? Enter their code before ${dayWords(state.until)}.`}</Text>
      )}
    </ScrollView>
  );
}
