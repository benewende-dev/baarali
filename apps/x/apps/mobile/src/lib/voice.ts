import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { RpcClient } from '@x/client';

// The phone as a voice agent (Baarali, 07/10/2026): hold a conversation by
// voice. Tap the mic, speak, tap again: the recording goes whole to the Mac
// or the cloud instance (`voice:transcribe`, Deepgram behind the control
// plane) and the text is sent. With the speaker on, the reply's opening is
// read aloud (`voice:synthesize`: Aura-2, or ElevenLabs on the Pro plans).
// No key ever reaches the phone.

export type VoiceInputState = 'idle' | 'recording' | 'transcribing';

// Conversation mode hears the end of a sentence from the mic level: speech
// above the room's noise, then this much quiet.
const POLL_MS = 150;
const SILENCE_MS = 1200;
const MAX_TURN_MS = 60_000;
// Nobody spoke for this long: start a fresh file rather than grow one of silence.
const IDLE_RESTART_MS = 30_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The mic: record, then the transcript. `null` when nothing was heard. */
export function useVoiceInput(rpc: RpcClient | null) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [state, setState] = useState<VoiceInputState>('idle');
  const stopListeningRef = useRef(false);

  const start = useCallback(async (): Promise<'ok' | 'denied'> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return 'denied';
    stopSpeaking();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
    return 'ok';
  }, [recorder]);

  const finish = useCallback(async (): Promise<string | null> => {
    if (!rpc) return null;
    setState('transcribing');
    try {
      await recorder.stop();
      // Back to playback, so the reply plays through the speaker, not the earpiece.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) return null;
      const file = new File(uri);
      const audioBase64 = await file.base64();
      try {
        file.delete();
      } catch {
        // Left in the cache; the system clears it.
      }
      const { transcript } = await rpc.call('voice:transcribe', { audioBase64, mimeType: 'audio/mp4' });
      return transcript.trim() || null;
    } finally {
      setState('idle');
    }
  }, [recorder, rpc]);

  const cancel = useCallback(async () => {
    if (state !== 'recording') return;
    await recorder.stop().catch(() => undefined);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    setState('idle');
  }, [recorder, state]);

  /**
   * Conversation mode: records until the speaker pauses, then transcribes.
   * `null` when stopped (`stopListening`) or nothing was understood.
   */
  const listenTurn = useCallback(async (): Promise<string | null | 'denied'> => {
    stopListeningRef.current = false;
    if ((await start()) === 'denied') return 'denied';
    let startedAt = Date.now();
    let floor: number | null = null;
    let voiced = 0;
    let heardAt = 0;
    let quietSince = 0;
    for (;;) {
      await sleep(POLL_MS);
      if (stopListeningRef.current) {
        await recorder.stop().catch(() => undefined);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        setState('idle');
        return null;
      }
      const level = recorder.getStatus().metering ?? -160;
      floor ??= level;
      const threshold = Math.max(floor + 12, -50);
      if (level > threshold) {
        voiced += 1;
        quietSince = 0;
        if (voiced >= 2 && !heardAt) heardAt = Date.now();
      } else {
        voiced = 0;
        if (!heardAt) floor = floor * 0.9 + level * 0.1;
        else if (!quietSince) quietSince = Date.now();
      }
      const now = Date.now();
      if (heardAt && quietSince && now - quietSince >= SILENCE_MS) break;
      if (heardAt && now - heardAt >= MAX_TURN_MS) break;
      if (!heardAt && now - startedAt >= IDLE_RESTART_MS) {
        await recorder.stop().catch(() => undefined);
        await recorder.prepareToRecordAsync();
        recorder.record();
        startedAt = Date.now();
      }
    }
    return finish();
  }, [recorder, start, finish]);

  /** Ends a `listenTurn` that is still waiting for speech. */
  const stopListening = useCallback(() => {
    stopListeningRef.current = true;
  }, []);

  return { state, start, finish, cancel, listenTurn, stopListening };
}

let player: AudioPlayer | null = null;
let playing: File | null = null;
let ended: (() => void) | null = null;
// Bumped by every stop, so a reading still being synthesized never starts after it.
let generation = 0;

/** Silence: a new recording, the speaker switched off, or the user cutting in. */
export function stopSpeaking(): void {
  generation += 1;
  player?.remove();
  player = null;
  try {
    playing?.delete();
  } catch {
    // Already gone.
  }
  playing = null;
  const done = ended;
  ended = null;
  done?.();
}

/**
 * Reads `text` aloud through the account's voice; the previous reading stops.
 * Resolves when the reading ends, naturally or cut short by `stopSpeaking`.
 */
export async function speak(rpc: RpcClient, text: string): Promise<void> {
  stopSpeaking();
  const mine = generation;
  const { audioBase64 } = await rpc.call('voice:synthesize', { text });
  if (generation !== mine) return;
  const file = new File(Paths.cache, `baarali-reply-${Date.now()}.mp3`);
  file.write(audioBase64, { encoding: 'base64' });
  playing = file;
  const current = createAudioPlayer(file.uri);
  player = current;
  const done = new Promise<void>((resolve) => {
    ended = resolve;
  });
  current.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) setTimeout(() => {
      if (player === current) stopSpeaking();
    }, 0);
  });
  current.play();
  return done;
}

const READ_ALOUD_KEY = 'baarali.readAloud';

/** The composer's speaker, remembered on the phone. */
export function useReadAloud(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    void SecureStore.getItemAsync(READ_ALOUD_KEY).then((v) => {
      loaded.current = true;
      setOn(v === '1');
    }, () => undefined);
  }, []);
  const set = useCallback((next: boolean) => {
    setOn(next);
    if (!next) stopSpeaking();
    void SecureStore.setItemAsync(READ_ALOUD_KEY, next ? '1' : '0').catch(() => undefined);
  }, []);
  return [on, set];
}

/**
 * What to say of a reply: its <voice> summary when the agent wrote one (asked
 * for in conversation and with the speaker on), else its opening.
 */
export function spokenPart(reply: string): string {
  const summary = [...reply.matchAll(/<voice>([\s\S]*?)<\/voice>/g)].map((m) => m[1].trim()).filter(Boolean).join(' ');
  return summary || speakableOpening(reply);
}

/**
 * What to say of a reply: its opening as plain text, cut after a sentence
 * near 400 characters (same rule as the desktop's lib/read-aloud.ts).
 */
export function speakableOpening(reply: string, max = 400): string {
  const text = reply
    .replace(/<voice>[\s\S]*?<\/voice>/g, ' ')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  return cut > max / 3 ? window.slice(0, cut + 1) : `${window.slice(0, window.lastIndexOf(' '))}…`;
}
