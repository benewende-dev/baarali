import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { sessions as sessionsShared } from '@x/shared';
import type { DrawerNavigationProp } from 'expo-router/drawer';

import * as analytics from '@/lib/analytics';
import { ModelPill } from '@/components/model-picker';
import { TurnView } from '@/components/turn-view';
import { useConnection } from '@/lib/connection';
import { useLiveTurn } from '@/lib/use-live-turn';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';
import { baarasseurs } from '@x/shared';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { speak, speakableOpening, stopSpeaking, useReadAloud, useVoiceInput } from '@/lib/voice';

/** The reply's text: the last model call that answered in words. */
function replyText(state: { modelCalls: Array<{ response?: { content?: unknown } | null }> }): string {
  for (let i = state.modelCalls.length - 1; i >= 0; i--) {
    const content = state.modelCalls[i].response?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p: { type?: string; text?: string }) => (p.type === 'text' && typeof p.text === 'string' ? p.text : '')).join('')
        : '';
    if (text.trim()) return text;
  }
  return '';
}

// The home screen IS a chat (Claude/ChatGPT pattern). `id` picks the session;
// empty/no id is the new-chat state — the session is created lazily on the
// first send, so abandoned "new chats" never litter the history.

function Turn({ turnId, isLatest, onStreaming, onFinished }: {
  turnId: string;
  isLatest: boolean;
  onStreaming?: (streaming: boolean) => void;
  /** The reply just ended while on screen (not an old turn reopened): its text. */
  onFinished?: (text: string) => void;
}) {
  const colors = useColors();
  const { sessions } = useConnection();
  const { state, liveText, error } = useLiveTurn(turnId, { deltas: isLatest });

  // The composer's send/stop toggle follows the latest turn's liveness.
  const live = Boolean(state && !state.terminal);
  useEffect(() => {
    if (isLatest) onStreaming?.(live);
  }, [isLatest, live, onStreaming]);

  const seenLive = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (!state.terminal) {
      seenLive.current = true;
    } else if (seenLive.current && isLatest) {
      seenLive.current = false;
      onFinished?.(replyText(state));
    }
  }, [state, isLatest, onFinished]);

  const onPermission = useCallback(
    (toolCallId: string, decision: 'allow' | 'deny') => {
      void sessions?.respondToPermission(turnId, toolCallId, decision);
    },
    [sessions, turnId],
  );
  const onAskHuman = useCallback(
    (toolCallId: string, answer: string) => {
      void sessions?.respondToAskHuman(turnId, toolCallId, answer);
    },
    [sessions, turnId],
  );

  if (error) return <Text selectable style={{ color: colors.destructive, marginBottom: 8 }}>{error}</Text>;
  if (!state) return <ActivityIndicator style={{ marginVertical: 12 }} />;
  return (
    <TurnView
      state={state}
      liveText={isLatest ? liveText : undefined}
      streaming={isLatest && !state.terminal}
      onPermission={onPermission}
      onAskHuman={onAskHuman}
    />
  );
}

// Mac chat — reachable once a Mac is paired (Spaces is the app's home).
export default function ChatScreen() {
  const params = useLocalSearchParams<{ id?: string; agent?: string; draft?: string }>();
  const navigation = useNavigation<DrawerNavigationProp<Record<string, undefined>>>();
  return (
    <ChatView
      id={params.id || null}
      agent={params.agent || null}
      initialDraft={params.draft}
      onCreated={(sessionId) => router.setParams({ id: sessionId })}
      onEmptyPress={() => navigation.openDrawer()}
    />
  );
}

/**
 * The conversation itself (BAARALI 06/10/2026: out of the screen, so the
 * Baarasseurs page shows it beside its list on a wide screen — a foldable
 * opened). `agent`: a new chat goes to that baarasseur. `embedded`: no
 * floating header above it.
 */
export function ChatView({ id, agent, onCreated, onEmptyPress, embedded = false, initialDraft }: {
  id: string | null;
  agent: string | null;
  onCreated: (sessionId: string) => void;
  onEmptyPress?: () => void;
  embedded?: boolean;
  /** Text put in the composer, e.g. « New routine: » from the Routines screen. */
  initialDraft?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const models = useModels();
  const { pairing, sessions, events, rpc } = useConnection();
  const voice = useVoiceInput(rpc);
  const [readAloud, setReadAloud] = useReadAloud();
  const params = { agent };
  const { team } = useBaarasseurs();
  // The web search switch, as on the desktop's composer.
  const [search, setSearch] = useState(false);
  const [session, setSession] = useState<sessionsShared.SessionState | null>(null);
  const [draft, setDraft] = useState(initialDraft ?? '');
  useEffect(() => { if (initialDraft) setDraft(initialDraft); }, [initialDraft]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(async () => {
    if (!sessions || !id) {
      setSession(null);
      return;
    }
    try {
      setSession(await sessions.get(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessions, id]);

  useEffect(() => {
    setSession(null);
    void refresh();
  }, [refresh]);

  const turnRefs = session?.turns ?? [];
  const knownTurnIds = turnRefs.map((t) => t.turnId).join(',');

  useEffect(() => {
    if (!events || !id) return;
    const known = new Set(knownTurnIds.split(',').filter(Boolean));
    const offEvents = events.on('sessions:events', (payload) => {
      const e = payload as { sessionId?: string };
      if (e.sessionId === id) void refresh();
    });
    const offTurns = events.on('turns:events', (payload) => {
      const e = payload as { turnId: string; sessionId: string | null };
      if (e.sessionId === id && !known.has(e.turnId)) void refresh();
    });
    const offStatus = events.onStatus((status) => {
      if (status === 'connected') void refresh();
    });
    const offResync = events.onResync(() => void refresh());
    return () => {
      offEvents();
      offTurns();
      offStatus();
      offResync();
    };
  }, [events, id, refresh, knownTurnIds]);

  const latestTurnId = turnRefs[turnRefs.length - 1]?.turnId;
  const [latestStreaming, setLatestStreaming] = useState(false);

  const send = useCallback(async (spoken?: string) => {
    const content = (spoken ?? draft).trim();
    if (!content || !sessions) return;
    setSending(true);
    if (spoken === undefined) setDraft('');
    try {
      let sessionId = id;
      if (!sessionId) {
        sessionId = (await sessions.create({})).sessionId;
        onCreated(sessionId);
      }
      const agentId = turnRefs[turnRefs.length - 1]?.agentId ?? (params.agent || 'copilot');
      const model = models.current;
      await sessions.sendMessage(sessionId, { role: 'user', content }, {
        agent: {
          agentId,
          overrides: {
            ...(model ? { model: { provider: model.provider, model: model.model } } : {}),
            ...(search || spoken !== undefined
              ? { composition: { ...(search ? { searchEnabled: true } : {}), ...(spoken !== undefined ? { voiceInput: true } : {}) } }
              : {}),
          },
        },
      });
      analytics.mobileMessageSent();
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDraft(content); // don't lose the message (a spoken one lands in the box)
    } finally {
      setSending(false);
    }
  }, [draft, sessions, id, turnRefs, refresh, models.current, params.agent, search, onCreated]);

  // Seed the model pill's label once connected.
  const modelsRefresh = models.refresh;
  useEffect(() => {
    void modelsRefresh();
  }, [modelsRefresh]);

  const stop = useCallback(() => {
    stopSpeaking();
    if (latestTurnId) void sessions?.stopTurn(latestTurnId);
  }, [sessions, latestTurnId]);

  // Tap to speak, tap again to send what was said.
  const onMic = useCallback(async () => {
    try {
      if (voice.state === 'idle') {
        if ((await voice.start()) === 'denied') {
          Alert.alert('Microphone', 'Allow Baarali to use the microphone in Settings to talk to it.');
        } else if (process.env.EXPO_OS === 'ios') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        return;
      }
      if (voice.state !== 'recording') return;
      const text = await voice.finish();
      if (text) await send(text);
      else setError('Nothing was heard. Try again, a little closer to the phone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [voice, send]);

  // With the speaker on, the reply that just ended is read aloud.
  const onFinished = useCallback((text: string) => {
    if (!readAloud || !rpc) return;
    const opening = speakableOpening(text);
    if (opening) void speak(rpc, opening).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [readAloud, rpc]);

  if (pairing === undefined) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (pairing === null) return <Redirect href="/pairing" />;

  const agentNow = turnRefs[turnRefs.length - 1]?.agentId ?? params.agent;
  const baarasseurId = baarasseurs.baarasseurIdOf(agentNow);
  const baarasseur = baarasseurId ? team?.find((b) => b.id === baarasseurId) ?? null : null;
  // Below the floating header on its own screen; at the top when embedded.
  const top = embedded ? 8 : insets.top + 52;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? 92 : 0}
      >
        {/* Whom you are talking to, in a baarasseur's chat (below the floating header). */}
        {baarasseur && id && !embedded ? (
          <View style={{ position: 'absolute', top: insets.top + 6, left: 64, right: 16, zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 }}>
            <BaarasseurAvatar b={baarasseur} size={30} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.label }}>{baarasseur.name}</Text>
          </View>
        ) : null}
        {id ? (
          <ScrollView
            ref={scrollRef}
            // The header is transparent (floating hamburger) — pad the content
            // below it by hand: safe area + standard header height.
            contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {error && <Text selectable style={{ color: colors.destructive }}>{error}</Text>}
            {turnRefs.map((ref) => (
              <Turn
                key={ref.turnId}
                turnId={ref.turnId}
                isLatest={ref.turnId === latestTurnId}
                onStreaming={setLatestStreaming}
                onFinished={onFinished}
              />
            ))}
          </ScrollView>
        ) : baarasseur ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 }}>
            <BaarasseurAvatar b={baarasseur} size={72} />
            <Text style={{ fontSize: 22, fontWeight: '600', color: colors.label }}>{baarasseur.name}</Text>
            {baarasseur.role ? <Text style={{ fontSize: 15, color: colors.tertiaryLabel }}>{baarasseur.role}</Text> : null}
          </View>
        ) : (
          <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }} onPress={onEmptyPress}>
            <Text style={{ fontSize: 22, fontWeight: '600', color: colors.label }}>Rowboat</Text>
            <Text style={{ fontSize: 15, color: colors.tertiaryLabel }}>Ask anything to get started</Text>
          </Pressable>
        )}

        {/* Composer — Claude-style card: input on top, model pill + send below */}
        <View
          style={{
            marginHorizontal: 10, marginTop: 6, marginBottom: 4,
            backgroundColor: colors.background,
            borderWidth: 1, borderColor: colors.separator,
            borderRadius: 22, borderCurve: 'continuous',
            paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8,
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}
        >
          <TextInput
            style={{ fontSize: 16, color: colors.label, maxHeight: 120, paddingHorizontal: 2 }}
            placeholder={baarasseur ? `Write to ${baarasseur.name}…` : 'Message Rowboat'}
            placeholderTextColor={colors.tertiaryLabel}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: search }}
              accessibilityLabel="Web search"
              onPress={() => setSearch((on) => !on)}
              hitSlop={6}
              style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6,
                backgroundColor: search ? colors.accent : 'transparent',
                borderWidth: search ? 0 : 1, borderColor: colors.separator,
              }}
            >
              <Image source="sf:globe" style={{ width: 16, height: 16 }} tintColor={search ? colors.onAccent : colors.secondaryLabel} />
            </Pressable>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: readAloud }}
              accessibilityLabel="Read replies aloud"
              onPress={() => setReadAloud(!readAloud)}
              hitSlop={6}
              style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6,
                backgroundColor: readAloud ? colors.accent : 'transparent',
                borderWidth: readAloud ? 0 : 1, borderColor: colors.separator,
              }}
            >
              <Image source="sf:speaker.wave.2" style={{ width: 16, height: 16 }} tintColor={readAloud ? colors.onAccent : colors.secondaryLabel} />
            </Pressable>
            <ModelPill models={models} />
            <View style={{ flex: 1 }} />
            {voice.state === 'recording' ? (
              <Text style={{ fontSize: 13, color: colors.secondaryLabel, marginRight: 8 }}>Listening… tap to send</Text>
            ) : voice.state === 'transcribing' ? (
              <ActivityIndicator style={{ marginRight: 8 }} />
            ) : null}
            {sending || latestStreaming ? (
              <RoundButton icon="sf:stop.fill" onPress={stop} />
            ) : draft.trim() ? (
              <RoundButton icon="sf:arrow.up" onPress={() => void send()} />
            ) : (
              <RoundButton
                icon={voice.state === 'recording' ? 'sf:stop.fill' : 'sf:mic.fill'}
                onPress={() => void onMic()}
                disabled={voice.state === 'transcribing' || !rpc}
                label={voice.state === 'recording' ? 'Send what I said' : 'Talk'}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoundButton({ icon, onPress, disabled, label }: { icon: string; onPress: () => void; disabled?: boolean; label?: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accent, opacity: disabled ? 0.3 : 1, marginBottom: 2,
      }}
    >
      <Image source={icon} style={{ width: 15, height: 15 }} tintColor={colors.onAccent} />
    </Pressable>
  );
}
