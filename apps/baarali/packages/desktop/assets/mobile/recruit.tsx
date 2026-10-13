import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { baarasseurs as shared } from '@x/shared';

import { BaarasseurAvatar, phoneLang, useBaarasseurs, useTint, type Baarasseur } from '@/lib/baarasseurs';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';
import { AvatarTile } from '@/components/agent-avatar';
import { preferredAgentAvatar } from '@/lib/agent-avatar-preference';
import { BaaraliMark } from '@/components/baarali-mark';
import { AgentDocuments } from '@/components/agent-documents';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(12/10/2026): the approved identity → mission → try-out flow keeps
// the desktop's model, tools, schedule, memory and document references.
// Editing an existing agent still exposes the full form in one screen.

type Turn = { role: 'user' | 'assistant'; text: string };

const EVERY: Array<{ value: 'never' | shared.BaarasseurSchedule['every']; label: string }> = [
  { value: 'never', label: 'Only when I write' },
  { value: 'day', label: 'Every day' },
  { value: 'weekday', label: 'Weekdays' },
  { value: 'week', label: 'Every week' },
  { value: 'month', label: 'Monthly' },
];

function hoursLabel(s: shared.BaarasseurSchedule | null | undefined): string {
  if (!s) return 'Only when I write';
  const at = `${String(s.hour).padStart(2, '0')}:00`;
  if (s.every === 'week') return `Every ${shared.WEEKDAYS[s.day ?? 1]} · ${at}`;
  if (s.every === 'month') return `Monthly · ${s.day ?? 1} · ${at}`;
  return `${EVERY.find((e) => e.value === s.every)?.label} · ${at}`;
}

export default function RecruitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; template?: string }>();
  const { team, upsert, remove, generate } = useBaarasseurs();
  const models = useModels();
  const taken = (team ?? []).map((b) => b.id);
  const editing = params.id ? (team ?? []).find((b) => b.id === params.id) ?? null : null;
  const isNew = !params.id;

  const initial = useMemo<Baarasseur>(() => {
    const t = params.template ? shared.TEMPLATES.find((x) => x.id === params.template) : undefined;
    if (editing) return editing;
    return t ? shared.templateToBaarasseur(t, taken, phoneLang()) : shared.blankBaarasseur(taken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, params.template]);
  const [b, setB] = useState<Baarasseur>(initial);
  const [step, setStep] = useState(0);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const [avatarChanged, setAvatarChanged] = useState(false);
  useEffect(() => setB(initial), [initial]);
  useEffect(() => {
    if (!isNew || params.template || avatarChanged) return;
    let alive = true;
    void preferredAgentAvatar().then((avatar) => { if (alive) setB((cur) => ({ ...cur, avatar })); });
    return () => { alive = false; };
  }, [isNew, params.template, avatarChanged]);
  const set = (patch: Partial<Baarasseur>) => {
    setB((cur) => ({ ...cur, ...patch }));
    setTrial([]);
    setTrialError(null);
  };

  const [sentence, setSentence] = useState('');
  const [describeOpen, setDescribeOpen] = useState(false);
  const [busy, setBusy] = useState<'describe' | 'save' | 'try' | null>(null);
  const [sheet, setSheet] = useState<'model' | 'hours' | null>(null);
  const [trial, setTrial] = useState<Turn[]>([]);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [ask, setAsk] = useState('');

  const next = () => {
    if (!b.name.trim()) { Alert.alert('Give it a name first.'); return; }
    if (step === 1 && !b.mission.trim()) { Alert.alert('Describe its mission first.'); return; }
    setStep((current) => Math.min(2, current + 1));
  };

  useEffect(() => { if (sheet === 'model') void models.refresh(); }, [sheet, models.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = async () => {
    if (!sentence.trim()) return;
    setBusy('describe');
    try {
      const res = await generate({ prompt: sentence.trim(), system: shared.describeSystem(phoneLang()) });
      const filled = res.text ? shared.parseDescribed(res.text) : null;
      if (!filled) throw new Error(res.error);
      setB((cur) => ({ ...cur, ...filled }));
      setTrial([]);
      setTrialError(null);
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Baarali could not prepare it. Try again, or set it up yourself.');
    } finally {
      setBusy(null);
    }
  };

  const tryOut = async () => {
    const text = ask.trim();
    if (!text || busy) return;
    const turns: Turn[] = [...trial, { role: 'user', text }];
    setTrial(turns); setAsk(''); setTrialError(null); setBusy('try');
    try {
      const res = await generate(shared.tryoutRequest(b, turns));
      if (!res.text?.trim()) throw new Error('Could not run the try-out. Try again.');
      setTrial([...turns, { role: 'assistant', text: res.text.trim() }]);
    } catch {
      setTrial(trial);
      setAsk(text);
      setTrialError('Could not run the try-out. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!b.name.trim()) { Alert.alert('Give it a name first.'); return; }
    setBusy('save');
    try {
      const id = isNew ? shared.idFor(b.name, taken) : b.id;
      const forgotten = editing ? editing.memory.filter((m) => !b.memory.includes(m)) : [];
      await upsert({ ...b, id, name: b.name.trim(), role: b.role.trim(), mission: b.mission.trim() }, forgotten);
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      if (isNew) router.push({ pathname: '/chat', params: { id: '', agent: shared.baarasseurAgentId(id) } });
    } catch {
      Alert.alert('Could not save. Try again.');
      setBusy(null);
    }
  };

  const confirmRemove = () => {
    Alert.alert('Remove this baarasseur?', 'Its conversations stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void remove(b.id).then(() => router.back()); } },
    ]);
  };

  const modelName = useMemo(() => {
    if (!b.model) return 'Automatic';
    for (const p of models.providers) for (const m of p.models) if (m.id === b.model) return m.name ?? m.id;
    return b.model;
  }, [b.model, models.providers]);

  const group = { backgroundColor: colors.background, borderRadius: 14, borderCurve: 'continuous' as const, overflow: 'hidden' as const };
  const rowStyle = { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderBottomWidth: 0.5, borderBottomColor: colors.separator };
  const label = { fontSize: 13, color: colors.secondaryLabel, fontWeight: '600' as const, marginBottom: 6, marginLeft: 4 };
  const showIdentity = !isNew || step === 0;
  const showMission = !isNew || step === 1;
  const showTrial = !isNew || step === 2;
  const steps = [{ label: 'Identity' }, { label: 'Mission' }, { label: 'Try-out' }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.secondaryBackground }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: isNew ? 'Create an agent' : b.name || 'Edit',
          headerLeft: () => <Pressable onPress={() => isNew && step > 0 ? setStep(step - 1) : router.back()} hitSlop={8}><Text style={{ fontSize: 17, color: colors.accent }}>{isNew && step > 0 ? 'Back' : 'Cancel'}</Text></Pressable>,
          headerRight: () => isNew ? (step > 0 ? <Pressable onPress={() => router.back()} hitSlop={8}><Text style={{ fontSize: 17, color: colors.accent }}>Cancel</Text></Pressable> : null) : (
            <Pressable onPress={() => void save()} disabled={busy === 'save'} hitSlop={8}>
              {busy === 'save' ? <ActivityIndicator /> : <Text style={{ fontSize: 17, fontWeight: '600', color: colors.accent }}>{isNew ? 'Recruit' : 'Save'}</Text>}
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {isNew && <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel="Agent setup steps">
          {steps.map((item, index) => <View key={index} style={{ flex: 1, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: step === index ? colors.accent : colors.separator }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: step === index ? colors.accent : colors.secondaryLabel }}>{index + 1}. {item.label}</Text>
          </View>)}
        </View>}
        {showIdentity && <>
        {isNew && <Pressable accessibilityRole="button" accessibilityState={{ expanded: describeOpen }} onPress={() => setDescribeOpen(!describeOpen)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.accent }}>Prepare from a description</Text>
        </Pressable>}
        {isNew && describeOpen && (
          <View>
            <Text style={label}>Describe it in a sentence</Text>
            <View style={[group, { padding: 14, gap: 10 }]}>
              <TextInput
                value={sentence} onChangeText={setSentence} multiline
                placeholder="E.g. Someone who follows up with my customers every Monday and prepares my quotes"
                placeholderTextColor={colors.tertiaryLabel}
                style={{ fontSize: 16, color: colors.label, minHeight: 48 }}
              />
              <Pressable onPress={() => void describe()} disabled={!sentence.trim() || busy === 'describe'}
                style={{ height: 44, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: sentence.trim() ? 1 : 0.4 }}>
                {busy === 'describe' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 15 }}>Prepare</Text>}
              </Pressable>
            </View>
          </View>
        )}

        <View style={group}>
          <View style={[rowStyle, { paddingVertical: 12 }]}>
            <BaarasseurAvatar b={{ name: b.name || '?', color: b.color, avatar: b.avatar }} size={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <TextInput value={b.name} onChangeText={(name) => set({ name })} placeholder="Name" placeholderTextColor={colors.tertiaryLabel} maxLength={40}
                style={{ fontSize: 17, fontWeight: '600', color: colors.label }} accessibilityLabel="Name" />
              <TextInput value={b.role} onChangeText={(role) => set({ role })} placeholder="Role" placeholderTextColor={colors.tertiaryLabel} maxLength={60}
                style={{ fontSize: 15, color: colors.secondaryLabel }} accessibilityLabel="Role" />
            </View>
          </View>
          <View style={[rowStyle, { borderBottomWidth: 0, gap: 8 }]} accessibilityRole="radiogroup" accessibilityLabel="Colour">
            {shared.COLORS.map((c) => <Swatch key={c} color={c} on={b.color === c} onPress={() => set({ color: c })} />)}
          </View>
        </View>

        <View>
          <Text style={label}>Agent avatar</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Choose an avatar" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shared.AGENT_AVATARS.map((choice) => (
              <Pressable key={choice.id} accessibilityRole="radio" aria-checked={b.avatar === choice.id} accessibilityLabel={choice.label} accessibilityState={{ checked: b.avatar === choice.id }}
                onPress={() => { setAvatarChanged(true); set({ avatar: choice.id }); }}
                style={{ width: '17%', flexGrow: 1, minHeight: 72, maxWidth: '20%', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.background, borderWidth: 2, borderColor: b.avatar === choice.id ? colors.accent : 'transparent' }}>
                <AvatarTile avatar={choice.id} size={46} />
                <Text style={{ fontSize: 12, color: colors.label }}>{choice.label}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="radio" aria-checked={!b.avatar} accessibilityState={{ checked: !b.avatar }} onPress={() => { setAvatarChanged(true); set({ avatar: undefined }); }}
              style={{ minHeight: 44, width: '100%', justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 14, color: colors.accent }}>Use initials</Text>
            </Pressable>
          </View>
        </View>
        </>}

        {showMission && <>
        <View>
          <Text style={label}>Mission</Text>
          <View style={[group, { padding: 14 }]}>
            <TextInput value={b.mission} onChangeText={(mission) => set({ mission })} multiline maxLength={4000}
              style={{ fontSize: 16, lineHeight: 22, color: colors.label, minHeight: 96 }} accessibilityLabel="Mission" />
          </View>
          <Text style={{ fontSize: 13, color: colors.tertiaryLabel, marginTop: 6, marginLeft: 4 }}>Write as you would to a new hire: what to do, how, and what never to do.</Text>
        </View>

        <AgentDocuments documents={b.documents ?? []} onChange={(documents) => set({ documents })} />

        <View>
          <Text style={label}>Tools</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shared.TOOLS.map((t) => {
              const on = b.tools.includes(t);
              return (
                <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  onPress={() => set({ tools: on ? b.tools.filter((x) => x !== t) : [...b.tools, t] })}
                  style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? colors.accent : colors.background }}>
                  <Text style={{ fontSize: 14, fontWeight: on ? '600' : '400', color: on ? colors.onAccent : colors.label }}>{translate(t)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 13, color: colors.tertiaryLabel, marginTop: 6, marginLeft: 4 }}>Sending, posting or paying always waits for your approval.</Text>
        </View>

        <View style={group}>
          <Pressable style={rowStyle} onPress={() => setSheet('model')}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.label }}>Model</Text>
            <Text style={{ fontSize: 16, color: colors.secondaryLabel }}>{translate(modelName)}</Text>
          </Pressable>
          <Pressable style={[rowStyle, { borderBottomWidth: 0 }]} onPress={() => setSheet('hours')}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.label }}>Works on its own</Text>
            <Text style={{ fontSize: 16, color: colors.secondaryLabel }}>{translate(hoursLabel(b.schedule))}</Text>
          </Pressable>
        </View>

        {!isNew && b.memory.length > 0 && (
          <View>
            <Text style={label}>What it remembers</Text>
            <View style={group}>
              {b.memory.map((m, i) => (
                <View key={`${i}-${m}`} style={[rowStyle, i === b.memory.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={{ flex: 1, fontSize: 15, color: colors.label, paddingVertical: 10 }}>{m}</Text>
                  <Pressable accessibilityLabel="Forget" hitSlop={8} onPress={() => set({ memory: b.memory.filter((_, j) => j !== i) })}>
                    <Text style={{ fontSize: 15, color: colors.destructive }}>Forget</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}
        </>}

        {showTrial && <View>
          {isNew && <View style={{ alignItems: 'center', gap: 7, paddingBottom: 18 }}>
            <BaarasseurAvatar b={b} size={74} />
            <Text style={{ fontSize: 21, fontWeight: '600', color: colors.label }}>{b.name}</Text>
            {!!b.role && <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{b.role}</Text>}
          </View>}
          <Text style={label}>Try it before recruiting</Text>
          <View style={[group, { padding: 12, gap: 10 }]}>
            {trial.map((t, i) => (
              <View key={i} style={{
                alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 16,
                paddingHorizontal: 12, paddingVertical: 8, backgroundColor: t.role === 'user' ? colors.accent : colors.secondaryBackground,
              }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: t.role === 'user' ? colors.onAccent : colors.label }}>{t.text}</Text>
              </View>
            ))}
            {busy === 'try' && <View accessible accessibilityRole="text" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}><BaaraliMark size={32} motion="loading" /><Text style={{ color: colors.secondaryLabel }}>Thinking…</Text></View>}
            {trialError && <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 14 }}>{trialError}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput value={ask} onChangeText={setAsk} onSubmitEditing={() => void tryOut()} returnKeyType="send"
                placeholder={b.name ? `Write to ${b.name}…` : 'Write a message…'} placeholderTextColor={colors.tertiaryLabel}
                style={{ flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 14, backgroundColor: colors.secondaryBackground, color: colors.label, fontSize: 15 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => void tryOut()} disabled={!ask.trim() || !!busy}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: ask.trim() && !busy ? 1 : 0.4 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>Try it</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>No tools during a try-out: nothing is sent</Text>
          </View>
        </View>}

        {!isNew && (
          <Pressable onPress={confirmRemove} style={[group, { height: 48, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 16, color: colors.destructive }}>Remove this baarasseur?</Text>
          </Pressable>
        )}
      </ScrollView>

      {isNew && <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: colors.secondaryBackground }}>
        <Pressable accessibilityRole="button" onPress={step === 2 ? () => void save() : next} disabled={!!busy}
          style={{ minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: busy ? 0.5 : 1 }}>
          {busy === 'save' ? <BaaraliMark size={30} motion="loading" color={colors.onAccent} /> : <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>{step === 2 ? 'Add to your team' : 'Continue'}</Text>}
        </Pressable>
      </View>}

      <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, backgroundColor: colors.secondaryBackground }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.label }}>{sheet === 'model' ? 'Model' : 'Works on its own'}</Text>
            <Pressable onPress={() => setSheet(null)} hitSlop={8}><Text style={{ fontSize: 17, fontWeight: '600', color: colors.accent }}>OK</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}>
            {sheet === 'model' ? (
              <View style={group}>
                <Option label="Automatic" on={!b.model} onPress={() => set({ model: undefined, provider: undefined })} />
                {models.providers.flatMap((p) => p.models.map((m) => (
                  <Option key={`${p.id}/${m.id}`} label={m.name ?? m.id} on={b.model === m.id && (b.provider ?? p.id) === p.id}
                    onPress={() => set({ model: m.id, provider: p.id })} />
                )))}
              </View>
            ) : (
              <>
                <View style={group}>
                  {EVERY.map((e) => (
                    <Option key={e.value} label={e.label} on={(b.schedule?.every ?? 'never') === e.value}
                      onPress={() => set({ schedule: e.value === 'never' ? null : { every: e.value, hour: b.schedule?.hour ?? 8, ...(e.value === 'week' || e.value === 'month' ? { day: 1 } : {}) } })} />
                  ))}
                </View>
                {b.schedule?.every === 'week' && (
                  <Chips items={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ key: d, label: shared.WEEKDAYS[d] }))} value={b.schedule.day ?? 1}
                    onPick={(day) => set({ schedule: { ...b.schedule!, day } })} />
                )}
                {b.schedule?.every === 'month' && (
                  <Chips items={Array.from({ length: 28 }, (_, i) => ({ key: i + 1, label: String(i + 1) }))} value={b.schedule.day ?? 1}
                    onPick={(day) => set({ schedule: { ...b.schedule!, day } })} />
                )}
                {b.schedule && (
                  <Chips items={Array.from({ length: 24 }, (_, h) => ({ key: h, label: `${String(h).padStart(2, '0')}:00` }))} value={b.schedule.hour}
                    onPick={(hour) => set({ schedule: { ...b.schedule!, hour } })} />
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Swatch({ color, on, onPress }: { color: string; on: boolean; onPress: () => void }) {
  const { bg } = useTint(color);
  const colors = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={color} onPress={onPress} hitSlop={6}
      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: bg, borderWidth: on ? 3 : 0, borderColor: colors.accent }} />
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={{ minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
      <Text style={{ flex: 1, fontSize: 16, color: colors.label }}>{label}</Text>
      {on ? <Text style={{ fontSize: 17, color: colors.accent, fontWeight: '700' }}>✓</Text> : null}
    </Pressable>
  );
}

function Chips<K extends number>({ items, value, onPick }: { items: Array<{ key: K; label: string }>; value: K; onPick: (k: K) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onPick(it.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ minWidth: 48, height: 40, paddingHorizontal: 12, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accent : colors.background }}>
            <Text style={{ fontSize: 15, fontWeight: on ? '600' : '400', color: on ? colors.onAccent : colors.label }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
