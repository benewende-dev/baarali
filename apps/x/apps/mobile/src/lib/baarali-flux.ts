// BAARALI(07/11/2026): the phone listening continuously (docs/baarali/
// AGENT_TELEPHONE_SPEC.md §3 E). The microphone's PCM goes as it is captured
// to Deepgram Flux through the control plane (control voice.ts
// LISTEN_V2_PATH, opened with the sign-in session; no key on the phone).
// Flux hears the end of a turn from what is said, not from a fixed silence,
// and tells when someone starts talking: the conversation engine
// (baarali-conversation.ts) turns these into turns, cuts and answers.
//
// Settings: an eager end of turn lets the engine get ready early; the model
// waits up to 5 s of silence for a sentence left hanging, so nobody has to
// keep a rhythm (eot_timeout_ms). Push-to-talk switches the model's ending
// off and ends the turn on release (ForceEndTurn).

export type FluxEvent =
  | { type: 'start'; transcript: string }
  | { type: 'update'; transcript: string }
  | { type: 'eager'; transcript: string }
  | { type: 'resumed' }
  | { type: 'end'; transcript: string; trigger: 'model' | 'manual' | 'timeout' | string }
  | { type: 'closed'; reason: string | null };

export interface FluxOptions {
  /** The control plane (lib/baarali-sign-in.ts API_URL). */
  apiUrl: string;
  /** The phone's sign-in session. */
  session: string;
  sampleRate: number;
  onEvent: (event: FluxEvent) => void;
}

export const FLUX_SAMPLE_RATES = [8000, 16000, 24000, 44100, 48000];
/** Flux wants about 80 ms per message. */
const CHUNK_MS = 80;

export function fluxUrl(apiUrl: string, sampleRate: number): string {
  const base = apiUrl.replace(/\/+$/, '').replace(/^http/, 'ws');
  const q = new URLSearchParams({
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    eot_threshold: '0.75',
    eager_eot_threshold: '0.5',
    eot_timeout_ms: '5000',
  });
  q.append('language_hint', 'fr');
  q.append('language_hint', 'en');
  return `${base}/deepgram/v2/listen?${q.toString()}`;
}

/** One TurnInfo message as the engine reads it; null for anything else. */
export function readFlux(raw: string): FluxEvent | null {
  let m: { type?: string; event?: string; transcript?: string; trigger?: string };
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (m.type !== 'TurnInfo') return null;
  const transcript = (m.transcript ?? '').trim();
  switch (m.event) {
    case 'StartOfTurn':
      return { type: 'start', transcript };
    case 'Update':
      return { type: 'update', transcript };
    case 'EagerEndOfTurn':
      return { type: 'eager', transcript };
    case 'TurnResumed':
      return { type: 'resumed' };
    case 'EndOfTurn':
      return { type: 'end', transcript, trigger: m.trigger ?? 'model' };
    default:
      return null;
  }
}

export class FluxListener {
  private ws: WebSocket | null = null;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private readonly chunkBytes: number;
  private open = false;

  constructor(private readonly opts: FluxOptions) {
    this.chunkBytes = Math.round((opts.sampleRate * 2 * CHUNK_MS) / 1000);
  }

  start(): void {
    // React Native's WebSocket takes protocols, as the desktop does (`bearer, <token>`).
    const ws = new WebSocket(fluxUrl(this.opts.apiUrl, this.opts.sampleRate), ['bearer', this.opts.session]);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.open = true;
      this.drain();
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const event = readFlux(e.data);
      if (event) this.opts.onEvent(event);
    };
    ws.onerror = () => undefined;
    ws.onclose = (e) => {
      this.open = false;
      this.ws = null;
      this.opts.onEvent({ type: 'closed', reason: e.reason || (e.code === 1000 ? null : String(e.code)) });
    };
    this.ws = ws;
  }

  /** Audio as captured (int16, mono); sent in 80 ms messages. */
  push(data: ArrayBuffer): void {
    this.pending.push(new Uint8Array(data));
    this.pendingBytes += data.byteLength;
    // Before the socket opens, keep at most 2 s: the start of a sentence is not lost.
    const cap = this.opts.sampleRate * 2 * 2;
    while (!this.open && this.pendingBytes > cap && this.pending.length > 1) this.pendingBytes -= this.pending.shift()!.byteLength;
    if (this.open && this.pendingBytes >= this.chunkBytes) this.drain();
  }

  /** Push-to-talk: only the release ends a turn. */
  manual(on: boolean): void {
    this.control({ type: 'Configure', thresholds: { eot_threshold: on ? 1.0 : 0.75 } });
  }

  forceEnd(): void {
    this.drain();
    this.control({ type: 'ForceEndTurn' });
  }

  close(): void {
    this.control({ type: 'CloseStream' });
    this.ws?.close(1000);
    this.ws = null;
    this.open = false;
    this.pending = [];
    this.pendingBytes = 0;
  }

  private control(message: object): void {
    if (this.open) this.ws?.send(JSON.stringify(message));
  }

  private drain(): void {
    if (!this.open || !this.ws || !this.pendingBytes) return;
    const out = new Uint8Array(this.pendingBytes);
    let at = 0;
    for (const p of this.pending) {
      out.set(p, at);
      at += p.byteLength;
    }
    this.pending = [];
    this.pendingBytes = 0;
    this.ws.send(out.buffer);
  }
}
