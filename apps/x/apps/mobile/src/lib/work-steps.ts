import type { turns } from '@x/shared';

// BAARALI(09/10/2026): the phone's twin of the desktop chat's steps
// (renderer lib/work-steps.ts, mockup validated by the founder). Each model
// call of the turn is a step, titled by the first sentence the agent said;
// the last call that only speaks is the answer, in the open.

export interface PhoneStep {
  key: number;
  title: string;
  /** All the agent said in that step, when the title cut it. */
  said: string | null;
  tools: turns.ToolCallState[];
  failed: boolean;
  running: boolean;
}

const TITLE_MAX = 90;

export function stepTitle(text: string): { title: string; cut: boolean } {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = plain.match(/^(.+?[.!?…])(\s|$)/)?.[1] ?? plain;
  if (sentence.length <= TITLE_MAX) return { title: sentence, cut: sentence !== plain };
  return { title: `${sentence.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, '')}…`, cut: true };
}

/** « 4 s », « 1 min 12 s ». */
export function workDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/**
 * The turn's steps, and which model call is the answer (-1: none yet).
 * `textOf` reads a call's words, as the turn view does.
 */
export function phoneSteps(state: turns.TurnState, textOf: (call: turns.ModelCallState) => string): { steps: PhoneStep[]; answer: number } {
  const calls = state.modelCalls;
  const toolsOf = (index: number) => state.toolCalls.filter((tc) => tc.modelCallIndex === index && tc.toolName !== 'ask-human');
  const last = calls[calls.length - 1];
  const answer = last && last.response && toolsOf(last.index).length === 0 && textOf(last).trim() ? last.index : -1;
  const steps: PhoneStep[] = [];
  for (const call of calls) {
    if (call.index === answer) continue;
    const tools = toolsOf(call.index);
    const words = textOf(call).trim();
    if (!words && tools.length === 0) continue;
    const { title, cut } = words ? stepTitle(words) : { title: tools[0].toolName, cut: false };
    steps.push({
      key: call.index,
      title,
      said: cut ? words : null,
      tools,
      failed: tools.some((t) => t.result?.result.isError === true) || !!call.error,
      running: !state.terminal && (!call.response || tools.some((t) => !t.result)),
    });
  }
  return { steps, answer };
}
