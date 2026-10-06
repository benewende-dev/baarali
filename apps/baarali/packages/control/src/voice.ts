import type { IncomingMessage } from 'node:http';
import tls from 'node:tls';
import type { Duplex } from 'node:stream';
import { CREDITS_PER_DOLLAR } from '@x/shared/dist/billing.js';
import { admit, budgetsForWeek, charge, initialState, open, type QuotaState } from './quota.js';
import type { Account, ControlStore } from './store.js';

// Voice (roadmap phase 8): reading answers aloud and listening, both with
// Deepgram, whose key never leaves the control plane (architecture §3.14).
// Core and the renderer already call the Rowboat Labs routes, unchanged:
// `POST /v1/voice/text-to-speech/:voiceId` (ElevenLabs body, mp3 back) and
// the WebSocket `/deepgram/v1/listen` (subprotocol `bearer, <token>`).
// Both are charged to the usage quota at Deepgram's price (proposed 06/10/2026).

export const DEEPGRAM_HOST = 'api.deepgram.com';
export const LISTEN_PATH = '/deepgram/v1/listen';

/** Aura-2, in dollars per 1 000 characters. */
export const TTS_USD_PER_1K_CHARS = 0.03;
/** Nova-3 multilingual streaming, in dollars per minute and channel (regular price). */
export const STT_USD_PER_MINUTE = 0.0092;

/** Deepgram's limit per /v1/speak request is 2 000 characters: we cut below it. */
const SPEAK_CHUNK = 1800;
/** Longer texts are refused: an answer read aloud stays far below. */
export const MAX_TTS_CHARS = 20_000;
/** A live transcription is charged as it goes, so the quota can stop it. */
const METER_MS = 60_000;

export const VOICES = { fr: 'aura-2-agathe-fr', en: 'aura-2-thalia-en' } as const;

export interface VoiceDeps {
  store: ControlStore;
  deepgramKey: string;
  fetch: typeof fetch;
  now: () => number;
  deepgramBase?: string;
}

export interface ListenDeps extends VoiceDeps {
  /** An instance token or an access token, to its account. */
  accountFor: (token: string) => Promise<Account | null>;
  /** Unset: TLS to Deepgram. Tests give a plain socket. */
  connect?: () => Duplex;
  meterMs?: number;
}

const FR_WORDS = /\b(le|la|les|des|une|est|et|vous|pour|avec|dans|que|qui|pas|sur|je|nous|du|au|ce|cette)\b/gi;
const EN_WORDS = /\b(the|and|is|are|you|for|with|that|which|not|this|of|to|it|we|have|be)\b/gi;
const FR_LETTERS = /[éèêàçùôîâœ]/gi;

/** French unless the text clearly reads English: Abidjan and Ouagadougou first. */
export function guessLang(text: string): 'fr' | 'en' {
  const fr = (text.match(FR_WORDS)?.length ?? 0) + (text.match(FR_LETTERS)?.length ?? 0);
  const en = text.match(EN_WORDS)?.length ?? 0;
  return en > fr ? 'en' : 'fr';
}

/** An Aura voice asked by name is kept; any other id (ElevenLabs' default) follows the text's language. */
export function voiceFor(voiceId: string, text: string): string {
  return /^aura-2-[a-z]+-[a-z]{2}$/.test(voiceId) ? voiceId : VOICES[guessLang(text)];
}

/** Pieces of at most `max` characters, cut after a sentence when possible. */
export function splitForSpeech(text: string, max = SPEAK_CHUNK): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf('\n'));
    const at = cut > max / 2 ? cut + 1 : window.lastIndexOf(' ') > max / 2 ? window.lastIndexOf(' ') : max;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export const ttsCredits = (chars: number) => Math.ceil((chars / 1000) * TTS_USD_PER_1K_CHARS * CREDITS_PER_DOLLAR);
export const sttCredits = (ms: number, channels: number) => Math.ceil((ms / 60_000) * STT_USD_PER_MINUTE * channels * CREDITS_PER_DOLLAR);

const errorResponse = (status: number, error: Record<string, unknown>) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

async function stateOf(store: ControlStore, account: Account): Promise<QuotaState> {
  return (await store.quotaState(account.id)) ?? initialState(account.createdAt);
}

type Gate = { ok: true } | { ok: false; status: number; error: Record<string, unknown> };

/** The quota's door, as for the models: refused before anything is spent. */
async function enter(deps: VoiceDeps, account: Account): Promise<Gate> {
  const plan = await deps.store.plan(account.planId);
  if (!plan) return { ok: false, status: 403, error: { code: 'no_plan', message: 'Account has no active plan' } };
  const now = deps.now();
  const before = await stateOf(deps.store, account);
  const admission = admit(before, budgetsForWeek(plan.weekCredits), now);
  if (!admission.ok) {
    return {
      ok: false,
      status: 429,
      error: {
        code: 'quota_reached',
        window: admission.window,
        resets_at: new Date(admission.resetsAt).toISOString(),
        message: `Usage limit reached for this ${admission.window}`,
      },
    };
  }
  await deps.store.saveQuotaState(account.id, open(before, now));
  return { ok: true };
}

/** Counts spent credits; re-read, since other calls may have been charged meanwhile. */
async function spend(deps: VoiceDeps, account: Account, credits: number): Promise<void> {
  if (credits <= 0) return;
  const state = await stateOf(deps.store, account);
  await deps.store.saveQuotaState(account.id, charge(state, credits, deps.now()));
}

/** Still within the quota, checked while a live transcription runs. */
async function stillAdmitted(deps: VoiceDeps, account: Account): Promise<boolean> {
  const plan = await deps.store.plan(account.planId);
  if (!plan) return false;
  return admit(await stateOf(deps.store, account), budgetsForWeek(plan.weekCredits), deps.now()).ok;
}

/** `POST /v1/voice/text-to-speech/:voiceId`: mp3, streamed piece after piece. */
export async function speak(deps: VoiceDeps, account: Account, voiceId: string, req: Request): Promise<Response> {
  let text: unknown;
  try {
    text = ((await req.json()) as { text?: unknown }).text;
  } catch {
    text = undefined;
  }
  if (typeof text !== 'string' || !text.trim()) return errorResponse(400, { code: 'invalid_text', message: 'text is required' });
  if (text.length > MAX_TTS_CHARS) return errorResponse(413, { code: 'text_too_long', message: `At most ${MAX_TTS_CHARS} characters` });

  const gate = await enter(deps, account);
  if (!gate.ok) return errorResponse(gate.status, gate.error);

  const model = voiceFor(voiceId, text);
  const pieces = splitForSpeech(text);
  const base = deps.deepgramBase ?? `https://${DEEPGRAM_HOST}`;
  const call = (piece: string) =>
    deps.fetch(`${base}/v1/speak?model=${model}&encoding=mp3`, {
      method: 'POST',
      headers: { authorization: `Token ${deps.deepgramKey}`, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: piece }),
    });

  let spoken = 0;
  let settled = false;
  const settle = async (status: number) => {
    if (settled) return;
    settled = true;
    const credits = ttsCredits(spoken);
    await spend(deps, account, credits);
    await deps.store.appendUsage({
      accountId: account.id, at: deps.now(), path: '/voice/text-to-speech', model, requestedModel: null,
      status, credits, estimated: false, useCase: 'voice', agentName: null,
    });
  };

  // The first piece is asked before answering, so a refusal keeps its status.
  let first: Response;
  try {
    first = await call(pieces[0]);
  } catch {
    await settle(502);
    return errorResponse(502, { code: 'upstream_unreachable', message: 'Voice provider unreachable' });
  }
  if (!first.ok || !first.body) {
    console.error('[voice] speak refused', first.status, await first.text().catch(() => ''));
    await settle(first.status);
    return errorResponse(502, { code: 'upstream_error', message: `Voice provider answered ${first.status}` });
  }

  // mp3 frames follow one another: the pieces play as one file.
  let index = 0;
  let reader = first.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (!done) {
            controller.enqueue(value);
            return;
          }
          spoken += pieces[index].length;
          index += 1;
          if (index >= pieces.length) {
            await settle(200);
            controller.close();
            return;
          }
          const next = await call(pieces[index]);
          if (!next.ok || !next.body) throw new Error(`speak answered ${next.status}`);
          reader = next.body.getReader();
        }
      } catch (err) {
        console.error('[voice] speak stream', err);
        await settle(502);
        controller.error(err);
      }
    },
    // The listener stopped: what was asked is spent anyway.
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      spoken += pieces[index]?.length ?? 0;
      await settle(200);
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

/** The token from `Sec-WebSocket-Protocol: bearer, <token>` (browsers cannot set Authorization), or Authorization. */
export function listenToken(req: IncomingMessage): string | null {
  const protocols = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim());
  if (protocols[0]?.toLowerCase() === 'bearer' && protocols[1]) return protocols[1];
  const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Deepgram's query, with our choices imposed: Nova-3, and `multi`, which
 * understands French and English in the same sentence (the apps ask `en`).
 */
export function upstreamQuery(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.searchParams);
  params.delete('token');
  params.set('model', 'nova-3');
  params.set('language', 'multi');
  return params;
}

function channelsOf(params: URLSearchParams): number {
  if (params.get('multichannel') !== 'true') return 1;
  const n = Number(params.get('channels') ?? '1');
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1;
}

/** `/deepgram/v1/listen`: the handshake replayed with our key, then the sockets spliced and metered. */
export function createListenRelay(deps: ListenDeps) {
  const meterMs = deps.meterMs ?? METER_MS;
  const connect = deps.connect ?? (() => tls.connect({ host: DEEPGRAM_HOST, port: 443, servername: DEEPGRAM_HOST }));

  return function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://relay');
    const refuse = (status: string): void => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    socket.on('error', () => socket.destroy());
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== LISTEN_PATH || typeof key !== 'string') return refuse('404 Not Found');
    const token = listenToken(req);
    const offeredBearer = String(req.headers['sec-websocket-protocol'] ?? '').toLowerCase().startsWith('bearer');

    void (async () => {
      const account = token ? await deps.accountFor(token) : null;
      if (!account) return refuse('401 Unauthorized');
      if (account.suspendedAt) return refuse('403 Forbidden');
      const gate = await enter(deps, account);
      if (!gate.ok) return refuse(gate.status === 429 ? '429 Too Many Requests' : '403 Forbidden');

      const params = upstreamQuery(url);
      const channels = channelsOf(params);
      const upstream = connect();
      upstream.on('error', (err) => {
        console.error('[voice] listen upstream', err.message);
        socket.destroy();
      });
      upstream.write(
        [
          `GET /v1/listen?${params.toString()} HTTP/1.1`,
          `Host: ${DEEPGRAM_HOST}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          `Authorization: Token ${deps.deepgramKey}`,
        ].join('\r\n') + '\r\n\r\n',
      );

      let opened = false;
      let billed = 0;
      let total = 0;
      let timer: ReturnType<typeof setInterval> | undefined;
      let closed = false;
      const meter = async () => {
        const now = deps.now();
        const credits = sttCredits(now - billed, channels);
        billed = now;
        total += credits;
        await spend(deps, account, credits);
      };
      const close = async () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        upstream.destroy();
        socket.destroy();
        if (!opened) return;
        await meter();
        await deps.store.appendUsage({
          accountId: account.id, at: deps.now(), path: '/voice/listen', model: 'nova-3', requestedModel: null,
          status: 101, credits: total, estimated: false, useCase: 'voice', agentName: null,
        });
      };
      socket.on('close', () => void close().catch((err: unknown) => console.error('[voice] listen meter', err)));
      upstream.on('close', () => void close().catch((err: unknown) => console.error('[voice] listen meter', err)));

      // Deepgram's answer head, read whole before anything goes to the app.
      let buffered = Buffer.alloc(0);
      const onHead = (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        const end = buffered.indexOf('\r\n\r\n');
        if (end < 0) {
          if (buffered.length > 16_384) socket.destroy();
          return;
        }
        upstream.off('data', onHead);
        const headLines = buffered.subarray(0, end).toString('latin1').split('\r\n');
        const rest = buffered.subarray(end + 4);
        const status = Number(headLines[0]?.split(' ')[1]);
        if (status !== 101) {
          console.error('[voice] listen refused by Deepgram', headLines[0]);
          refuse(status === 429 ? '429 Too Many Requests' : '502 Bad Gateway');
          upstream.destroy();
          return;
        }
        // The app offered `bearer`: the answer must name it, or the WebSocket fails.
        const kept = headLines.filter((l) => !/^sec-websocket-protocol:/i.test(l));
        if (offeredBearer) kept.push('Sec-WebSocket-Protocol: bearer');
        socket.write(kept.join('\r\n') + '\r\n\r\n');
        if (rest.length) socket.write(rest);
        if (head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
        opened = true;
        billed = deps.now();
        timer = setInterval(() => {
          void meter()
            .then(() => stillAdmitted(deps, account))
            .then((ok) => {
              if (!ok) void close();
            })
            .catch((err: unknown) => console.error('[voice] listen meter', err));
        }, meterMs);
        timer.unref?.();
      };
      upstream.on('data', onHead);
    })().catch((err: unknown) => {
      console.error('[voice] listen', err);
      refuse('503 Service Unavailable');
    });
  };
}
