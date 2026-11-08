import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import type { RpcClient } from '@x/client';

import { useColors } from '@/theme/colors';

// BAARALI(07/11/2026): what the agent may say on the phone, and when it
// keeps quiet (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 B). The pace is a
// preset of the instance's own notification switches (notifications:
// setSettings, the categories core already gates on); quiet hours live in
// the instance (config/baarali-phone.json), read by its push sender
// (apps/server baarali-phone-push.ts) in this phone's time zone. Inside
// them nothing is lost: notifications arrive without sound.

type Categories = Record<string, boolean>;
export type Pace = 'quiet' | 'normal' | 'attentive';

/** What each pace lets through; the other switches (meetings on the Mac, spaces) are left as they are. */
const PACES: Record<Pace, Categories> = {
  quiet: { agent_permission: true, background_task: true, baarali_news: true, todo: false, meeting_notes_ready: false, new_email: false, chat_completion: false },
  normal: { agent_permission: true, background_task: true, baarali_news: true, todo: true, meeting_notes_ready: true, new_email: false, chat_completion: false },
  attentive: { agent_permission: true, background_task: true, baarali_news: true, todo: true, meeting_notes_ready: true, new_email: true, chat_completion: true },
};

const PACE_ROWS: { key: Pace; label: string; detail: string }[] = [
  { key: 'quiet', label: 'Discreet', detail: 'Approvals and your morning brief only' },
  { key: 'normal', label: 'Normal', detail: 'Also finished tasks and meeting notes' },
  { key: 'attentive', label: 'Attentive', detail: 'Also new important emails and every reply' },
];

const PREFS_PATH = 'config/baarali-phone.json';
const STARTS = ['21:00', '22:00', '23:00'];
const ENDS = ['06:00', '07:00', '08:00'];
const DEFAULT_QUIET = { start: '22:00', end: '07:00' };

interface Prefs {
  quiet: { start: string; end: string } | null;
  timeZone: string;
}

const phoneZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export function paceOf(categories: Categories): Pace | null {
  for (const key of Object.keys(PACES) as Pace[]) {
    if (Object.entries(PACES[key]).every(([k, v]) => categories[k] === v)) return key;
  }
  return null;
}

const tap = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};

export function AgentNotifications({ rpc }: { rpc: RpcClient | null }) {
  const colors = useColors();
  const [categories, setCategories] = useState<Categories | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<'reach' | 'save' | null>(null);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      setCategories((await rpc.call('notifications:getSettings', null)).categories);
    } catch {
      setError('reach');
    }
    try {
      const file = await rpc.call('workspace:readFile', { path: PREFS_PATH, encoding: 'utf8' });
      const parsed = JSON.parse(file.data) as Partial<Prefs>;
      setPrefs({ quiet: parsed.quiet ?? null, timeZone: phoneZone() });
    } catch {
      setPrefs({ quiet: null, timeZone: phoneZone() });
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rpc) return null;

  const pickPace = async (pace: Pace) => {
    if (!categories) return;
    tap();
    const next = { ...categories, ...PACES[pace] };
    setCategories(next);
    try {
      await rpc.call('notifications:setSettings', { categories: next as never });
      setError(null);
    } catch {
      setError('save');
      void load();
    }
  };

  const savePrefs = async (next: Prefs) => {
    setPrefs(next);
    try {
      await rpc.call('workspace:writeFile', { path: PREFS_PATH, data: JSON.stringify({ version: 1, ...next }, null, 2) });
      setError(null);
    } catch {
      setError('save');
      void load();
    }
  };

  const pace = categories ? paceOf(categories) : null;
  const quiet = prefs?.quiet ?? null;
  const caption = { fontSize: 13, lineHeight: 18, color: colors.secondaryLabel, paddingHorizontal: 16 };
  const section = { fontSize: 13, fontWeight: '600' as const, color: colors.secondaryLabel, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 6 };

  const chip = (value: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={value}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderCurve: 'continuous',
        backgroundColor: selected ? colors.label : colors.secondaryBackground,
      }}
    >
      <Text style={{ fontSize: 15, color: selected ? colors.background : colors.label, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Pressable>
  );

  return (
    <View>
      <Text style={section}>Your agent</Text>
      <Text style={[caption, { paddingBottom: 8 }]}>What Baarali tells you on this phone, even when the app is closed.</Text>
      {PACE_ROWS.map((row) => (
        <Pressable
          key={row.key}
          onPress={() => void pickPace(row.key)}
          disabled={!categories}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
            marginHorizontal: 8, paddingHorizontal: 8, borderRadius: 10, borderCurve: 'continuous',
            backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
          })}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: 16, color: colors.label }}>{row.label}</Text>
            <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{row.detail}</Text>
          </View>
          {pace === row.key ? <Image source="sf:checkmark" style={{ width: 17, height: 17 }} tintColor="#0a84ff" /> : null}
        </Pressable>
      ))}

      <Text style={section}>Quiet hours</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, gap: 10 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 16, color: colors.label }}>Silence at night</Text>
          <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>Notifications arrive without sound. Nothing is lost.</Text>
        </View>
        <Switch
          value={quiet !== null}
          disabled={!prefs}
          onValueChange={(on) => {
            if (prefs) void savePrefs({ ...prefs, timeZone: phoneZone(), quiet: on ? DEFAULT_QUIET : null });
          }}
        />
      </View>
      {quiet && prefs ? (
        <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 4 }}>
          <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>From</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>{STARTS.map((s) => chip(s, quiet.start === s, () => void savePrefs({ ...prefs, timeZone: phoneZone(), quiet: { ...quiet, start: s } })))}</View>
          <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>Until</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>{ENDS.map((e) => chip(e, quiet.end === e, () => void savePrefs({ ...prefs, timeZone: phoneZone(), quiet: { ...quiet, end: e } })))}</View>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[caption, { paddingTop: 12, color: colors.destructive }]}>
          {error === 'reach' ? 'Could not reach your agent. Check your connection.' : 'Could not save this. Please try again.'}
        </Text>
      ) : null}
    </View>
  );
}
