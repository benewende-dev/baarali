import { describe, expect, it } from 'vitest';
import type { BrowserControlInput, BrowserControlResult, BrowserPageElement, BrowserPageSnapshot } from '@x/shared/dist/browser-control.js';
import { clearChoice, commitRequest, fastRun, isEditable, stepRequest, validChoice, type DecisionAnswer, type FastRunDeps } from './fast-run.js';

const el = (index: number, over: Partial<BrowserPageElement> = {}): BrowserPageElement => ({
  index, tagName: 'button', role: 'button', type: 'button', label: null, text: null, placeholder: null, href: null, disabled: false, ...over,
});

const snap = (id: string, elements: BrowserPageElement[], text = 'Page'): BrowserPageSnapshot => ({
  snapshotId: id, url: 'https://facebook.com/sahel', title: 'Sahel Matériaux', loading: false, text, elements,
});

const COMPOSER = [
  el(1, { label: 'Créer une publication' }),
  el(2, { tagName: 'div', role: 'textbox', type: 'contenteditable', label: 'Que voulez-vous dire ?' }),
  el(3, { label: 'Publier' }),
  el(4, { tagName: 'input', role: 'input', type: 'password', label: 'Mot de passe' }),
];

const choice = (c: string): DecisionAnswer => ({ type: 'choice', choice: c, confidence: 0.9, probabilities: { [c]: 0.9 } });
const torn = (a: string, pa: number, b: string, pb: number): DecisionAnswer => ({ type: 'choice', choice: a, confidence: 0.3, probabilities: { [a]: pa, [b]: pb } });

/** A browser that records what it was asked, and a Jev that answers from a script. */
function harness(script: Array<Record<string, DecisionAnswer>>, commits = 0.05) {
  const actions: BrowserControlInput[] = [];
  const asked: Array<Record<string, unknown>> = [];
  let page = snap('s1', COMPOSER, 'Fil d’actualité');
  let clock = 0;
  const deps: FastRunDeps = {
    browser: async (input) => {
      actions.push(input);
      if (input.action === 'click' || input.action === 'type') page = snap(`s${actions.length}`, COMPOSER, `Page après ${actions.length}`);
      return { success: true, action: input.action, browser: { activeTabId: 't', tabs: [] }, page } as BrowserControlResult;
    },
    decide: async (body) => {
      asked.push(body);
      const questions = body.questions as Record<string, unknown>;
      if ('commits' in questions) return { answers: { commits: { type: 'noul', noul: commits } }, cost: 0.00001 };
      return { answers: script.shift() ?? { operation: choice('BLOCKED') }, cost: 0.0001 };
    },
    write: async () => ({ text: 'Texte écrit', cost: 0.0002 }),
    now: () => (clock += 100),
  };
  return { deps, actions, asked };
}

describe('the fast browser mode (06/10/2026)', () => {
  it('never offers a password field to type into', () => {
    expect(isEditable(COMPOSER[1])).toBe(true);
    expect(isEditable(COMPOSER[3])).toBe(false);
    const { body, operations } = stepRequest('goal', snap('s', COMPOSER), [], {});
    expect(operations).toEqual(['CLICK', 'TYPE_TEXT', 'SCROLL_DOWN', 'SCROLL_UP', 'WAIT', 'DONE', 'BLOCKED']);
    const questions = body.questions as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(questions.type_target.criteria)).toEqual(['2']);
    expect(body.model).toBe('typesafe/jev-1.13');
  });

  it('only uses a choice that names an offered option, and is the most likely', () => {
    expect(validChoice(choice('3'), ['1', '3'])).toBe('3');
    expect(validChoice(choice('9'), ['1', '3'])).toBeNull();
    expect(validChoice({ choice: '1', probabilities: { '1': 0.2, '3': 0.8 } }, ['1', '3'])).toBeNull();
    expect(validChoice(undefined, ['1'])).toBeNull();
  });

  it('types the given values as they are, then stops before « Publier » for approval', async () => {
    const { deps, actions } = harness([
      { operation: choice('CLICK'), click_target: choice('1') },
      { operation: choice('TYPE_TEXT'), type_target: choice('2'), type_value: choice('texte du post') },
      { operation: choice('CLICK'), click_target: choice('3') },
    ]);
    const result = await fastRun({ goal: 'Publie le post', values: { 'texte du post': 'Ciment à 6 500 F le sac' } }, deps);
    expect(result.status).toBe('awaiting_approval');
    expect(result.pending).toMatchObject({ index: 3, label: 'Publier' });
    expect(actions.filter((a) => a.action === 'click').map((a) => a.index)).toEqual([1]);
    expect(actions.find((a) => a.action === 'type')).toMatchObject({ index: 2, text: 'Ciment à 6 500 F le sac' });
    expect(result.steps.map((s) => s.operation)).toEqual(['CLICK', 'TYPE_TEXT']);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('asks for approval when Jev takes a click for committing, whatever its label', async () => {
    const { deps, actions } = harness([{ operation: choice('CLICK'), click_target: choice('1') }], 0.8);
    const result = await fastRun({ goal: 'x' }, deps);
    expect(result.status).toBe('awaiting_approval');
    expect(actions.some((a) => a.action === 'click')).toBe(false);
  });

  it('writes a text the goal describes but does not give, and hands back on BLOCKED', async () => {
    const { deps, actions } = harness([{ operation: choice('TYPE_TEXT'), type_target: choice('2') }, { operation: choice('BLOCKED') }]);
    const result = await fastRun({ goal: 'Écris un mot de bienvenue' }, deps);
    expect(actions.find((a) => a.action === 'type')).toMatchObject({ text: 'Texte écrit' });
    expect(result.status).toBe('blocked');
  });

  it('refuses an answer it cannot read, without acting', async () => {
    const { deps, actions } = harness([{ operation: choice('CLICK'), click_target: choice('42') }]);
    const result = await fastRun({ goal: 'x' }, deps);
    expect(result.status).toBe('error');
    expect(actions.map((a) => a.action)).toEqual(['open', 'read-page']);
  });

  it('opens the start URL first and finishes on DONE', async () => {
    const { deps, actions } = harness([{ operation: choice('DONE') }]);
    const result = await fastRun({ goal: 'x', startUrl: 'https://example.com' }, deps);
    expect(actions.slice(0, 2)).toEqual([{ action: 'open' }, { action: 'navigate', target: 'https://example.com' }]);
    expect(result).toMatchObject({ status: 'done', page: { url: 'https://facebook.com/sahel' } });
  });

  it('acts only on a clear choice: likely enough, and well ahead of the next', () => {
    expect(clearChoice(torn('1', 0.9, '3', 0.1), ['1', '3'])).toBe('1');
    expect(clearChoice(torn('1', 0.55, '3', 0.45), ['1', '3'])).toBeNull();
    expect(clearChoice(torn('1', 0.62, '3', 0.38), ['1', '3'])).toBe('1');
    expect(clearChoice(torn('1', 0.65, '3', 0.5), ['1', '3'])).toBeNull();
    expect(clearChoice({ choice: '1' }, ['1', '3'])).toBeNull();
  });

  it('asks a doubtful choice again among its best options, and acts when it becomes clear', async () => {
    const { deps, actions, asked } = harness([
      { operation: choice('CLICK'), click_target: torn('1', 0.52, '3', 0.44) },
      { click_target: choice('1') },
      { operation: choice('DONE') },
    ]);
    const result = await fastRun({ goal: 'Ouvre le formulaire' }, deps);
    const again = asked[1].questions as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(again)).toEqual(['click_target']);
    expect(Object.keys(again.click_target.criteria).sort()).toEqual(['1', '3']);
    expect(actions.filter((a) => a.action === 'click').map((a) => a.index)).toEqual([1]);
    expect(result.status).toBe('done');
  });

  it('hands a choice still doubtful to the chat model, without acting', async () => {
    const { deps, actions } = harness([
      { operation: choice('CLICK'), click_target: torn('1', 0.52, '3', 0.44) },
      { click_target: torn('1', 0.55, '3', 0.45) },
    ]);
    const result = await fastRun({ goal: 'x' }, deps);
    expect(result.status).toBe('uncertain');
    expect(result.candidates?.map((c) => [c.option, c.probability])).toEqual([['1', 0.55], ['3', 0.45]]);
    expect(actions.some((a) => a.action === 'click')).toBe(false);
  });

  it('does not force the only given text into a field it is not for', async () => {
    const { deps, actions } = harness([
      { operation: choice('TYPE_TEXT'), type_target: choice('2'), type_value: choice('WRITE_FROM_GOAL') },
      { operation: choice('DONE') },
    ]);
    await fastRun({ goal: 'Cherche le ciment', values: { 'texte du post': 'Promo' } }, deps);
    expect(actions.find((a) => a.action === 'type')).toMatchObject({ text: 'Texte écrit' });
  });

  it('asks Jev whether an action commits, with the goal and the element', () => {
    const body = commitRequest('Publie', snap('s', COMPOSER), '[3] button "Publier"');
    expect(body).toMatchObject({ model: 'typesafe/jev-1.13', state: { action: '[3] button "Publier"' }, questions: { commits: { type: 'noul' } } });
  });
});
