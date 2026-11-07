import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { sessions as sessionsShared } from '@x/shared';

import { useConnection } from '@/lib/connection';
import { speak, stopSpeaking } from '@/lib/voice';
import { useColors } from '@/theme/colors';

// BAARALI(07/11/2026): « Today » at the top of the home tab
// (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 D), what Claude Duet and Grok
// Bot put first: what waits for the person's yes, what the agent is doing,
// and what it did since yesterday. Read from the instance: the sessions
// whose latest turn is suspended on a permission, and the routines
// (`bg-task:list`). A yes here is the chat's own (respondToPermission).

const DAY_MS = 24 * 3600_000;
/** core schedule/utils.ts RETRY_BACKOFF_MS: an attempt older than this without a result is over. */
const RUNNING_MS = 5 * 60_000;
const SHOWN = 3;

interface Waiting {
  sessionId: string;
  turnId: string;
  toolCallId: string;
  what: string;
  where: string;
}

interface Routine {
  slug: string;
  name: string;
  active: boolean;
  lastAttemptAt?: string;
  lastRunAt?: string;
  lastRunSummary?: string;
}

type TurnEvent = { type: string; toolCallId?: string; toolName?: string; toolCallIds?: string[] };

const words = (slug: string) => {
  const s = slug.replace(/^builtin:|^mcp:/, '').replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** The permissions still waiting in a turn's events: asked, neither answered nor run. */
export function waitingIn(events: TurnEvent[]): Array<{ toolCallId: string; toolName: string }> {
  const asked = new Map<string, string>();
  for (const e of events) {
    if (e.type === 'tool_permission_required' && e.toolCallId) asked.set(e.toolCallId, e.toolName ?? '');
    if ((e.type === 'tool_permission_resolved' || e.type === 'tool_result') && e.toolCallId) asked.delete(e.toolCallId);
  }
  return [...asked].map(([toolCallId, toolName]) => ({ toolCallId, toolName }));
}

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/** Where the « Point du matin » routine writes today's brief (instance morning-brief.ts). */
export function briefPath(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `knowledge/Point du matin/${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.md`;
}

/** The brief's lines as a person reads them: no front matter, no headings, no list marks. */
export function briefLines(markdown: string): string[] {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  return body
    .split('\n')
    // Headings name the brief; the card says it already.
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

const tap = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};

export function Today() {
  const colors = useColors();
  const { rpc, sessions, events } = useConnection();
  const [waiting, setWaiting] = useState<Waiting[] | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [brief, setBrief] = useState<string[]>([]);
  const [listening, setListening] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessions || !rpc) return;
    try {
      const list = (await sessions.list()).sessions.filter(
        (s) => sessionsShared.isChatListSession(s) && s.latestTurnStatus === 'suspended' && s.latestTurnId,
      );
      const found: Waiting[] = [];
      for (const s of list.slice(0, 10)) {
        const turn = await sessions.getTurn(s.latestTurnId!).catch(() => null);
        for (const p of waitingIn((turn?.events ?? []) as TurnEvent[])) {
          found.push({ sessionId: s.sessionId, turnId: s.latestTurnId!, toolCallId: p.toolCallId, what: words(p.toolName), where: s.title ?? '' });
        }
      }
      setWaiting(found);
      setRoutines(((await rpc.call('bg-task:list', { limit: 200 })) as { items: Routine[] }).items);
      const file = await rpc.call('workspace:readFile', { path: briefPath(new Date()), encoding: 'utf8' }).catch(() => null);
      setBrief(file ? briefLines(file.data) : []);
    } catch {
      // Keep what was shown; the next event refreshes it.
    }
  }, [rpc, sessions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const off = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => {
      off();
      offResync();
    };
  }, [events, refresh]);
  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  if (!sessions || waiting === null) return null;

  const answer = async (items: Waiting[], decision: 'allow' | 'deny') => {
    tap();
    setBusy(items.length > 1 ? 'all' : items[0].toolCallId);
    setFailed(false);
    for (const w of items) {
      await sessions.respondToPermission(w.turnId, w.toolCallId, decision).catch(() => setFailed(true));
    }
    setBusy(null);
    void refresh();
  };

  const now = Date.now();
  const running = routines.filter((r) => r.active && time(r.lastAttemptAt) > (time(r.lastRunAt) || 0) && now - time(r.lastAttemptAt) < RUNNING_MS);
  const done = routines
    .filter((r) => now - time(r.lastRunAt) < DAY_MS && r.lastRunSummary)
    .sort((a, b) => time(b.lastRunAt) - time(a.lastRunAt))
    .slice(0, SHOWN);

  const label = { fontSize: 13, fontWeight: '600' as const, color: colors.secondaryLabel };
  const card = { marginHorizontal: 16, padding: 14, gap: 8, borderRadius: 14, borderCurve: 'continuous' as const, backgroundColor: colors.secondaryBackground };
  const button = (primary: boolean) => ({
    height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center' as const, alignItems: 'center' as const,
    backgroundColor: primary ? colors.label : 'transparent', borderWidth: primary ? 0 : 1, borderColor: colors.separator,
  });

  const nothing = !brief.length && !waiting.length && !running.length && !done.length;

  const listen = async () => {
    tap();
    if (listening) {
      stopSpeaking();
      setListening(false);
      return;
    }
    setListening(true);
    await speak(rpc!, brief.join('. ')).catch(() => setFailed(true));
    setListening(false);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={label}>Today</Text>
      </View>

      {nothing ? (
        <Text style={{ paddingHorizontal: 16, fontSize: 15, color: colors.tertiaryLabel }}>Nothing is waiting for you.</Text>
      ) : null}

      {brief.length ? (
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source="sf:sun.horizon" style={{ width: 18, height: 18 }} tintColor={colors.label} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.label }}>Your morning brief</Text>
            <Pressable accessibilityRole="button" onPress={() => void listen()} hitSlop={6} style={button(false)}>
              <Text style={{ fontSize: 15, color: colors.label }}>{listening ? 'Stop' : 'Listen'}</Text>
            </Pressable>
          </View>
          {brief.map((line, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: 21, color: colors.label }}>{line}</Text>
          ))}
        </View>
      ) : null}

      {waiting.length ? (
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source="sf:checkmark.shield" style={{ width: 16, height: 16 }} tintColor={colors.label} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.label }}>
              {waiting.length > 1 ? `${waiting.length} actions wait for your approval` : 'An action waits for your approval'}
            </Text>
          </View>
          {waiting.slice(0, SHOWN).map((w) => (
            <View key={w.toolCallId} style={{ gap: 8, paddingTop: 4 }}>
              <Pressable onPress={() => router.push({ pathname: '/chat', params: { id: w.sessionId } })}>
                <Text style={{ fontSize: 16, color: colors.label }}>{w.what}</Text>
                {w.where ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.tertiaryLabel }}>{w.where}</Text> : null}
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void answer([w], 'allow')} style={button(true)}>
                  {busy === w.toolCallId ? <ActivityIndicator color={colors.background} /> : <Text style={{ fontSize: 15, fontWeight: '600', color: colors.background }}>Approve</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void answer([w], 'deny')} style={button(false)}>
                  <Text style={{ fontSize: 15, color: colors.label }}>Deny</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {waiting.length > 1 ? (
            <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void answer(waiting, 'allow')} style={{ paddingTop: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>Approve all</Text>
            </Pressable>
          ) : null}
          {failed ? <Text accessibilityRole="alert" style={{ fontSize: 13, color: colors.destructive }}>Your answer was not sent</Text> : null}
        </View>
      ) : null}

      {running.map((r) => (
        <Pressable key={r.slug} onPress={() => router.push('/routines')} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <ActivityIndicator />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: colors.label }}>{r.name}</Text>
            <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>In progress</Text>
          </View>
        </Pressable>
      ))}

      {done.length ? (
        <Pressable onPress={() => router.push('/routines')} style={card}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>Done for you</Text>
          {done.map((r) => (
            <View key={r.slug} style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, color: colors.label }}>{r.name}</Text>
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: colors.secondaryLabel }}>{r.lastRunSummary}</Text>
            </View>
          ))}
        </Pressable>
      ) : null}
    </View>
  );
}
