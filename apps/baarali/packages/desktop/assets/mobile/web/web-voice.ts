import { useCallback, useRef, useState } from 'react';
import type { RpcClient } from '@x/client';

// BAARALI(09/11/2026): the mic in the browser. The phone's recorder writes a
// file on disk and reads it back, which a browser cannot do: here the
// browser's own recorder (MediaRecorder) keeps the sound in memory, and the
// same `voice:transcribe` turns it into words. Same shape as the phone's
// useVoiceInput (lib/voice.ts), which hands over to this on the web.

export type WebVoiceState = 'idle' | 'recording' | 'transcribing';

const POLL_MS = 150;
const SILENCE_MS = 1200;
const MAX_TURN_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Take = { recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream };

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function useWebVoiceInput(rpc: RpcClient | null) {
  const [state, setState] = useState<WebVoiceState>('idle');
  const take = useRef<Take | null>(null);
  const stopListeningRef = useRef(false);

  const start = useCallback(async (): Promise<'ok' | 'denied'> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return 'denied';
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start(250);
    take.current = { recorder, chunks, stream };
    setState('recording');
    return 'ok';
  }, []);

  /** Stops the recording; the sound, or null when there was none. */
  const stopTake = useCallback(() => new Promise<Blob | null>((resolve) => {
    const t = take.current;
    take.current = null;
    if (!t) { resolve(null); return; }
    t.recorder.onstop = () => {
      t.stream.getTracks().forEach((track) => track.stop());
      resolve(t.chunks.length ? new Blob(t.chunks, { type: t.recorder.mimeType || 'audio/webm' }) : null);
    };
    try { t.recorder.stop(); } catch { resolve(null); }
  }), []);

  const finish = useCallback(async (): Promise<string | null> => {
    if (!rpc) { await stopTake(); setState('idle'); return null; }
    setState('transcribing');
    try {
      const blob = await stopTake();
      if (!blob || blob.size === 0) return null;
      const { transcript } = await rpc.call('voice:transcribe', { audioBase64: await toBase64(blob), mimeType: blob.type.split(';')[0] || 'audio/webm' });
      return transcript.trim() || null;
    } finally {
      setState('idle');
    }
  }, [rpc, stopTake]);

  const cancel = useCallback(async () => {
    await stopTake();
    setState('idle');
  }, [stopTake]);

  /** Conversation mode: records until the speaker pauses, then the words. */
  const listenTurn = useCallback(async (): Promise<string | null | 'denied'> => {
    stopListeningRef.current = false;
    if ((await start()) === 'denied') return 'denied';
    const t = take.current;
    if (!t) return null;
    const AudioCtx = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = AudioCtx ? new AudioCtx() : null;
    const analyser = ctx?.createAnalyser();
    if (ctx && analyser) ctx.createMediaStreamSource(t.stream).connect(analyser);
    const data = new Uint8Array(analyser?.fftSize ?? 0);
    const level = () => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      return peak / 128;
    };
    const began = Date.now();
    let spoke = false;
    let quietSince = Date.now();
    let floor = 0.02;
    while (!stopListeningRef.current && Date.now() - began < MAX_TURN_MS) {
      await sleep(POLL_MS);
      const l = level();
      if (!spoke) floor = Math.min(0.2, floor * 0.9 + l * 0.1);
      if (l > Math.max(0.06, floor * 2.5)) { spoke = true; quietSince = Date.now(); }
      else if (spoke && Date.now() - quietSince > SILENCE_MS) break;
    }
    void ctx?.close();
    if (stopListeningRef.current || !spoke) { await cancel(); return null; }
    return finish();
  }, [start, finish, cancel]);

  const stopListening = useCallback(() => { stopListeningRef.current = true; }, []);

  return { state, start, finish, cancel, listenTurn, stopListening };
}
