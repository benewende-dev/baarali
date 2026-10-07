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

/** The mic: record, then the transcript. `null` when nothing was heard. */
export function useVoiceInput(rpc: RpcClient | null) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceInputState>('idle');

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

  return { state, start, finish, cancel };
}

let player: AudioPlayer | null = null;
let playing: File | null = null;

/** Silence: a new recording, or the speaker switched off. */
export function stopSpeaking(): void {
  player?.remove();
  player = null;
  try {
    playing?.delete();
  } catch {
    // Already gone.
  }
  playing = null;
}

/** Reads `text` aloud through the account's voice; the previous reading stops. */
export async function speak(rpc: RpcClient, text: string): Promise<void> {
  const { audioBase64 } = await rpc.call('voice:synthesize', { text });
  stopSpeaking();
  const file = new File(Paths.cache, `baarali-reply-${Date.now()}.mp3`);
  file.write(audioBase64, { encoding: 'base64' });
  playing = file;
  player = createAudioPlayer(file.uri);
  player.play();
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
