import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EventsClient, SessionsClient } from '@x/client';
import type { RpcClient } from '@x/client';

import { API_URL } from '@/lib/baarali-sign-in';
import { FLUX_SAMPLE_RATES, FluxListener, type FluxEvent } from '@/lib/baarali-flux';
import { SpeechQueue } from '@/lib/baarali-speech';
import {
  FILLERS, SPOKEN, SentenceSplitter, approvalQuestion, isBackchannel, isBargeIn, isEcho, looksUnfinished, progressPhrase, speakableSoFar, yesOrNo,
} from '@/lib/baarali-turns';

// BAARALI(07/11/2026): the phone's conversation mode, continuous
// (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 E). It replaces the walkie-talkie
// loop of chat.tsx when the phone is signed in to Baarali (the listening
// socket opens with that session); paired with a Mac, the old loop stays.
//
// The agent stays whole in the middle (the chat's own turn: tools, memory,
// approvals): only the edges change, as the voice interview advised —
// - the mic streams to Flux, which ends a turn from what was said;
// - a sentence left hanging waits a moment more for the rest;
// - a filler answers at once, and each tool says what it does;
// - the reply is spoken sentence by sentence while it is written;
// - the person cuts in with real words; « hm », a cough or the agent's own
//   voice through the speaker do not;
// - an action waiting for a yes is asked aloud, and « oui » / « non » answers it;
// - push-to-talk for noisy places: only the release ends the turn.

export type ConversationState = 'off' | 'listening' | 'thinking' | 'speaking';

/** A filler only when the reply has not started speaking by then. */
const FILLER_AFTER_MS = 900;
/** A tool's words at most this often. */
const PROGRESS_EVERY_MS = 8_000;
/** A hanging sentence gets this long for its rest before it goes as is. */
const HANGING_WAIT_MS = 1_500;

const words = (slug: string) => slug.replace(/^builtin:|^mcp:/, '').replace(/[_-]+/g, ' ').trim();

export interface LiveConversationDeps {
  rpc: RpcClient | null;
  sessions: SessionsClient | null;
  events: EventsClient | null;
  /** The phone's sign-in session; null: the old loop (paired with a Mac). */
  session: string | null;
  /** Sends what was said, as the chat sends a spoken message. */
  send: (spoken: string) => Promise<boolean>;
  /** The chat's session id, known once the first message created it. */
  sessionId: () => string | null;
  /** The chat's turns, to tell the reply's new turn from the old ones. */
  knownTurns: () => string[];
  onState: (state: ConversationState) => void;
  onHeard: (text: string) => void;
  onError: (message: string) => void;
}

export function useLiveConversation(deps: LiveConversationDeps) {
  const d = useRef(deps);
  d.current = deps;
  const [pushToTalk, setPushToTalk] = useState(false);
  const manualRef = useRef(false);
  const flux = useRef<FluxListener | null>(null);
  const speech = useRef<SpeechQueue | null>(null);
  const on = useRef(false);
  const state = useRef<ConversationState>('off');
  const held = useRef('');
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reply = useRef<{ turnId: string | null; text: string; spokenUpTo: number; done: boolean; splitter: SentenceSplitter; release: (() => void) | null } | null>(null);
  const known = useRef<Set<string>>(new Set());
  const approval = useRef<{ turnId: string; toolCallId: string; asked: number } | null>(null);
  const lastProgress = useRef(0);
  const offTurns = useRef<(() => void) | null>(null);
  const fillerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (next: ConversationState) => {
    state.current = next;
    d.current.onState(next);
  };

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!on.current) return;
    if (!flux.current) {
      const { session } = d.current;
      if (!session || !FLUX_SAMPLE_RATES.includes(buffer.sampleRate)) return;
      flux.current = new FluxListener({ apiUrl: API_URL, session, sampleRate: buffer.sampleRate, onEvent: (e) => onFlux(e) });
      flux.current.start();
      if (manualRef.current) flux.current.manual(true);
    }
    flux.current.push(buffer.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer });

  const say = (text: string, cachedPhrase = false) => {
    if (!speech.current) return;
    if (cachedPhrase) speech.current.sayCached(text);
    else speech.current.say(text);
  };

  /** What the reply has to say so far, sentence by sentence. */
  const speakReply = (final: boolean) => {
    const r = reply.current;
    if (!r || r.done) return;
    const { text, done } = speakableSoFar(r.text, final);
    const fresh = text.slice(r.spokenUpTo);
    r.spokenUpTo = text.length;
    const pieces = [...r.splitter.push(fresh), ...(done || final ? r.splitter.flush() : [])];
    if (pieces.length) {
      if (fillerTimer.current) clearTimeout(fillerTimer.current);
      fillerTimer.current = null;
    }
    for (const p of pieces) say(p);
    if (done || final) r.done = true;
  };

  const followReply = () => {
    offTurns.current?.();
    const events = d.current.events;
    if (!events) return;
    offTurns.current = events.on('turns:events', (payload) => {
      const e = payload as { turnId: string; sessionId: string | null; event: { type: string; delta?: string; toolName?: string; pendingPermissions?: Array<{ toolCallId: string; toolName: string }> } };
      const r = reply.current;
      if (!r || !on.current) return;
      if (!r.turnId) {
        // The reply's turn: the first new one of this chat (of any chat, for
        // the first message of a new one, created as it was sent).
        const chat = d.current.sessionId();
        if (known.current.has(e.turnId) || !e.sessionId || (chat && e.sessionId !== chat)) return;
        r.turnId = e.turnId;
        r.release = events.subscribeTurnDeltas(e.turnId);
      }
      if (e.turnId !== r.turnId) return;
      switch (e.event.type) {
        case 'text_delta':
          r.text += e.event.delta ?? '';
          speakReply(false);
          break;
        case 'tool_invocation_requested': {
          const phrase = progressPhrase(e.event.toolName ?? '');
          const now = Date.now();
          if (phrase && !speech.current?.speaking && now - lastProgress.current > PROGRESS_EVERY_MS) {
            lastProgress.current = now;
            say(phrase, true);
          }
          break;
        }
        case 'turn_suspended': {
          const p = e.event.pendingPermissions?.[0];
          if (!p) break;
          approval.current = { turnId: e.turnId, toolCallId: p.toolCallId, asked: 1 };
          speakReply(true);
          say(approvalQuestion(words(p.toolName)));
          break;
        }
        case 'turn_completed':
        case 'turn_failed':
        case 'turn_cancelled':
          speakReply(true);
          r.release?.();
          reply.current = null;
          void speech.current?.drained().then(() => {
            if (on.current && state.current !== 'listening') set('listening');
          });
          break;
      }
    });
  };

  const submit = async (text: string) => {
    held.current = '';
    if (heldTimer.current) clearTimeout(heldTimer.current);
    heldTimer.current = null;
    const t = text.trim();
    if (!t) return;
    d.current.onHeard(t);
    // An action waiting for a yes: « oui » or « non » answers it.
    const waiting = approval.current;
    if (waiting && d.current.sessions) {
      const answer = yesOrNo(t);
      if (answer) {
        approval.current = null;
        speech.current?.stop();
        say(answer === 'allow' ? SPOKEN.approved : SPOKEN.denied, true);
        await d.current.sessions.respondToPermission(waiting.turnId, waiting.toolCallId, answer).catch(() => d.current.onError('approval'));
        if (!reply.current) {
          reply.current = { turnId: waiting.turnId, text: '', spokenUpTo: 0, done: false, splitter: new SentenceSplitter(), release: d.current.events?.subscribeTurnDeltas(waiting.turnId) ?? null };
          followReply();
        }
        set('thinking');
        return;
      }
      if (waiting.asked < 2) {
        waiting.asked += 1;
        say(SPOKEN.askAgain, true);
        return;
      }
      // Asked twice: the words are a message, the action stays waiting in the chat.
      approval.current = null;
    }
    speech.current?.stop();
    reply.current?.release?.();
    known.current = new Set(d.current.knownTurns());
    reply.current = { turnId: null, text: '', spokenUpTo: 0, done: false, splitter: new SentenceSplitter(), release: null };
    followReply();
    set('thinking');
    if (fillerTimer.current) clearTimeout(fillerTimer.current);
    fillerTimer.current = setTimeout(() => {
      fillerTimer.current = null;
      if (on.current && !speech.current?.speaking) say(FILLERS[Math.floor(Math.random() * FILLERS.length)], true);
    }, FILLER_AFTER_MS);
    const sent = await d.current.send(t);
    if (!sent) {
      reply.current = null;
      set('listening');
    }
  };

  const onFlux = (e: FluxEvent) => {
    if (!on.current) return;
    const s = speech.current;
    switch (e.type) {
      case 'start':
      case 'update':
        // Someone talks over the agent: real words only, not its own voice.
        if (s?.speaking && isBargeIn(e.transcript, `${s.current} ${s.said}`)) {
          s.stop();
          set('listening');
        }
        if (heldTimer.current && e.transcript) {
          clearTimeout(heldTimer.current);
          heldTimer.current = null;
        }
        break;
      case 'end': {
        const t = e.transcript;
        if (!t) break;
        if (s?.speaking && (isBackchannel(t) || isEcho(t, `${s.current} ${s.said}`))) break;
        const whole = held.current ? `${held.current} ${t}` : t;
        if (e.trigger === 'model' && looksUnfinished(whole) && !manualRef.current) {
          held.current = whole;
          heldTimer.current = setTimeout(() => void submit(held.current), HANGING_WAIT_MS);
          break;
        }
        void submit(whole);
        break;
      }
      case 'closed':
        if (on.current) d.current.onError(e.reason ?? 'closed');
        break;
      default:
        break;
    }
  };

  /** Starts the continuous conversation; false when this phone cannot (no session, no mic). */
  const start = useCallback(async (): Promise<boolean> => {
    const { rpc, session } = d.current;
    if (!rpc || !session) return false;
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) return false;
    // Record and play at once, out of the loudspeaker, not the earpiece.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false }).catch(() => undefined);
    speech.current = new SpeechQueue(rpc, {
      onSpeaking: (speaking) => {
        if (!on.current) return;
        if (speaking) set('speaking');
        else if (!reply.current) set('listening');
      },
    });
    speech.current.warm([...FILLERS, SPOKEN.approved, SPOKEN.denied, SPOKEN.askAgain]);
    on.current = true;
    set('listening');
    try {
      await stream.start();
    } catch {
      on.current = false;
      set('off');
      return false;
    }
    return true;
  }, [stream]);

  const stop = useCallback(() => {
    on.current = false;
    if (heldTimer.current) clearTimeout(heldTimer.current);
    if (fillerTimer.current) clearTimeout(fillerTimer.current);
    held.current = '';
    approval.current = null;
    try {
      stream.stop();
    } catch {
      // Already stopped.
    }
    flux.current?.close();
    flux.current = null;
    speech.current?.stop();
    speech.current = null;
    reply.current?.release?.();
    reply.current = null;
    offTurns.current?.();
    offTurns.current = null;
    set('off');
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  /** Cuts the agent short and listens. */
  const interrupt = useCallback(() => {
    speech.current?.stop();
    if (on.current) set('listening');
  }, []);

  /** Push-to-talk, for noisy places: hold to talk, release to send. */
  const holdToTalk = useCallback((holding: boolean) => {
    if (!flux.current) return;
    if (holding) speech.current?.stop();
    else flux.current.forceEnd();
  }, []);

  const setManual = useCallback((manual: boolean) => {
    setPushToTalk(manual);
    manualRef.current = manual;
    flux.current?.manual(manual);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, interrupt, holdToTalk, pushToTalk, setPushToTalk: setManual };
}
