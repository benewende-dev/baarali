// The phone's spoken conversation, its rules (mobile lib/baarali-turns.ts, 07/11/2026).
import { describe, expect, it } from 'vitest';
import {
  SentenceSplitter, approvalQuestion, isBackchannel, isBargeIn, isEcho, looksUnfinished, progressPhrase, speakableSoFar, yesOrNo,
} from '../../../../x/apps/mobile/src/lib/baarali-turns.js';

describe('speaking as the reply streams', () => {
  it('gives each sentence as soon as it ends, short ones merged with the next', () => {
    const s = new SentenceSplitter();
    expect(s.push('Oui. Votre réunion avec la banque est à 10 h')).toEqual([]);
    expect(s.push('. Elle dure une heure. Ensuite')).toEqual(['Oui. Votre réunion avec la banque est à 10 h.', 'Elle dure une heure.']);
    expect(s.push(' vous êtes libre')).toEqual([]);
    expect(s.flush()).toEqual(['Ensuite vous êtes libre']);
  });

  it('does not cut on a decimal or an initial', () => {
    const s = new SentenceSplitter();
    expect(s.push('Le devis fait 10.5 millions pour M. Koné. Je l’envoie ? ')).toEqual(['Le devis fait 10.5 millions pour M. Koné.', 'Je l’envoie ?']);
  });

  it('reads the voice summary while it is written, and stops at its end', () => {
    expect(speakableSoFar('<vo')).toEqual({ text: '', done: false });
    expect(speakableSoFar('<voice>Vous avez deux e-mails </vo')).toEqual({ text: 'Vous avez deux e-mails', done: false });
    expect(speakableSoFar('<voice>Vous avez **deux** e-mails.</voice>\n\n## Détail\n- Awa')).toEqual({ text: 'Vous avez deux e-mails.', done: true });
  });

  it('reads the opening of a reply without a summary, in plain words', () => {
    expect(speakableSoFar('## Agenda\n- Banque à **10 h**', true)).toEqual({ text: 'Agenda Banque à 10 h', done: true });
    const long = speakableSoFar(`${'Une phrase assez longue pour remplir. '.repeat(30)}`);
    expect(long.done).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(600);
  });
});

describe('who speaks when', () => {
  it('hears listening sounds as listening, not as a turn', () => {
    for (const t of ['hm', 'Mmh', 'oui oui', "d'accord", 'OK', 'ah bon', 'yeah']) expect(isBackchannel(t)).toBe(true);
    for (const t of ['non attends', 'oui mais pas Awa', 'stop']) expect(isBackchannel(t)).toBe(false);
  });

  it('knows its own voice coming back through the speaker', () => {
    const speaking = 'Votre réunion avec la banque est à dix heures.';
    expect(isEcho('la banque est à dix heures', speaking)).toBe(true);
    expect(isEcho('non annule la réunion', speaking)).toBe(false);
  });

  it('lets the person cut in with real words only', () => {
    const speaking = 'Votre réunion avec la banque est à dix heures.';
    expect(isBargeIn('attends, change de sujet', speaking)).toBe(true);
    expect(isBargeIn('hm', speaking)).toBe(false);
    expect(isBargeIn('stop', speaking)).toBe(false);
    expect(isBargeIn('avec la banque', speaking)).toBe(false);
  });

  it('waits for a sentence left hanging', () => {
    expect(looksUnfinished('Envoie le devis à Awa et')).toBe(true);
    expect(looksUnfinished('Envoie le devis à euh')).toBe(true);
    expect(looksUnfinished('Envoie le devis,')).toBe(true);
    expect(looksUnfinished('Envoie le devis à Awa.')).toBe(false);
    expect(looksUnfinished('Envoie le devis à Awa')).toBe(false);
  });
});

describe('approving by voice', () => {
  it('hears yes and no, and neither', () => {
    for (const t of ['Oui', 'Oui, envoie-le.', 'vas-y', "D'accord", 'OK go', 'Je valide']) expect(yesOrNo(t)).toBe('allow');
    for (const t of ['Non', 'Non attends', 'Annule', 'Pas maintenant', 'Surtout pas']) expect(yesOrNo(t)).toBe('deny');
    for (const t of ['Qui est Awa ?', 'Peut-être', '']) expect(yesOrNo(t)).toBeNull();
  });

  it('asks plainly', () => {
    expect(approvalQuestion('Gmail, send email')).toBe('J’ai besoin de votre accord pour : Gmail, send email. Je le fais ?');
  });
});

describe('saying what it does', () => {
  it('names the work of a tool in a few words, or keeps quiet', () => {
    expect(progressPhrase('composio-execute:GMAIL_FETCH_EMAILS')).toBe('Je regarde vos e-mails.');
    expect(progressPhrase('web-search')).toBe('Je cherche sur le web.');
    expect(progressPhrase('read-file')).toBe('Je regarde dans vos documents.');
    expect(progressPhrase('think')).toBeNull();
  });
});
