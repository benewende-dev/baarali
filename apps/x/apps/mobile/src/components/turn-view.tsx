import { useState } from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { phoneSteps, workDuration, type PhoneStep } from '@/lib/work-steps';
import { ChatMarkdown } from './markdown';
import type { message as messageShared, turns } from '@x/shared';
import type { z } from 'zod';

// Renders one turn from its reduced TurnState (the same reducer the desktop
// uses), plus the live streaming-text overlay for the in-flight model call.
// v1 render set: user bubble, assistant markdown, tool-call chips, permission
// and ask-human prompts, terminal errors. Attachments/code runs come later.

// Same extraction as the desktop's turn view: only `text` parts render.
// `reasoning` parts also carry a .text field (the model thinking out loud)
// and are dropped, exactly like apps/renderer's session-chat/turn-view.ts.
function textParts(content: string | Array<{ type?: string; text?: string }>): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function userText(input: z.infer<typeof messageShared.UserMessage>): string {
  return textParts(input.content as string | Array<{ type?: string; text?: string }>);
}

function assistantText(response: z.infer<typeof messageShared.AssistantMessage>): string {
  return textParts(response.content as string | Array<{ type?: string; text?: string }>);
}

function ToolChip({ tool }: { tool: turns.ToolCallState }) {
  const failed = tool.result?.result.isError === true;
  const running = !tool.result;
  return (
    <View style={[styles.chip, failed && styles.chipFailed]}>
      <Text style={[styles.chipText, { color: '#999' }]}>
        {running ? '⏳' : failed ? '✕' : '✓'} {tool.toolName}
      </Text>
    </View>
  );
}

function StepRow({ step }: { step: PhoneStep }) {
  const [open, setOpen] = useState(false);
  const detail = step.said !== null || step.tools.length > 0;
  return (
    <View>
      <Pressable disabled={!detail} onPress={() => setOpen((v) => !v)} style={styles.stepRow} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.caret}>{detail ? (open ? '▾' : '▸') : ' '}</Text>
        <Text style={[styles.stepIcon, step.failed ? styles.stepFailed : step.running ? styles.stepRunning : styles.stepDone]}>
          {step.running ? '◌' : step.failed ? '!' : '✓'}
        </Text>
        <Text style={[styles.stepTitle, step.running && styles.stepTitleNow]}>{step.title}</Text>
      </Pressable>
      {open && (
        <View style={styles.stepDetail}>
          {step.said ? <ChatMarkdown>{step.said}</ChatMarkdown> : null}
          {step.tools.length > 0 && (
            <View style={styles.chips}>
              {step.tools.map((tool) => (
                <ToolChip key={tool.toolCallId} tool={tool} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function WorkBlock({ steps, active, started, ended }: { steps: PhoneStep[]; active: boolean; started: string; ended?: string }) {
  const [open, setOpen] = useState(active);
  const total = ended ? workDuration(Date.parse(ended) - Date.parse(started)) : null;
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.workHead} accessibilityRole="button" accessibilityState={{ expanded: open || active }}>
        <Text style={styles.caret}>{open || active ? '▾' : '▸'}</Text>
        {active ? (
          <Text style={styles.workNow}>Baarali is working…</Text>
        ) : (
          <Text style={styles.workDone}>
            <Text>Worked</Text>
            {total ? <Text>{` ${total}`}</Text> : null}
            <Text>{` · ${steps.length} `}</Text>
            <Text>{steps.length === 1 ? 'step' : 'steps'}</Text>
          </Text>
        )}
      </Pressable>
      {(open || active) && (
        <View style={styles.steps}>
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </View>
      )}
    </View>
  );
}

function PermissionPrompt({
  pending,
  onDecision,
}: {
  pending: { toolCallId: string; toolName: string };
  onDecision: (toolCallId: string, decision: 'allow' | 'deny') => void;
}) {
  return (
    <View style={styles.promptCard}>
      <Text style={styles.promptTitle}>Rowboat wants to run “{pending.toolName}”</Text>
      <View style={styles.promptButtons}>
        <Button title="Allow" onPress={() => onDecision(pending.toolCallId, 'allow')} />
        <Button title="Deny" color="#c0392b" onPress={() => onDecision(pending.toolCallId, 'deny')} />
      </View>
    </View>
  );
}

function AskHumanPrompt({
  toolCallId,
  question,
  options,
  onAnswer,
}: {
  toolCallId: string;
  question: string;
  options?: string[];
  onAnswer: (toolCallId: string, answer: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <View style={styles.promptCard}>
      <Text style={styles.promptTitle}>{question}</Text>
      {options?.map((option) => (
        <Button key={option} title={option} onPress={() => onAnswer(toolCallId, option)} />
      ))}
      <View style={styles.promptRow}>
        <TextInput
          style={styles.promptInput}
          placeholder="Type an answer…"
          value={draft}
          onChangeText={setDraft}
        />
        <Button title="Send" disabled={!draft.trim()} onPress={() => onAnswer(toolCallId, draft.trim())} />
      </View>
    </View>
  );
}

export interface TurnViewProps {
  state: turns.TurnState;
  liveText?: string;
  streaming?: boolean;
  onPermission?: (toolCallId: string, decision: 'allow' | 'deny') => void;
  onAskHuman?: (toolCallId: string, answer: string) => void;
}

export function TurnView({ state, liveText, streaming, onPermission, onAskHuman }: TurnViewProps) {
  const suspended = state.terminal ? undefined : state.suspension;
  const askHumanCalls = state.toolCalls.filter(
    (tc) => tc.toolName === 'ask-human' && !tc.result,
  );
  const { steps, answer } = phoneSteps(state, (call) => (call.response ? assistantText(call.response) : ''));
  const answerCall = answer === -1 ? undefined : state.modelCalls.find((c) => c.index === answer);

  return (
    <View style={styles.turn}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{userText(state.definition.input)}</Text>
      </View>

      {/* BAARALI(09/10/2026): the work folded into steps, the answer in the open (lib/work-steps.ts). */}
      {steps.length > 0 && (
        <WorkBlock
          steps={steps}
          active={!state.terminal && !!streaming}
          started={state.definition.ts}
          ended={state.terminal?.ts}
        />
      )}
      {answerCall && (
        <View style={styles.assistantBlock}>
          <ChatMarkdown>{assistantText(answerCall.response!)}</ChatMarkdown>
          {answerCall.error && <Text style={styles.error}>{answerCall.error}</Text>}
        </View>
      )}

      {liveText ? <ChatMarkdown>{liveText}</ChatMarkdown> : null}
      {streaming && !liveText && !state.terminal && !suspended && (
        <Text style={styles.thinking}>Thinking…</Text>
      )}

      {suspended &&
        onPermission &&
        suspended.pendingPermissions.map((pending) => (
          <PermissionPrompt key={pending.toolCallId} pending={pending} onDecision={onPermission} />
        ))}
      {suspended &&
        onAskHuman &&
        askHumanCalls.map((tc) => {
          const input = tc.input as { question?: string; options?: string[] } | undefined;
          return (
            <AskHumanPrompt
              key={tc.toolCallId}
              toolCallId={tc.toolCallId}
              question={input?.question ?? 'Rowboat has a question'}
              options={input?.options}
              onAnswer={onAskHuman}
            />
          );
        })}

      {state.terminal?.type === 'turn_failed' && (
        <Text style={styles.error}>Turn failed: {String(state.terminal.error ?? 'unknown error')}</Text>
      )}
      {state.terminal?.type === 'turn_cancelled' && <Text style={styles.meta}>Stopped.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { gap: 8, marginBottom: 20 },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3478f6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '85%',
  },
  userText: { color: '#fff', fontSize: 15 },
  assistantBlock: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: '#8882',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipFailed: { backgroundColor: '#c0392b22' },
  chipText: { fontSize: 12, opacity: 0.8 },
  promptCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  promptTitle: { fontSize: 14, fontWeight: '500', color: '#888' },
  promptButtons: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promptInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
  },
  thinking: { opacity: 0.6, fontStyle: 'italic', color: '#888' },
  workHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  workNow: { fontSize: 14, color: '#3478f6' },
  workDone: { fontSize: 14, color: '#888' },
  caret: { width: 12, fontSize: 12, color: '#888' },
  steps: { marginLeft: 5, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#8886', gap: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 },
  stepIcon: { width: 14, fontSize: 13, textAlign: 'center' },
  stepDone: { color: '#34c759' },
  stepRunning: { color: '#3478f6' },
  stepFailed: { color: '#ff9f0a', fontWeight: '700' },
  stepTitle: { flex: 1, fontSize: 14, color: '#888' },
  stepTitleNow: { color: '#3478f6' },
  stepDetail: { marginLeft: 32, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: '#8881', gap: 8 },
  error: { color: '#c0392b' },
  meta: { opacity: 0.5, fontSize: 13 },
});
