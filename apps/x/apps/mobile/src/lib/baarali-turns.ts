// BAARALI(07/11/2026): the words of a spoken conversation, as rules a test
// can read (docs/baarali/AGENT_TELEPHONE_SPEC.md §3 E). No React Native here:
// the conversation engine (baarali-conversation.ts) and the tests share it.
//
// What the voice interview with Gradium's founder showed, and the phone did
// not do (it was a walkie-talkie: 1.2 s of silence, the whole file sent, the
// whole reply awaited, no cutting in):
// - speak as the reply streams, sentence after sentence;
// - fill the wait while the agent thinks, and say what it is doing;
// - let the person cut in, but not on a « hm », a cough, or the agent's own
//   voice coming back through the speaker;
// - never ask the person to keep a rhythm: a sentence left hanging
//   (« et euh… ») is not the end of their turn.

/** Shortest piece worth a request: a lone « Oui. » is merged with what follows. */
const MIN_PIECE = 12;
/** A reply read aloud stops after this much (the reply's opening, as before). */
export const SPOKEN_MAX = 600;

/** Cuts streamed text into sentences as they complete; `flush` gives the rest. */
export class SentenceSplitter {
  private buffer = '';
  /** A sentence too short to say alone (« Oui. »), waiting for the next one. */
  private short = '';

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      // A sentence ends at . ! ? … or a line break, followed by a space or the
      // end of a line; « 10.5 » or « M. Koné » is not an end (no space after
      // the dot, or a single capital before it).
      const match = /([.!?…]+["»)]?)(\s+)|\n+/.exec(this.buffer);
      if (!match) break;
      const end = match.index + match[0].length;
      const piece = this.buffer.slice(0, end);
      if (/\b[A-Z]\.\s+$/.test(piece) && match[0] !== '\n') {
        // An initial: look further.
        const next = /([.!?…]+["»)]?)(\s+)|\n+/g;
        next.lastIndex = end;
        const further = next.exec(this.buffer);
        if (!further) break;
        const cut = further.index + further[0].length;
        this.take(out, this.buffer.slice(0, cut));
        this.buffer = this.buffer.slice(cut);
        continue;
      }
      this.take(out, piece);
      this.buffer = this.buffer.slice(end);
    }
    return out;
  }

  flush(): string[] {
    const rest = [this.short, this.buffer.trim()].filter(Boolean).join(' ');
    this.buffer = '';
    this.short = '';
    return rest ? [rest] : [];
  }

  private take(out: string[], piece: string): void {
    const text = [this.short, piece.trim()].filter(Boolean).join(' ');
    this.short = '';
    if (!text) return;
    if (text.length < MIN_PIECE) this.short = text;
    else out.push(text);
  }
}

/** Markdown and tags out, as a voice says it (the same rules as lib/voice.ts speakableOpening). */
export function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What of a streaming reply should be spoken, so far. In conversation the
 * agent opens with a short <voice>…</voice> summary (core composition
 * `voiceOutput: 'summary'`): that is what is read. Without one, the reply's
 * opening, up to SPOKEN_MAX. `done`: nothing more will be spoken of it.
 */
export function speakableSoFar(reply: string, final = false): { text: string; done: boolean } {
  const trimmed = reply.trimStart();
  if (trimmed.startsWith('<voice>') || (!final && '<voice>'.startsWith(trimmed))) {
    if (!trimmed.startsWith('<voice>')) return { text: '', done: false };
    const close = trimmed.indexOf('</voice>');
    const inner = close >= 0 ? trimmed.slice(7, close) : trimmed.slice(7);
    // A tag being written (« </vo ») is not words.
    const safe = close >= 0 ? inner : inner.replace(/<\/?[a-z]*$/i, '');
    return { text: plain(safe), done: close >= 0 || final };
  }
  // A summary may come later in the reply: none is waited for once text starts.
  const text = plain(trimmed.replace(/<voice>[\s\S]*?<\/voice>/g, ' '));
  if (text.length <= SPOKEN_MAX) return { text, done: final };
  const window = text.slice(0, SPOKEN_MAX);
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  return { text: cut > SPOKEN_MAX / 3 ? window.slice(0, cut + 1) : window, done: true };
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Listening sounds, in French and English: said while the agent talks, they are not a turn. */
const BACKCHANNEL = new Set([
  'hm', 'hmm', 'mh', 'mhm', 'mmh', 'ah', 'oh', 'euh', 'heu', 'ok', 'okay', 'oui', 'ouais', 'yes', 'yeah', 'yep', 'uh', 'huh',
  'daccord', "d'accord", 'dac', 'voila', 'bien', 'bon', 'super', 'top', 'cool', 'right', 'sure', 'exactement', 'exact', 'carrement', 'grave',
]);

export function isBackchannel(text: string): boolean {
  const w = words(text).map((x) => x.replace(/'/g, ''));
  return w.length > 0 && w.length <= 3 && w.every((x) => BACKCHANNEL.has(x) || BACKCHANNEL.has(x.replace(/(.)\1+/g, '$1')));
}

/**
 * Heard while the agent spoke, and mostly its own words: the speaker coming
 * back into the microphone (what broke Moshi's first stage demo), not the person.
 */
export function isEcho(heard: string, spoken: string): boolean {
  const h = words(heard);
  if (!h.length) return true;
  const said = new Set(words(spoken));
  const shared = h.filter((x) => said.has(x)).length;
  return shared / h.length >= 0.6;
}

/** Cutting in: enough real words, not a listening sound, not an echo. */
export function isBargeIn(heard: string, speaking: string): boolean {
  return words(heard).length >= 2 && !isBackchannel(heard) && !isEcho(heard, speaking);
}

const HANGING = /\b(et|ou|mais|donc|alors|parce que|parce qu|que|qui|de|du|des|le|la|les|un|une|pour|avec|sur|dans|euh|heu|and|or|but|so|because|the|a|to|of|with|um|uh)\s*[,…]*\s*$/i;

/** A sentence left hanging: the model's end of turn waits a little more for the rest. */
export function looksUnfinished(text: string): boolean {
  const t = text.trim();
  return !t || /[,…]$/.test(t) || HANGING.test(t);
}

const YES = /^(oui|ouais|yes|yeah|ok|okay|d'?accord|vas[- ]y|go|c'?est bon|envoie|envoyez|fais[- ]le|faites[- ]le|valide|je valide|approuve|j'?approuve|confirme|je confirme|parfait|bien sur|absolument|allez)\b/;
const NO = /^(non|no|nope|attends|attendez|stop|annule|annulez|pas maintenant|surtout pas|refuse|je refuse|ne le fais pas|laisse tomber|plus tard)\b/;

/** The answer to « Do I go ahead? »; null: neither, so it is asked again or read as a message. */
export function yesOrNo(text: string): 'allow' | 'deny' | null {
  const t = words(text).join(' ');
  if (NO.test(t)) return 'deny';
  if (YES.test(t)) return 'allow';
  return null;
}

/** Said at once when the person stops talking, so the wait is never silent (spec §3 E). */
export const FILLERS = ["D'accord, je regarde.", 'Bien noté, une seconde.', 'Je m’en occupe.', 'Très bien, je vérifie.'];

/** Said while a tool runs, so the person knows what the agent is doing. Null: nothing worth saying. */
export function progressPhrase(toolName: string): string | null {
  const t = toolName.toLowerCase();
  if (/mail|gmail|outlook|inbox/.test(t)) return 'Je regarde vos e-mails.';
  if (/calendar|agenda|event|meeting/.test(t)) return 'Je regarde votre agenda.';
  if (/search|web|browse|fetch|exa|tavily/.test(t)) return 'Je cherche sur le web.';
  if (/image|video|media|motion|music|voice/.test(t)) return 'Je prépare le média.';
  if (/file|read|grep|glob|workspace|note|knowledge/.test(t)) return 'Je regarde dans vos documents.';
  if (/todo|task|bg-task|routine|schedule/.test(t)) return 'Je mets à jour vos tâches.';
  if (/command|shell|code|terminal/.test(t)) return 'Je lance le travail.';
  return null;
}

/** What is asked aloud for a yes (the instance's own words for the same action, baarali-approvals.ts). */
export function approvalQuestion(what: string): string {
  return `J’ai besoin de votre accord pour : ${what}. Je le fais ?`;
}

export const SPOKEN = {
  approved: 'C’est parti.',
  denied: 'D’accord, je ne le fais pas.',
  askAgain: 'Dites oui ou non, s’il vous plaît.',
};
