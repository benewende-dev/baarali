import { createHash } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CREDITS_PER_DOLLAR } from '@x/shared/dist/billing.js';
import { accountResolver, createApp } from '../src/app.js';
import { buildApiConfig } from '../src/config.js';
import { MemoryStore, hashToken, type Account, type Plan } from '../src/store.js';
import { ELEVEN_USD_PER_1K_CHARS, ELEVEN_VOICES, VOICES, createListenRelay, speakerFor, guessLang, splitForSpeech, sttCredits, ttsCredits, voiceFor } from '../src/voice.js';

const T0 = Date.UTC(2026, 9, 6, 8, 0, 0);
const PLANS: Plan[] = [{ id: 'pro', category: 'pro', displayName: 'pro', weekCredits: 20 * CREDITS_PER_DOLLAR, monthlyPrices: [], models: null }];

function store(): MemoryStore {
  const accounts = new Map<string, Account>([[hashToken('me'), { id: 'me', email: null, planId: 'pro', createdAt: T0 }]]);
  return new MemoryStore(accounts, PLANS);
}

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});
async function listen(server: http.Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

describe('voice, choices', () => {
  it('reads French by default and English when the text is clearly English', () => {
    expect(guessLang('Bonjour, voici les relances de la semaine.')).toBe('fr');
    expect(guessLang('Here are the follow-ups for this week, and they are ready.')).toBe('en');
    expect(guessLang('OK')).toBe('fr');
  });

  it('keeps an Aura voice asked by name, otherwise follows the language', () => {
    expect(voiceFor('aura-2-hector-fr', 'Hello there')).toBe('aura-2-hector-fr');
    expect(voiceFor('s3TPKV1kjDlVtZbl4Ksh', 'Bonjour à vous')).toBe(VOICES.fr);
    expect(voiceFor('s3TPKV1kjDlVtZbl4Ksh', 'This is the answer you asked for')).toBe(VOICES.en);
  });

  it('cuts long texts after a sentence, below the limit', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} assez longue pour compter.`).join(' ');
    const pieces = splitForSpeech(text, 400);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) {
      expect(p.length).toBeLessThanOrEqual(400);
      expect(p.endsWith('.')).toBe(true);
    }
    expect(pieces.join(' ')).toBe(text);
  });

  it('prices at Deepgram rates', () => {
    expect(ttsCredits(1000)).toBe(0.03 * CREDITS_PER_DOLLAR);
    expect(sttCredits(60_000, 2)).toBe(Math.ceil(0.0184 * CREDITS_PER_DOLLAR));
  });

  it('serves the WebSocket URL only with Deepgram', () => {
    expect(buildApiConfig({ publicUrl: 'https://baarali.com' }).websocketApiUrl).toBe('');
    expect(buildApiConfig({ publicUrl: 'https://baarali.com', voice: true }).websocketApiUrl).toBe('wss://baarali.com');
  });
});

describe('voice, who reads', () => {
  const deps = { store: store(), deepgramKey: 'dg', fetch: globalThis.fetch, now: () => T0, elevenLabs: { key: 'el' } };
  const pro = PLANS[0];
  const starter: Plan = { ...pro, id: 'essentiel', category: 'starter' };

  it('gives ElevenLabs Flash to the Pro plans, Aura-2 to the others', () => {
    expect(speakerFor(deps, pro, 'x', 'Bonjour à vous').model).toBe(`elevenlabs/eleven_flash_v2_5:${ELEVEN_VOICES.fr}`);
    expect(speakerFor(deps, pro, 'x', 'Bonjour à vous').usdPer1k).toBe(ELEVEN_USD_PER_1K_CHARS);
    expect(speakerFor(deps, starter, 'x', 'Bonjour à vous').model).toBe(VOICES.fr);
  });

  it('keeps Aura-2 for everyone without an ElevenLabs key, and honours a chosen voice', () => {
    expect(speakerFor({ ...deps, elevenLabs: undefined }, pro, 'x', 'Bonjour').model).toBe(VOICES.fr);
    expect(speakerFor({ ...deps, elevenLabs: { key: 'el', voices: { fr: 'myVoice' } } }, pro, 'x', 'Bonjour').model).toBe('elevenlabs/eleven_flash_v2_5:myVoice');
  });

  it('calls ElevenLabs with its key and the language', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response('mp3');
    }) as typeof globalThis.fetch;
    await speakerFor({ ...deps, fetch }, pro, 'x', 'Here is the answer you asked for').call('Here is the answer');
    expect(seen?.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICES.en}/stream?output_format=mp3_44100_128`);
    expect((seen?.init.headers as Record<string, string>)['xi-api-key']).toBe('el');
    expect(JSON.parse(String(seen?.init.body))).toMatchObject({ model_id: 'eleven_flash_v2_5', language_code: 'en' });
  });
});

describe('voice, reading aloud', () => {
  function setup(opts: { key?: string | null; answer?: () => Response } = {}) {
    const s = store();
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    const app = createApp({
      store: s, openRouterKey: 'or', publicUrl: 'https://c.test', appName: 'Baarali', now: () => T0, mediaPacks: [],
      deepgramKey: opts.key === null ? undefined : (opts.key ?? 'dg-key'),
      fetch: (async (url: string, init: RequestInit = {}) => {
        calls.push({ url: String(url), body: String(init.body), auth: String((init.headers as Record<string, string>).authorization) });
        return opts.answer ? opts.answer() : new Response(new Uint8Array([0xff, 0xfb, calls.length]), { headers: { 'content-type': 'audio/mpeg' } });
      }) as typeof fetch,
    });
    const say = (text: unknown, token = 'me') =>
      app.request('/v1/voice/text-to-speech/s3TPKV1kjDlVtZbl4Ksh', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      });
    return { s, calls, say };
  }

  it('streams Aura mp3 with our key and charges the characters', async () => {
    const { s, calls, say } = setup();
    const res = await say('Bonjour, voici votre résumé.');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xfb, 1]);
    expect(calls[0].url).toBe(`https://api.deepgram.com/v1/speak?model=${VOICES.fr}&encoding=mp3`);
    expect(calls[0].auth).toBe('Token dg-key');
    const usage = s.usage.at(-1)!;
    expect(usage.path).toBe('/voice/text-to-speech');
    expect(usage.credits).toBe(ttsCredits('Bonjour, voici votre résumé.'.length));
    expect((await s.quotaState('me'))?.weekUsed).toBe(usage.credits);
  });

  it('reads a long text in several pieces, as one file', async () => {
    const { calls, say } = setup();
    const text = 'Une phrase de suite. '.repeat(200);
    const res = await say(text);
    expect((await res.arrayBuffer()).byteLength).toBe(3 * calls.length);
    expect(calls.length).toBeGreaterThan(1);
  });

  it('refuses without a token, without text, and without Deepgram', async () => {
    expect((await setup().say('Bonjour', 'nobody')).status).toBe(401);
    expect((await setup().say('  ')).status).toBe(400);
    expect((await setup({ key: null }).say('Bonjour')).status).toBe(503);
  });

  it('reports a refusal from Deepgram without charging', async () => {
    const { s, say } = setup({ answer: () => new Response('nope', { status: 401 }) });
    expect((await say('Bonjour')).status).toBe(502);
    expect(s.usage.at(-1)?.credits).toBe(0);
  });

  it('stops at the quota', async () => {
    const { s, calls, say } = setup();
    await s.saveQuotaState('me', { sessionStart: null, sessionUsed: 0, weekStart: T0, weekUsed: 20 * CREDITS_PER_DOLLAR });
    expect((await say('Bonjour')).status).toBe(429);
    expect(calls).toHaveLength(0);
  });
});

describe('voice, a whole recording', () => {
  function setup(answer: () => Response, key: string | null = 'dg-key') {
    const s = store();
    const calls: Array<{ url: string; type: string; auth: string; bytes: number }> = [];
    const app = createApp({
      store: s, openRouterKey: 'or', publicUrl: 'https://c.test', appName: 'Baarali', now: () => T0, mediaPacks: [],
      deepgramKey: key ?? undefined,
      fetch: (async (url: string, init: RequestInit = {}) => {
        const h = init.headers as Record<string, string>;
        calls.push({ url: String(url), type: h['content-type'], auth: h.authorization, bytes: (init.body as Uint8Array).length });
        return answer();
      }) as typeof fetch,
    });
    const send = (bytes: number, token = 'me', query = '') =>
      app.request(`/v1/voice/transcribe${query}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/mp4' },
        body: new Uint8Array(bytes),
      });
    return { s, calls, send };
  }
  const deepgram = () =>
    Response.json({ metadata: { duration: 30 }, results: { channels: [{ alternatives: [{ transcript: ' Bonjour à vous. ' }] }] } });

  it('sends the recording to Deepgram in multi and charges its duration', async () => {
    const { s, calls, send } = setup(deepgram);
    const res = await send(1000);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: 'Bonjour à vous.' });
    expect(calls[0].url).toContain('/v1/listen?model=nova-3&language=multi');
    expect(calls[0]).toMatchObject({ type: 'audio/mp4', auth: 'Token dg-key', bytes: 1000 });
    expect(s.usage.at(-1)).toMatchObject({ path: '/voice/transcribe', credits: sttCredits(30_000, 1) });
  });

  it('gives each word with its times when asked, for the captions, at the same price', async () => {
    const { s, send } = setup(() =>
      Response.json({
        metadata: { duration: 30 },
        results: { channels: [{ alternatives: [{ transcript: 'Bonjour à vous', words: [
          { word: 'bonjour', punctuated_word: 'Bonjour', start: 0.1, end: 0.5 },
          { word: 'à', start: 0.5, end: 0.6 },
          { word: 'vous', punctuated_word: 'vous.', start: 0.6, end: 0.9 },
          { word: '', start: 1, end: 1.1 },
        ] }] }] },
      }),
    );
    const res = await send(1000, 'me', '?words=true');
    expect(await res.json()).toEqual({
      transcript: 'Bonjour à vous',
      words: [{ text: 'Bonjour', start: 0.1, end: 0.5 }, { text: 'à', start: 0.5, end: 0.6 }, { text: 'vous.', start: 0.6, end: 0.9 }],
    });
    expect(s.usage.at(-1)).toMatchObject({ credits: sttCredits(30_000, 1) });
  });

  it('refuses empty audio, no token, no Deepgram, and passes on a refusal unbilled', async () => {
    expect((await setup(deepgram).send(0)).status).toBe(400);
    expect((await setup(deepgram).send(10, 'nobody')).status).toBe(401);
    expect((await setup(deepgram, null).send(10)).status).toBe(503);
    const refused = setup(() => new Response('bad', { status: 400 }));
    expect((await refused.send(10)).status).toBe(502);
    expect(refused.s.usage.at(-1)?.credits).toBe(0);
  });
});

describe('voice, listening', () => {
  /** Deepgram's stand-in: answers the handshake, then sends one text frame. */
  async function fakeDeepgram(status = 101) {
    const seen: string[] = [];
    const server = http.createServer();
    server.on('upgrade', (req, socket) => {
      seen.push(`${req.url} ${req.headers.authorization} ${req.headers['sec-websocket-protocol'] ?? '-'}`);
      if (status !== 101) {
        socket.end(`HTTP/1.1 ${status} No\r\nContent-Length: 0\r\n\r\n`);
        return;
      }
      const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      const payload = Buffer.from('{"is_final":true}');
      socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
      // The app's close frame: Deepgram answers by closing.
      socket.on('data', () => socket.end());
    });
    return { port: await listen(server), seen };
  }

  async function front(dgPort: number, s: MemoryStore, clock: { now: number }) {
    const upgrade = createListenRelay({
      store: s, deepgramKey: 'dg-key', fetch: globalThis.fetch, now: () => clock.now,
      accountFor: accountResolver(s), connect: () => net.connect(dgPort, '127.0.0.1'),
    });
    const server = http.createServer();
    server.on('upgrade', upgrade);
    return listen(server);
  }

  it('relays to Deepgram with our key, in multi, and meters the minutes', async () => {
    const dg = await fakeDeepgram();
    const s = store();
    const clock = { now: T0 };
    const port = await front(dg.port, s, clock);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/deepgram/v1/listen?model=nova-3&language=en&channels=2&multichannel=true`, ['bearer', 'me']);
    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(String(e.data));
      ws.onerror = () => reject(new Error('ws failed'));
    });
    expect(message).toBe('{"is_final":true}');
    expect(ws.protocol).toBe('bearer');
    expect(dg.seen[0]).toContain('language=multi');
    expect(dg.seen[0]).toContain('Token dg-key -');
    expect(dg.seen[0]).not.toContain('me');
    clock.now = T0 + 120_000;
    ws.close();
    await vi_waitFor(() => s.usage.length > 0);
    expect(s.usage[0]).toMatchObject({ path: '/voice/listen', model: 'nova-3', credits: sttCredits(120_000, 2) });
  });

  it('refuses a wrong token and a spent quota before reaching Deepgram', async () => {
    const dg = await fakeDeepgram();
    const s = store();
    const port = await front(dg.port, s, { now: T0 });
    const status = (token: string) =>
      new Promise<string>((resolve) => {
        const sock = net.connect(port, '127.0.0.1', () => {
          sock.write(`GET /deepgram/v1/listen HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: bearer, ${token}\r\n\r\n`);
        });
        let buf = '';
        sock.on('data', (d) => (buf += d.toString()));
        sock.on('close', () => resolve(buf.split('\r\n')[0]));
      });
    expect(await status('nobody')).toMatch(/401/);
    await s.saveQuotaState('me', { sessionStart: null, sessionUsed: 0, weekStart: T0, weekUsed: 20 * CREDITS_PER_DOLLAR });
    expect(await status('me')).toMatch(/429/);
    expect(dg.seen).toHaveLength(0);
  });

  it('passes on a refusal from Deepgram', async () => {
    const dg = await fakeDeepgram(401);
    const s = store();
    const port = await front(dg.port, s, { now: T0 });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/deepgram/v1/listen`, ['bearer', 'me']);
    const failed = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(false);
      ws.onerror = () => resolve(true);
    });
    expect(failed).toBe(true);
    expect(s.usage).toHaveLength(0);
  });
});

async function vi_waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
