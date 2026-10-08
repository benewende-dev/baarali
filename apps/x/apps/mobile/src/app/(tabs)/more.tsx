import { router, useFocusEffect, type Href } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { billing as billingShared } from '@x/shared';

import { useConnection } from '@/lib/connection';
import { daysLeft, type PartnerState } from '@/lib/partner-code';
import { useColors } from '@/theme/colors';

// BAARALI(07/10/2026): the More tab (mockup artboard 16,
// claude.ai/artifact/5hiVQMibobFRRitE7ictcw): the account and its week on
// top, then what is not used every day, each one push away.

type Info = billingShared.BillingInfo;

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rpc, pairing, status } = useConnection();
  const [info, setInfo] = useState<Info | null>(null);
  // A creator's partner code, while it can still be typed (08/10/2026).
  const [partner, setPartner] = useState<PartnerState | null>(null);

  useFocusEffect(useCallback(() => {
    if (!rpc) return;
    void rpc.call('billing:getInfo', null).then(setInfo, () => setInfo(null));
    void rpc.call('billing:getPartnerCode', null).then(setPartner, () => setPartner(null));
  }, [rpc]));

  const plan = info ? billingShared.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  // Baarali's week rides the « monthly » bucket, as on the desktop's gauge.
  const bucket = info?.monthly;
  const used = bucket && bucket.sanctionedCredits > 0 ? Math.min(1, bucket.usedCredits / bucket.sanctionedCredits) : 0;
  const paired = Boolean(pairing);

  const go = (path: Href) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.push(path);
  };
  const head = { marginHorizontal: 20, marginTop: 22, marginBottom: 6, fontSize: 13, fontWeight: '600' as const, color: colors.secondaryLabel };
  const group = { marginHorizontal: 16, borderRadius: 14, borderCurve: 'continuous' as const, backgroundColor: colors.background, overflow: 'hidden' as const };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.secondaryBackground }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24 }}
    >
      <Text style={{ marginHorizontal: 16, fontSize: 32, fontWeight: '700', color: colors.label }}>More</Text>

      {/* Only once the account answers: an empty card says nothing. */}
      {paired && info ? (
        <Pressable onPress={() => go('/settings')} style={[group, { marginTop: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.label }}>{(info.userEmail?.[0] ?? '·').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>
              {plan?.displayName ?? info.userEmail}
            </Text>
            {bucket ? (
              <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.secondaryBackground, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(used * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
              </View>
            ) : null}
          </View>
          <Image source="sf:chevron.right" style={{ width: 12, height: 12 }} contentFit="contain" tintColor={colors.tertiaryLabel} />
        </Pressable>
      ) : null}

      {/* Seen where people look: gone once applied, or after the days. */}
      {paired && partner?.canRedeem && partner.until && !partner.partner ? (
        <Pressable onPress={() => go('/partner-code')} accessibilityRole="button"
          style={({ pressed }) => [group, { marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <Image source="sf:gift.fill" style={{ width: 20, height: 20 }} contentFit="contain" tintColor={colors.onAccent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>Got a partner code?</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.secondaryLabel }}>
              {(() => {
                const n = daysLeft(partner.until);
                const left = n === 1 ? '1 day left' : `${n} days left`;
                return partner.gift ? `${partner.gift.plan} free for ${partner.gift.days} days · ${left}` : left;
              })()}
            </Text>
          </View>
          <Image source="sf:chevron.right" style={{ width: 12, height: 12 }} contentFit="contain" tintColor={colors.tertiaryLabel} />
        </Pressable>
      ) : null}

      {paired ? (
        <>
          <Text style={head}>Work</Text>
          <View style={group}>
            <Row icon="sf:person.2" label="Baarasseurs" detail="Create, change, see what they do" onPress={() => go('/baarasseurs')} />
            <Row icon="sf:checkmark.square" label="Tasks" detail="What you and your agents have to do" onPress={() => go('/tasks')} />
            <Row icon="sf:clock" label="Routines" detail="What Rowboat does on its own, on time" onPress={() => go('/routines')} />
            <Row icon="sf:books.vertical" label="Library" detail="Your notes and files" onPress={() => go('/notes')} />
            <Row icon="sf:folder" label="Projects" detail="Chats and files kept together" onPress={() => go('/projects')} />
            <Row icon="sf:square.grid.2x2" label="Apps" detail="The mini-apps Rowboat made for you" onPress={() => go('/apps')} last />
          </View>
        </>
      ) : null}

      <Text style={head}>Account</Text>
      <View style={group}>
        {paired ? <Row icon="sf:gearshape" label="Settings" detail="Voice, model, notifications" onPress={() => go('/settings')} /> : null}
        <Row icon="sf:bell" label="Notifications" onPress={() => go('/notifications')} />
        <Row
          icon={paired && status !== 'connected' ? 'sf:wifi.slash' : 'sf:laptopcomputer'}
          label={paired ? (pairing?.name ?? 'Your computer') : 'Connect your computer'}
          detail={paired ? (status === 'connected' ? 'Connected' : 'Reconnecting…') : undefined}
          onPress={paired ? () => go('/settings') : () => go('/pairing')}
          last
        />
      </View>
    </ScrollView>
  );
}

function Row({ icon, label, detail, onPress, last }: {
  icon: string;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14,
        backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
      })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source={icon} style={{ width: 18, height: 18 }} contentFit="contain" tintColor={colors.label} />
      </View>
      <View style={{ flex: 1, gap: 1, paddingVertical: 9, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.separator }}>
        <Text style={{ fontSize: 16, color: colors.label }}>{label}</Text>
        {detail ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.tertiaryLabel }}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
