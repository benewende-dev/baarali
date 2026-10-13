import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { billing } from '@x/shared';
import { useConnection } from '@/lib/connection';
import { withPlanAccess } from '@/lib/plan-access-copy';
import { phoneLang } from '@/lib/baarasseurs';
import { useColors } from '@/theme/colors';
// BAARALI(13/10/2026): offers are the desktop's live, localized catalog;
// unavailable payment is never replaced by a simulated purchase.
export default function PlansScreen() {
  const colors = useColors(); const { rpc } = useConnection();
  const [offers, setOffers] = useState<billing.PlanOffers | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true; setError(false); setOffers(null);
    if (!rpc) { setError(true); return; }
    void Promise.all([rpc.call('billing:getPlans', { lang: phoneLang() }), rpc.call('billing:getInfo', null)]).then(([catalog, info]) => {
      if (alive) { setOffers(catalog ? withPlanAccess(catalog) : null); setPlanId(info?.subscriptionPlanId ?? null); setError(!catalog); }
    }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [rpc, retry]));
  return <ScrollView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
    {error ? <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44 }}><Text style={{ color: colors.accent }}>Plans could not be loaded. Tap to retry.</Text></Pressable> : !offers ? <ActivityIndicator color={colors.label} /> : <>
      <Text style={{ color: colors.label, fontSize: 16, lineHeight: 23, fontWeight: '600' }}>{offers.lead}</Text>
      {[...offers.plans].sort((a, b) => Number(b.levels.some(level => level.id === planId)) - Number(a.levels.some(level => level.id === planId))).map(plan => <View key={plan.id} style={{ padding: 20, borderRadius: 18, backgroundColor: colors.background, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.label }}>{plan.name}</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>{plan.for}</Text>
        {plan.levels.map(level => <View key={level.id} style={{ paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.separator, gap: 5 }}>
          {level.label && <Text style={{ color: colors.label, fontSize: 16 }}>{level.label}</Text>}
          <Text style={{ color: colors.label, fontSize: 20, fontWeight: '500' }}>{level.price ? `${level.price.xof} · ${level.price.eur}` : 'Free'}</Text>
          <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>{level.per}</Text>
          {level.note && <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>{level.note}</Text>}
          {level.id === planId && <Text style={{ color: colors.accent, fontSize: 14 }}>Current plan</Text>}
        </View>)}
        {(expanded.includes(plan.id) ? plan.points : plan.points.slice(0, 3)).map(point => <Text key={point} style={{ color: colors.label, fontSize: 14, lineHeight: 21 }}>{point}</Text>)}
        {plan.points.length > 3 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded.includes(plan.id) }} onPress={() => setExpanded(value => value.includes(plan.id) ? value.filter(id => id !== plan.id) : [...value, plan.id])} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 14 }}>{expanded.includes(plan.id) ? 'Show less' : 'View details'}</Text></Pressable>}
        {!plan.free && <Pressable disabled accessibilityRole="button" accessibilityState={{ disabled: true }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.secondaryBackground }}><Text style={{ color: colors.secondaryLabel }}>{offers.soon}</Text></Pressable>}
      </View>)}
      <Text style={{ color: colors.secondaryLabel, fontSize: 13, lineHeight: 20 }}>{offers.foot}</Text>
    </>}
  </ScrollView>;
}
