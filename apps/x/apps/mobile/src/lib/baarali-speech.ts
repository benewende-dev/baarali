import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { RpcClient } from '@x/client';

// BAARALI(07/11/2026): the agent speaking sentence by sentence while its
// reply is still being written (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 E).
// Each sentence is synthesized as soon as it is complete, the next one while
// the current one plays, so the first words come out after one sentence, not
// after the whole reply. Short set phrases (the fillers) are synthesized once
// and kept, so the wait after the person stops talking is never silent.

interface Item {
  text: string;
  audio: Promise<string | null>;
}

const cache = new Map<string, string>();

async function synthesize(rpc: RpcClient, text: string): Promise<string | null> {
  try {
    const { audioBase64 } = await rpc.call('voice:synthesize', { text });
    const file = new File(Paths.cache, `baarali-say-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    file.write(audioBase64, { encoding: 'base64' });
    return file.uri;
  } catch {
    // Not said rather than stuck: the words stay on screen in the chat.
    return null;
  }
}

/** A set phrase, synthesized once for the session of the app. */
async function cached(rpc: RpcClient, text: string): Promise<string | null> {
  const hit = cache.get(text);
  if (hit) return hit;
  const uri = await synthesize(rpc, text);
  if (uri) cache.set(text, uri);
  return uri;
}

export class SpeechQueue {
  private items: Item[] = [];
  private player: AudioPlayer | null = null;
  private playing = false;
  private generation = 0;
  /** What is being said now: the echo filter compares what the mic hears to it. */
  current = '';
  /** Everything said since the last stop, for the same purpose. */
  said = '';

  constructor(
    private readonly rpc: RpcClient,
    private readonly hooks: { onSpeaking?: (speaking: boolean) => void } = {},
  ) {}

  get speaking(): boolean {
    return this.playing || this.items.length > 0;
  }

  /** A sentence of the reply; synthesis starts now. */
  say(text: string): void {
    const t = text.trim();
    if (!t) return;
    this.items.push({ text: t, audio: synthesize(this.rpc, t) });
    void this.next();
  }

  /** A set phrase (filler, question): from the cache once heard. */
  sayCached(text: string): void {
    this.items.push({ text, audio: cached(this.rpc, text) });
    void this.next();
  }

  /** Prepares set phrases ahead, so the first filler is instant. */
  warm(texts: string[]): void {
    for (const t of texts) void cached(this.rpc, t);
  }

  /** Silence now: cut in, hung up, or a new turn. */
  stop(): void {
    this.generation += 1;
    this.items = [];
    this.player?.remove();
    this.player = null;
    this.current = '';
    this.said = '';
    if (this.playing) {
      this.playing = false;
      this.hooks.onSpeaking?.(false);
    }
  }

  /** Resolves when everything queued has been said (or stopped). */
  async drained(): Promise<void> {
    while (this.speaking) await new Promise((r) => setTimeout(r, 100));
  }

  private async next(): Promise<void> {
    if (this.playing) return;
    const item = this.items.shift();
    if (!item) return;
    const mine = this.generation;
    this.playing = true;
    this.hooks.onSpeaking?.(true);
    const uri = await item.audio;
    if (mine !== this.generation) return;
    if (uri) {
      this.current = item.text;
      this.said = `${this.said} ${item.text}`.slice(-600);
      await new Promise<void>((resolve) => {
        const p = createAudioPlayer(uri);
        this.player = p;
        p.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) resolve();
        });
        // A stop removes the player: its listener never fires again.
        const watch = setInterval(() => {
          if (mine !== this.generation) {
            clearInterval(watch);
            resolve();
          }
        }, 100);
        p.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) clearInterval(watch);
        });
        p.play();
      });
      if (mine !== this.generation) return;
      this.player?.remove();
      this.player = null;
      this.current = '';
    }
    this.playing = false;
    if (this.items.length) void this.next();
    else this.hooks.onSpeaking?.(false);
  }
}
