import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { billing } from '@x/shared';
import { getBillingPlanData } from '@x/shared/dist/billing.js';
import { sessionResetText, sessionStartedText, nextSessionText, weekResetText, weekPaceText, usageHeadline } from '@/lib/usage-reset';
import { costRanges, entryLabel, MEDIA, priceText, when } from '@/lib/media-credits';
import { usageMetrics } from '@/lib/usage-metrics';
import { say } from '@/lib/say';
import { useColors } from '@/theme/colors';
import { router } from 'expo-router';

// BAARALI(13/10/2026): port Settings › Usage with the desktop's own quota
// and media formatting helpers. Balances, history and prices are server data.
export function UsagePanel({ info, media, mediaFailed, now, loadedAt }: { info: billing.BillingInfo; media: billing.MediaCredits | null; mediaFailed: boolean; now: number; loadedAt: number }) {
  const colors = useColors();
  const metrics = usageMetrics(info, now);
  const plan = getBillingPlanData(info.catalog, info.subscriptionPlanId);
  const [showAll, setShowAll] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const minutes = Math.max(0, Math.floor((now - loadedAt) / 60000));
  const section = { padding: 18, borderRadius: 18, backgroundColor: colors.background, gap: 14 };
  return <View style={{ gap: 16 }}>
    <View style={section}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.label }}>{plan?.displayName ?? say('No plan')}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/plans')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 14, color: colors.accent }}>Change plan</Text></Pressable></View>
      <Text style={{ fontSize: 17, lineHeight: 24, fontWeight: '500', color: colors.label }}>{say(usageHeadline(100 - metrics.session, 100 - metrics.week, metrics.sessionOpen))}</Text>
      <Meter title="5-hour session" pct={metrics.session} lines={metrics.sessionOpen ? [sessionResetText(info.daily.resetsAt, now), sessionStartedText(info.daily.resetsAt, now)] : [sessionResetText(undefined, now), nextSessionText(now)]} />
      <Meter title="This week" pct={metrics.week} lines={[weekResetText(info.monthly.resetsAt, now), weekPaceText(100 - metrics.week, info.monthly.resetsAt, now)]} />
      {info.store.availableCredits > 0 && <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 15, color: colors.label }}>Bonus credits</Text><Text style={{ fontSize: 15, color: colors.label }}>{`${info.store.availableCredits.toLocaleString()} credits`}</Text></View>}
      <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{minutes < 1 ? 'Last updated: just now' : `Last updated: ${minutes} min ago`}</Text>
    </View>
    {mediaFailed && <Text style={{ fontSize: 14, lineHeight: 21, color: colors.destructive }}>Media credits could not be refreshed. Please try again.</Text>}
    {media && <>
      <View style={section}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>Media credits</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}><Text style={{ fontSize: 32, fontWeight: '600', color: colors.label }}>{media.balance.toLocaleString()}</Text><Text style={{ fontSize: 15, color: colors.secondaryLabel }}>credits</Text></View>
        <Text style={{ fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>For images, videos and voices. They do not expire and do not touch your session or your week.</Text>
        {(showAll ? media.history : media.history.slice(0, 5)).map((entry, index) => <View key={`${entry.at}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.separator }}><View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 14, color: colors.label }}>{entryLabel(entry)}</Text><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{Number.isFinite(Date.parse(entry.at)) ? when.format(Date.parse(entry.at)) : '—'}</Text></View><Text style={{ fontSize: 14, fontWeight: '500', color: colors.label }}>{entry.credits > 0 ? `+${entry.credits}` : `${entry.credits}`}</Text></View>)}
        {!media.history.length && <Text style={{ color: colors.secondaryLabel, fontSize: 14 }}>No media credits used yet.</Text>}
        {media.history.length > 5 && <Pressable accessibilityRole="button" onPress={() => setShowAll(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 14, color: colors.accent }}>{showAll ? 'Show less' : 'Show all history'}</Text></Pressable>}
      </View>
      <View style={section}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>Top up</Text>
        <View style={{ gap: 8 }}>{media.packs.map(pack => {
          const selected = (pick ?? media.packs[1]?.id ?? media.packs[0]?.id) === pack.id;
          return <Pressable key={pack.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setPick(pack.id)} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: selected ? colors.accent : colors.separator, backgroundColor: colors.secondaryBackground }}><View style={{ flex: 1, gap: 4 }}>{pack.prices.filter(price => price.currency === 'EUR' || price.currency === 'XOF').map(price => <Text key={price.currency} style={{ fontSize: price.currency === 'EUR' ? 17 : 13, color: price.currency === 'EUR' ? colors.label : colors.secondaryLabel }}>{priceText(price.amount, price.currency)}</Text>)}</View><Text style={{ fontSize: 14, fontWeight: '500', color: colors.label }}>{`${pack.credits} credits`}</Text></Pressable>;
        })}</View>
        <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>Pay with</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.label }}>Orange Money · Moov Money · Wave · Card</Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.secondaryLabel }}>Payment is not open yet. Until then, credits are added by hand.</Text>
        <Pressable disabled accessibilityRole="button" accessibilityState={{ disabled: true }} style={{ minHeight: 44, borderRadius: 22, backgroundColor: colors.secondaryBackground, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>Coming soon</Text></Pressable>
      </View>
      {media.costs.length > 0 && <View style={section}><Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>What each thing costs</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>Messages, summaries, emails, scheduled tasks</Text><Text style={{ fontSize: 14, color: colors.label }}>Count in the session and the week</Text>{costRanges(media.costs).map(range => <View key={range.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, fontSize: 14, color: colors.label }}>{say(MEDIA[range.kind] ?? range.kind)}</Text><Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{say(range.text)}</Text></View>)}</View>}
    </>}
    <View style={section}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }} onPress={() => setRulesOpen(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 16, fontWeight: '500', color: colors.label }}>How the limits work</Text></Pressable>
      {rulesOpen && <View style={{ gap: 18 }}><Rule title="A session lasts 5 hours" text="It opens with your first message. When it ends, your next message opens a new one, with everything available again." /><Rule title="The week renews by itself" text="Seven days after it began, the week starts over. If it runs out before then, wait for the renewal or move to a bigger plan." /><Rule title="Images, videos and voices are separate" text="They are paid with media credits, which these limits do not touch." /></View>}
    </View>
  </View>;
}

function Meter({ title, pct, lines }: { title: string; pct: number; lines: Array<string | undefined> }) {
  const colors = useColors();
  return <View style={{ gap: 8, paddingVertical: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ fontSize: 16, fontWeight: '500', color: colors.label }}>{say(title)}</Text><Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{`${pct}% used`}</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel={say(title)} accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.secondaryBackground }}><View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: pct >= 90 ? colors.destructive : colors.accent }} /></View>
    {lines.filter(Boolean).map(line => <Text key={line} style={{ fontSize: 13, lineHeight: 20, color: colors.secondaryLabel }}>{say(line!)}</Text>)}
  </View>;
}
function Rule({ title, text }: { title: string; text: string }) {
  const colors = useColors();
  return <View style={{ gap: 6 }}><Text style={{ fontSize: 15, fontWeight: '500', color: colors.label }}>{say(title)}</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>{say(text)}</Text></View>;
}
