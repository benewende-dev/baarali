import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';
import type { backgroundTask, todo } from '@x/shared';
import { BaaraliMark } from '@/components/baarali-mark';
import { ChatComposer } from '@/components/chat-composer';
import { ModelPill } from '@/components/model-picker';
import { stageAttachments, useComposerAttachments } from '@/lib/composer-attachments';
import { useModels } from '@/lib/use-models';
import { useVoiceInput } from '@/lib/voice';
import { BaarasseurAvatar, phoneLang, useBaarasseurs, type Baarasseur } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { scheduleWords } from '@/lib/schedule-words';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate, interfaceText } from '@/baarali-i18n/mobile/runtime';

// BAARALI(09/11/2026): the desktop's pages, in the browser (the founder's
// call: « look how things are laid out and rich on the desktop app »). On a
// wide screen the phone's Agents, Routines and Code screens give way to these:
// a serif title, its line, the main action at the top right, then cards, as
// the desktop draws them. They read and change the same data as the phone.
// On the phone, and in a narrow window, nothing changes.

/** From this width on, the browser shows the desktop's pages. */
const WIDE = 1024;

/** In the browser on a wide screen (linked or not). */
export function useWebScreen(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE;
}

/** The desktop's page where there is room for it, the phone's screen otherwise. */
export function WebOr({ web: Web, phone: Phone }: { web: ComponentType; phone: ComponentType }) {
  const { pairing } = useConnection();
  return useWebScreen() && pairing ? <Web /> : <Phone />;
}

const sf = (name: string) => `sf:${name}`;

function Icon({ name, size = 16, color }: { name: string; size?: number; color: string }) {
  return <Image source={sf(name)} style={{ width: size, height: size }} tintColor={color} />;
}

function useTints() {
  const dark = useColorScheme() === 'dark';
  return { hover: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', card: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', soft: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' };
}

/** « il y a 3 heures », in the browser's language. */
export function ago(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.round((t - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return fmt.format(Math.round(s), 'second');
  if (a < 3600) return fmt.format(Math.round(s / 60), 'minute');
  if (a < 86400) return fmt.format(Math.round(s / 3600), 'hour');
  if (a < 7 * 86400) return fmt.format(Math.round(s / 86400), 'day');
  if (a < 30 * 86400) return fmt.format(Math.round(s / (7 * 86400)), 'week');
  return fmt.format(Math.round(s / (30 * 86400)), 'month');
}

// ── The page's frame ──────────────────────────────────────────────────────

/** The top of a desktop page: the title in serif, its line, the main action on the right. */
export function WebPageHeader({ title, subtitle, action, mark }: {
  title: string; subtitle?: string; mark?: boolean;
  action?: { label: string; icon?: string; onPress: () => void };
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingTop: 36, paddingBottom: 20 }}>
      {mark ? <BaaraliMark size={40} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text accessibilityRole="header" style={{ fontFamily: 'Source Serif 4', fontSize: 30, fontWeight: '500', color: colors.label }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 14, lineHeight: 20, color: colors.secondaryLabel }}>{subtitle}</Text> : null}
      </View>
      {action ? <PrimaryButton label={action.label} icon={action.icon} onPress={action.onPress} /> : null}
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled }: { label: string; icon?: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accent, opacity: disabled ? 0.4 : hover ? 0.85 : 1 }}>
      {icon ? <Icon name={icon} size={15} color={colors.onAccent} /> : null}
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onAccent }}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, icon, onPress, disabled }: { label: string; icon?: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.separator, backgroundColor: hover ? tints.hover : 'transparent', opacity: disabled ? 0.5 : 1 }}>
      {icon ? <Icon name={icon} size={12} color={colors.label} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: '500', color: colors.label }}>{label}</Text>
    </Pressable>
  );
}

/** A card that lights up under the pointer. */
function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: object }) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  const base = { borderRadius: 14, borderWidth: 1, borderColor: hover && onPress ? colors.tertiaryLabel : colors.separator, backgroundColor: hover && onPress ? tints.hover : tints.card, padding: 16, ...style };
  if (!onPress) return <View style={base}>{children}</View>;
  return <Pressable accessibilityRole="button" onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={base}>{children}</Pressable>;
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: 28, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The page, scrolled, at the desktop's reading width. */
export function WebPage({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 820, alignSelf: 'center' }}>{children}</View>
    </ScrollView>
  );
}

/** Cards side by side, as many as fit. */
function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, ...({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } as object) }}>{children}</View>;
}

function Badge({ label, tone, icon }: { label: string; tone: 'warn' | 'muted' | 'busy'; icon?: string }) {
  const colors = useColors();
  const tints = useTints();
  const fg = tone === 'warn' ? '#b45309' : colors.secondaryLabel;
  const bg = tone === 'warn' ? 'rgba(245,158,11,0.15)' : tints.soft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: bg }}>
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <Text style={{ fontSize: 11.5, fontWeight: '500', color: fg }}>{label}</Text>
    </View>
  );
}

/** Opens a new chat with these words in the composer. */
function chatWith(draft: string, extra: Record<string, string> = {}) {
  router.push({ pathname: '/chat', params: { id: '', draft, ...extra } });
}

// ── Routines ──────────────────────────────────────────────────────────────

type Task = backgroundTask.BackgroundTaskSummary;

/** The morning planner (as the desktop's lib/schedule-words.ts): its card says what it does, not its long doctrine. */
const isPlanner = (t: Task) => /planner|planificateur/i.test(t.slug) || /planner|planificateur/i.test(t.name);

/** The desktop's ready-made routines (renderer lib/task-ideas.ts). */
const IDEAS = [
  { title: 'Morning summary', icon: 'sun.max', when: 'Every day · Email, calendar', prompt: "Every morning at 7, send me a short brief of my day. Start with today's meetings: the time, who will be there and what it is about. Then the unread emails that need me, from clients, suppliers and partners first, each in one line with what is expected of me. End with the three things I should do first, in order. Leave out newsletters and notifications. Keep it under fifteen lines." },
  { title: 'Prepare my meetings', icon: 'calendar.badge.checkmark', when: 'Every evening · Calendar', prompt: "Every evening at 6, prepare tomorrow's meetings. For each one: the time and the people attending, what we said or decided the last time (from my notes and emails), what is still open between us, and three questions I should ask. If a document should be read beforehand, tell me which one. Skip reminders and blocked time slots." },
  { title: 'Meeting minutes', icon: 'doc.text', when: 'After each meeting', prompt: "When a meeting's notes are ready, write the minutes. At the top, in two sentences, what the meeting was for and how it ended. Then the decisions taken, then the actions: who does what, and by when. Put my own actions first so I can add them to my list. Do not send anything to the participants: I read it first." },
  { title: 'Important emails', icon: 'envelope', when: 'Each email · Email', prompt: 'When a client, a supplier or a partner writes to me, sum up their message in two lines: what they want and by when. Then prepare a draft reply in my tone, polite and short, that answers each of their questions. If something is missing to reply, such as a price, a date or a document, tell me what. Never send the reply: leave it as a draft.' },
  { title: 'Chase unpaid invoices', icon: 'receipt', when: 'Every Monday · Email', prompt: 'Every Monday at 8, look in my emails for the invoices and quotes I sent that have had no answer or payment for more than 7 days. List them with the client, the amount and the date sent. For each one, prepare a polite reminder as a draft, firmer if it is the second reminder. Never send anything yourself.' },
  { title: 'Keep in touch with clients', icon: 'hand.raised', when: 'Every week · Email', prompt: 'Every Wednesday at 10, find in my emails the clients I have not written to for more than a month after an order or a quote. For each one, suggest a short message to keep in touch, such as news, a new product or a thank-you, as a draft. Five clients at most.' },
  { title: 'Keep watch on a topic', icon: 'binoculars', when: 'Every week · Web', prompt: 'Every Friday at 9, search the web for what was said this week about [my sector, my competitors, my city]. Keep only what can change my business: new prices, new rules, new competitors, opportunities and calls for tenders. Sum it up in five points at most, each with its source and its date. If nothing important happened, say so in one line.' },
  { title: 'Weekly review', icon: 'chart.line.uptrend.xyaxis', when: 'Every Friday · To-do', prompt: 'Every Friday at 5 pm, review my week. What got done, from my to-do list and my sent emails. What is left on the list, and what has been waiting for more than a week. Who I promised something to and have not answered yet. End with the three priorities I should set for next week.' },
];

export function WebRoutines() {
  const colors = useColors();
  const { rpc, status } = useConnection();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  // The desktop's « New routine » window, open with what to write in it.
  const [composing, setComposing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!rpc) return;
    try { setTasks((await rpc.call('bg-task:list', { sort: 'name:asc' })).items); } catch { setTasks([]); }
  }, [rpc]);
  useEffect(() => { if (status === 'connected') void load(); }, [load, status]);

  const setActive = async (t: Task, active: boolean) => {
    setTasks((all) => all?.map((x) => (x.slug === t.slug ? { ...x, active } : x)) ?? all);
    await rpc?.call('bg-task:patch', { slug: t.slug, partial: { active } }).catch(() => void load());
  };
  const runNow = async (t: Task) => {
    setRunning((r) => [...r, t.slug]);
    try { await rpc?.call('bg-task:run', { slug: t.slug }); } catch { /* the card says how it went */ }
    setRunning((r) => r.filter((s) => s !== t.slug));
    void load();
  };

  return (
    <WebPage>
      <WebPageHeader title={translate('Routines')}
        subtitle={translate('Persistent agents that fire on a schedule or in response to events. Toggle a task inactive to pause it.')}
        action={{ label: translate('New routine'), icon: 'plus', onPress: () => setComposing('') }} />
      {tasks === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : (
        <View style={{ gap: 10 }}>
          {tasks.length === 0 && (
            <Card><Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{translate('No routine yet')}</Text></Card>
          )}
          {tasks.map((t) => <RoutineCard key={t.slug} task={t} running={running.includes(t.slug)} onRun={() => void runNow(t)} onToggle={(v) => void setActive(t, v)} />)}
        </View>
      )}
      <Section title={translate('Ready-made ideas')} subtitle={translate('Pick one: Baarali fills in the task, you adjust it, then create it.')}>
        <Grid min={180}>
          {IDEAS.map((idea) => (
            <Card key={idea.title} onPress={() => setComposing(translate(idea.prompt))} style={{ padding: 14, gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
                <Icon name={idea.icon} size={15} color={colors.label} />
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.label }}>{translate(idea.title)}</Text>
              <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate(idea.when)}</Text>
            </Card>
          ))}
        </Grid>
      </Section>
      {composing !== null ? <NewRoutine initial={composing} onClose={() => setComposing(null)} onCreated={() => { setComposing(null); void load(); }} /> : null}
    </WebPage>
  );
}

// ── The « New routine » window ────────────────────────────────────────────

type Every = 'manual' | 'day' | 'weekdays' | 'week' | 'hour';
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** When it runs, as the routine's cron (the instance's clock is GMT, as the cards say). */
function cronOf(every: Every, time: string, day: number): string | undefined {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : [7, 0];
  if (every === 'manual') return undefined;
  if (every === 'hour') return `${min} * * * *`;
  if (every === 'day') return `${min} ${h} * * *`;
  if (every === 'weekdays') return `${min} ${h} * * 1-5`;
  return `${min} ${h} * * ${day}`;
}

/** As the desktop's: describe it and Baarali sets it up, or set it up by hand (name, instructions, when). */
function NewRoutine({ initial, onClose, onCreated }: { initial: string; onClose: () => void; onCreated: () => void }) {
  const colors = useColors();
  const tints = useTints();
  const { rpc } = useConnection();
  const [mode, setMode] = useState<'describe' | 'manual'>('describe');
  const [description, setDescription] = useState(initial);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState(initial);
  const [every, setEvery] = useState<Every>('day');
  const [time, setTime] = useState('07:00');
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withBaarali = () => {
    const text = description.trim();
    if (!text) return;
    onClose();
    chatWith(`Create a background task for me. Here's what I want it to do:\n\n${text}`, { submit: '1' });
  };
  const byHand = async () => {
    if (!rpc || !name.trim() || !instructions.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const cronExpr = cronOf(every, time, day);
      const res = await rpc.call('bg-task:create', { name: name.trim(), instructions: instructions.trim(), ...(cronExpr ? { triggers: { cronExpr } } : {}) });
      if (res.success) onCreated();
      else setError(res.error ?? translate('Failed to create task'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const field = { borderRadius: 10, borderWidth: 1, borderColor: colors.separator, backgroundColor: tints.card, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20, color: colors.label, ...({ outlineStyle: 'none' } as object) };
  const label = (text: string) => <Text style={{ fontSize: 13, color: colors.secondaryLabel, marginBottom: 6 }}>{translate(text)}</Text>;
  const chip = (id: Every, text: string) => (
    <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: every === id }} onPress={() => setEvery(id)}
      style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', borderWidth: 1, borderColor: every === id ? colors.label : colors.separator, backgroundColor: every === id ? colors.label : 'transparent' }}>
      <Text style={{ fontSize: 13, color: every === id ? colors.background : colors.label }}>{translate(text)}</Text>
    </Pressable>
  );
  const link = (text: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress}><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate(text)}</Text></Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel={translate('Close')} onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, ...({ pointerEvents: 'box-none' } as object) }}>
        <View style={{ width: '100%', maxWidth: 580, maxHeight: '90%', borderRadius: 16, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, padding: 20, ...({ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' } as object) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.label }}>{translate('New routine')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={translate('Close')} onPress={onClose} hitSlop={8}><Icon name="xmark" size={14} color={colors.secondaryLabel} /></Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            {mode === 'describe' ? (
              <>
                <TextInput autoFocus multiline value={description} onChangeText={setDescription}
                  placeholder={translate('Describe what the task should do, and when. For example: every morning at 7, sum up my unread emails in one paragraph, with the list of what I need to do.')}
                  placeholderTextColor={colors.tertiaryLabel}
                  onKeyPress={(e) => { const k = e.nativeEvent as unknown as { key: string; metaKey?: boolean; ctrlKey?: boolean }; if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) { e.preventDefault(); withBaarali(); } }}
                  style={{ ...field, minHeight: 140 }} />
                <Text style={{ marginTop: 8, fontSize: 12, color: colors.tertiaryLabel }}>{`${translate('Tip: be specific about the cadence and the format you want.')} ⌘↵`}</Text>
                <Text style={{ marginTop: 18, marginBottom: 8, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.tertiaryLabel }}>{translate('Or start from an idea')}</Text>
                <Grid min={220}>
                  {IDEAS.map((idea) => (
                    <Card key={idea.title} onPress={() => setDescription(translate(idea.prompt))} style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 2, borderRadius: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{translate(idea.title)}</Text>
                      <Text style={{ fontSize: 11.5, color: colors.secondaryLabel }}>{translate(idea.when)}</Text>
                    </Card>
                  ))}
                </Grid>
              </>
            ) : (
              <View style={{ gap: 16 }}>
                <View>{label('Name')}<TextInput autoFocus value={name} onChangeText={setName} placeholder={translate('Morning summary')} placeholderTextColor={colors.tertiaryLabel} style={field} /></View>
                <View>{label('Instructions')}<TextInput multiline value={instructions} onChangeText={setInstructions} placeholderTextColor={colors.tertiaryLabel} style={{ ...field, minHeight: 110 }} /></View>
                <View>
                  {label('When')}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {chip('day', 'Every day')}{chip('weekdays', 'Weekdays')}{chip('week', 'Every week')}{chip('hour', 'Every hour')}{chip('manual', 'Manual only')}
                  </View>
                  {every === 'week' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {WEEK.map((d, i) => (
                        <Pressable key={d} accessibilityRole="radio" accessibilityState={{ checked: day === i }} onPress={() => setDay(i)}
                          style={{ paddingHorizontal: 10, height: 28, borderRadius: 8, justifyContent: 'center', backgroundColor: day === i ? tints.soft : 'transparent', borderWidth: 1, borderColor: day === i ? colors.tertiaryLabel : colors.separator }}>
                          <Text style={{ fontSize: 12.5, color: colors.label }}>{translate(d)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {every !== 'manual' && every !== 'hour' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{translate('Hour')}</Text>
                      <TextInput value={time} onChangeText={setTime} placeholder="07:00" placeholderTextColor={colors.tertiaryLabel} style={{ ...field, width: 90, paddingVertical: 6, textAlign: 'center' }} />
                      <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>GMT</Text>
                    </View>
                  ) : null}
                </View>
                {error ? <Text style={{ fontSize: 13, color: colors.destructive }}>{error}</Text> : null}
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <View style={{ flex: 1 }}>{mode === 'describe' ? link('Configure manually →', () => { setInstructions(description); setMode('manual'); }) : link('← Describe instead', () => setMode('describe'))}</View>
            <OutlineButton label={translate('Cancel')} onPress={onClose} />
            {mode === 'describe'
              ? <PrimaryButton label={translate('Set up with Copilot')} onPress={withBaarali} disabled={!description.trim()} />
              : <PrimaryButton label={saving ? translate('Creating…') : translate('Create')} onPress={() => void byHand()} disabled={!name.trim() || !instructions.trim() || saving} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RoutineCard({ task: t, running, onRun, onToggle }: { task: Task; running: boolean; onRun: () => void; onToggle: (on: boolean) => void }) {
  const colors = useColors();
  const failed = !running && !!t.lastRunError;
  const planner = isPlanner(t);
  const summary = planner
    ? translate('Suggests up to three to-dos each morning, from your important emails and your meetings. Nothing is added without your OK.')
    : (t.instructions ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const last = ago(t.lastRunAt);
  const event = !!t.triggers?.eventMatchCriteria && !t.triggers.cronExpr && !t.triggers.windows?.length;
  return (
    <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', opacity: t.active ? 1 : 0.75 }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Icon name={planner ? 'sun.horizon' : event ? 'bolt' : 'calendar.badge.clock'} size={18} color={colors.secondaryLabel} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>{t.name}</Text>
        {summary ? <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 19, color: colors.secondaryLabel }}>{summary}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 2 }}>
          <Text style={{ fontSize: 12.5, color: colors.tertiaryLabel }}>{interfaceText(scheduleWords(t.triggers))}</Text>
          <Text style={{ fontSize: 12.5, color: colors.tertiaryLabel }}>{last ? `${translate('Last run')} ${last}` : translate('Never run')}</Text>
          {running ? <Badge tone="busy" label={translate('Running')} />
            : failed ? <Badge tone="warn" icon="exclamationmark.circle" label={translate('Last run failed')} />
              : !t.active ? <Badge tone="muted" label={translate('Paused')} /> : null}
        </View>
        {failed ? <Text numberOfLines={1} style={{ fontSize: 12, color: '#b45309' }}>{t.lastRunError}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <OutlineButton label={running ? translate('Running') : translate('Run now')} icon="play.fill" onPress={onRun} disabled={running} />
        <Switch value={t.active} onValueChange={onToggle} accessibilityLabel={t.active ? translate('Pause') : translate('Resume')} />
      </View>
    </Card>
  );
}

// ── Agents ────────────────────────────────────────────────────────────────

type Entry = sessionsShared.SessionIndexEntry;

export function WebAgents() {
  const colors = useColors();
  const { sessions, events } = useConnection();
  const { team, reload, upsert } = useBaarasseurs();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hiring, setHiring] = useState<string | null>(null);
  const lang = phoneLang();

  useEffect(() => { void reload(); }, [reload]);
  const refresh = useCallback(async () => {
    if (!sessions) return;
    try { setEntries((await sessions.list()).sessions); } catch { /* keep the last list */ }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => (events ? events.on('sessions:events', () => void refresh()) : undefined), [events, refresh]);

  const latest = useMemo(() => {
    const out = new Map<string, Entry>();
    for (const e of entries) {
      if (!e.lastAgentId || !shared.baarasseurIdOf(e.lastAgentId)) continue;
      const prev = out.get(e.lastAgentId);
      if (!prev || e.updatedAt > prev.updatedAt) out.set(e.lastAgentId, e);
    }
    return out;
  }, [entries]);
  const templates = shared.TEMPLATES.filter((t) => !(team ?? []).some((b) => b.name === t.name));

  const open = (b: Baarasseur) => {
    const agent = shared.baarasseurAgentId(b.id);
    router.push({ pathname: '/chat', params: { id: latest.get(agent)?.sessionId ?? '', agent } });
  };
  const hire = async (t: (typeof shared.TEMPLATES)[number]) => {
    setHiring(t.id);
    try {
      const b = { ...shared.templateToBaarasseur(t, (team ?? []).map((x) => x.id), lang), avatar: undefined };
      await upsert(b);
      router.push({ pathname: '/chat', params: { id: '', agent: shared.baarasseurAgentId(b.id) } });
    } catch {
      setHiring(null);
    }
  };

  return (
    <WebPage>
      <WebPageHeader title={translate('Your agents')}
        subtitle={translate('Workers who work for you: each one has a name, a mission, its tools and its model.')}
        action={{ label: translate('Recruit'), icon: 'plus', onPress: () => router.push('/new-agent') }} />
      {team === null ? <ActivityIndicator style={{ marginTop: 32 }} /> : team.length === 0 ? (
        <Card><Text style={{ fontSize: 14, lineHeight: 20, color: colors.secondaryLabel }}>{translate('Recruit your first one: describe it in a sentence, or start from a template below.')}</Text></Card>
      ) : (
        <Grid min={300}>
          {team.map((b) => <AgentCard key={b.id} b={b} last={latest.get(shared.baarasseurAgentId(b.id)) ?? null} onOpen={() => open(b)} />)}
        </Grid>
      )}
      {templates.length > 0 && (
        <Section title={translate('Start from a template')}>
          <Grid min={180}>
            {templates.map((t) => (
              <Card key={t.id} onPress={() => void hire(t)} style={{ padding: 14, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <BaarasseurAvatar b={{ name: t.name, color: t.color }} size={28} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.label }}>{t.role[lang]}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.secondaryLabel }}>{t.summary[lang]}</Text>
                  </View>
                  {hiring === t.id ? <ActivityIndicator size="small" /> : null}
                </View>
              </Card>
            ))}
          </Grid>
        </Section>
      )}
    </WebPage>
  );
}

const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** When an agent works on its own, as the desktop says it: « chaque lundi à 8 h ». */
function agentSchedule(s: NonNullable<Baarasseur['schedule']>): string {
  if (phoneLang() !== 'fr') return shared.scheduleWords(s);
  const at = `à ${s.hour} h`;
  switch (s.every) {
    case 'day': return `chaque jour ${at}`;
    case 'weekday': return `chaque jour de semaine ${at}`;
    case 'week': return `chaque ${DAYS_FR[s.day ?? 1]} ${at}`;
    case 'month': return `le ${Math.max(1, s.day ?? 1)} de chaque mois ${at}`;
  }
  return '';
}

function AgentCard({ b, last, onOpen }: { b: Baarasseur; last: Entry | null; onOpen: () => void }) {
  const colors = useColors();
  const tints = useTints();
  const auto = b.schedule ? `${translate('Automatic')} · ${agentSchedule(b.schedule)}` : null;
  return (
    <Card onPress={onOpen} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BaarasseurAvatar b={b} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>{b.name}</Text>
          {b.role ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.secondaryLabel }}>{b.role}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Edit')} hitSlop={6}
          onPress={() => router.push({ pathname: '/baarasseurs/recruit', params: { id: b.id } })}
          {...({ title: translate('Edit') } as object)}>
          <Icon name="pencil" size={14} color={colors.tertiaryLabel} />
        </Pressable>
      </View>
      {b.mission ? <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 20, color: colors.label }}>{b.mission}</Text> : null}
      {b.tools.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {b.tools.slice(0, 5).map((tool) => (
            <View key={tool} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: tints.soft }}>
              <Text style={{ fontSize: 12, color: colors.label }}>{tool}</Text>
            </View>
          ))}
        </View>
      )}
      {(auto || last) && (
        <View style={{ flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.separator }}>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 12, color: colors.tertiaryLabel }}>{auto ?? ''}</Text>
          {last ? <Text numberOfLines={1} style={{ maxWidth: '50%', fontSize: 12, color: colors.tertiaryLabel }}>{last.title || translate('New chat')}</Text> : null}
        </View>
      )}
    </Card>
  );
}

// ── Code ──────────────────────────────────────────────────────────────────

type Project = { id: string; name: string; path: string; chats: Array<{ id: string; title?: string; modifiedAt: string }> };

export function WebCode() {
  const colors = useColors();
  const tints = useTints();
  const { rpc } = useConnection();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const attachments = useComposerAttachments();
  const voice = useVoiceInput(rpc);
  const [dictating, setDictating] = useState(false);
  // The desktop's mic: tap, speak, tap again; the words land in the field.
  const dictate = async () => {
    if (!rpc || dictating) return;
    setDictating(true);
    try {
      if (voice.state === 'recording') {
        const text = await voice.finish();
        if (text) setDraft((d) => `${d.trim()}${d.trim() ? ' ' : ''}${text}`);
      } else if ((await voice.start()) === 'denied') {
        globalThis.alert?.(translate('Allow microphone access in Settings to dictate a message.'));
      }
    } catch {
      await voice.cancel();
    } finally {
      setDictating(false);
    }
  };
  const models = useModels();
  // The model catalog, read on arrival as the chat reads it.
  const refreshModels = models.refresh;
  useEffect(() => { void refreshModels(); }, [refreshModels]);

  const load = useCallback(async () => {
    if (!rpc) return;
    try { setProjects((await rpc.call('projects:list', null)).projects); } catch { setProjects([]); }
  }, [rpc]);
  useEffect(() => { void load(); }, [load]);

  const project = projects?.find((p) => p.id === chosen) ?? null;
  const recent = useMemo(() => (projects ?? [])
    .flatMap((p) => p.chats.map((c) => ({ ...c, project: p })))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, 5), [projects]);

  const openChat = (id: string, extra: Record<string, string> = {}) => router.push({ pathname: '/chat', params: { id, mode: 'work', ...extra } });
  const start = async (projectId: string | null, text: string, withFiles = false) => {
    if (!rpc || busy) return;
    setBusy(true);
    try {
      // The files go with the words, the chat sends them (stageAttachments, as from the phone's home).
      const key = withFiles ? stageAttachments(attachments.files) : undefined;
      const extra: Record<string, string> = text || key ? { draft: text, submit: '1', ...(key ? { attachments: key } : {}) } : {};
      if (projectId) {
        const { sessionId } = await rpc.call('projects:createChat', { projectId });
        openChat(sessionId, extra);
      } else {
        openChat('', extra);
      }
      setDraft('');
      if (withFiles) attachments.clear();
    } finally {
      setBusy(false);
    }
  };

  return (
    <WebPage>
      <WebPageHeader mark title={translate('Your workspace')} subtitle={translate('Build, review and move your projects forward.')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="folder" size={14} color={colors.secondaryLabel} />
        <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{translate('Project (optional)')}</Text>
        <Pressable accessibilityRole="button" onPress={() => setPicking((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 26, borderRadius: 7, backgroundColor: picking ? tints.soft : 'transparent' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{project?.name ?? translate('Without a project')}</Text>
          <Icon name="chevron.down" size={12} color={colors.secondaryLabel} />
        </Pressable>
      </View>
      {picking && (
        <View style={{ marginBottom: 8, padding: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, gap: 2 }}>
          {[{ id: null as string | null, name: translate('Without a project'), path: '' }, ...(projects ?? [])].map((p) => (
            <Pressable key={p.id ?? 'none'} accessibilityRole="button" onPress={() => { setChosen(p.id); setPicking(false); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 34, borderRadius: 8, backgroundColor: chosen === p.id ? tints.soft : 'transparent' }}>
              <Icon name={p.id ? 'folder' : 'circle'} size={14} color={colors.secondaryLabel} />
              <Text style={{ flex: 1, fontSize: 13.5, color: colors.label }}>{p.name}</Text>
              {chosen === p.id ? <Icon name="checkmark" size={13} color={colors.label} /> : null}
            </Pressable>
          ))}
        </View>
      )}
      {/* The desktop's Code composer: the « + » (images, documents, files, a note, the connectors), the model, send. */}
      <View style={{ zIndex: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, ...({ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' } as object) }}>
        <ChatComposer embedded draft={draft} onChange={setDraft} placeholder={translate('Describe a task, an app or a project.')}
          files={attachments.files} onRemove={attachments.remove} onAttach={() => void attachments.pick()} picking={attachments.picking}
          busy={busy || dictating} onSend={() => void start(chosen, draft.trim(), true)}
          onVoice={rpc ? () => void dictate() : undefined} voiceActive={voice.state === 'recording'} voiceLabel={voice.state === 'recording' ? 'Finish dictation' : 'Dictate a message'}
          leading={<ModelPill models={models} />} menu={[]} menuBelow
          onAttachType={(type) => void attachments.pick(type)} onFiles={attachments.addFiles}
          onInsert={(text) => setDraft((d) => (d && !d.endsWith(' ') ? `${d} ` : d) + text)} />
      </View>
      {project ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.tertiaryLabel }}>{project.path}</Text> : null}

      {recent.length > 0 && (
        <Section title={translate('Resume a session')}>
          <View style={{ gap: 8 }}>
            {recent.map((c) => (
              <Card key={c.id} onPress={() => openChat(c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Icon name="chevron.left.forwardslash.chevron.right" size={15} color={colors.secondaryLabel} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.label }}>{c.title || translate('New chat')}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondaryLabel }}>{c.project.name}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>{ago(c.modifiedAt) ?? ''}</Text>
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Section title={translate('Your projects')}>
        {projects === null ? <ActivityIndicator /> : projects.length === 0 ? (
          <Card><Text style={{ fontSize: 14, color: colors.secondaryLabel }}>{translate('Your projects will appear here.')}</Text></Card>
        ) : (
          <View style={{ gap: 8 }}>
            {projects.map((p) => (
              <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Icon name="folder" size={16} color={colors.secondaryLabel} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.label }}>{p.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondaryLabel }}>{p.path || translate('Project folder')}</Text>
                </View>
                <OutlineButton label={translate('New chat')} icon="plus" onPress={() => void start(p.id, '')} />
              </Card>
            ))}
          </View>
        )}
      </Section>
    </WebPage>
  );
}

// ── To-do ─────────────────────────────────────────────────────────────────

type TodoList = { blocks: Array<{ kind: 'item'; item: todo.TodoItem } | { kind: 'raw'; text: string }> };
type Archived = { month: string; blockIndex: number; date: string | null; item: todo.TodoItem };
const MENTION = /@(baarali|rowboat)\b/i;

/** The desktop's to-do page: the list, a line to add (« @baarali » hands it over), done and dismissed below. */
export function WebTasks() {
  const colors = useColors();
  const { rpc, events, status } = useConnection();
  const [list, setList] = useState<TodoList | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  const [archived, setArchived] = useState<Archived[]>([]);
  const [draft, setDraft] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const input = useState<{ focus?: () => void } | null>(null);
  const [field, setField] = input;

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      const res = await rpc.call('todo:get', null);
      setList(res.list as TodoList);
      setRunning(res.running);
    } catch { setList({ blocks: [] }); }
    try { setArchived((await rpc.call('todo:listArchived', null)).items); } catch { /* none */ }
  }, [rpc]);
  useEffect(() => { if (status === 'connected') void load(); }, [load, status]);
  useEffect(() => (events ? events.on('todo:events', () => void load()) : undefined), [events, load]);

  const items = useMemo(() => (list?.blocks ?? []).flatMap((b) => (b.kind === 'item' ? [b.item] : [])), [list]);
  const open = items.filter((it) => !it.checked);
  const done = items.filter((it) => it.checked);

  const save = async (next: TodoList) => {
    if (!rpc) return;
    setList(next);
    try { const res = await rpc.call('todo:save', { list: next as never }); if (res.list) setList(res.list as TodoList); } catch { void load(); }
  };
  const toggle = (key: string) => {
    if (!list) return;
    void save({ blocks: list.blocks.map((b) => (b.kind === 'item' && b.item.key === key ? { ...b, item: { ...b.item, checked: !b.item.checked } } : b)) });
  };
  const add = async () => {
    const text = draft.trim();
    if (!text || !rpc || adding) return;
    setAdding(true);
    setDraft('');
    try { await rpc.call('todo:addItem', { text, run: MENTION.test(text) }); } finally { setAdding(false); void load(); }
  };
  const run = async (key: string) => {
    if (!rpc) return;
    setRunning((r) => [...r, key]);
    await rpc.call('todo:runItem', { key }).catch(() => {});
    void load();
  };
  const stop = async (key: string) => { await rpc?.call('todo:stopRun', { key }).catch(() => {}); void load(); };
  const dismiss = async (key: string) => { await rpc?.call('todo:dismiss', { key }).catch(() => {}); void load(); };
  const restore = async (a: Archived) => { await rpc?.call('todo:restore', { month: a.month, blockIndex: a.blockIndex, key: a.item.key }).catch(() => {}); void load(); };

  return (
    <WebPage>
      <WebPageHeader title={translate('To-do')} subtitle={translate('Your list. Write @baarali before a line to hand it to the assistant.')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.tertiaryLabel }}>{translate('Tasks')}</Text>
        <Pressable accessibilityRole="button" onPress={() => field?.focus?.()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="plus" size={12} color={colors.secondaryLabel} />
          <Text style={{ fontSize: 12.5, color: colors.secondaryLabel }}>{translate('New to-do')}</Text>
        </Pressable>
      </View>
      {list === null ? <ActivityIndicator style={{ marginTop: 24 }} /> : (
        <View style={{ gap: 1 }}>
          {open.map((it) => (
            <View key={it.key}>
              <TodoRow item={it} busy={running.includes(it.key)} onToggle={() => toggle(it.key)} onRun={() => void run(it.key)} onStop={() => void stop(it.key)} onDismiss={() => void dismiss(it.key)} />
              {it.children.filter((c) => !c.checked).map((c) => (
                <View key={c.key} style={{ paddingLeft: 30 }}>
                  <TodoRow item={c} busy={running.includes(c.key)} onToggle={() => toggle(c.key)} onRun={() => void run(c.key)} onStop={() => void stop(c.key)} onDismiss={() => void dismiss(c.key)} />
                </View>
              ))}
            </View>
          ))}
          {/* The line to add, as the desktop's: Enter adds it, « @baarali » hands it over at once. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingHorizontal: 8 }}>
            <Icon name="plus" size={14} color={colors.tertiaryLabel} />
            <TextInput ref={(r) => setField(r as unknown as { focus?: () => void } | null)} value={draft} onChangeText={setDraft} onSubmitEditing={() => void add()}
              placeholder={translate('Add a to-do… @baarali hands it off')} placeholderTextColor={colors.tertiaryLabel} editable={!adding}
              style={{ flex: 1, fontSize: 14, color: colors.label, paddingVertical: 8, ...({ outlineStyle: 'none' } as object) }} />
            {draft.trim() ? <Text style={{ fontSize: 11, color: colors.tertiaryLabel }}>↵</Text> : null}
          </View>
        </View>
      )}

      {(done.length > 0 || archived.length > 0) && (
        <View style={{ marginTop: 28 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: doneOpen }} onPress={() => setDoneOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name={doneOpen ? 'chevron.down' : 'chevron.right'} size={11} color={colors.tertiaryLabel} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.tertiaryLabel }}>{`${translate('Done & dismissed ·')} ${done.length + archived.length}`}</Text>
          </Pressable>
          {doneOpen && (
            <View style={{ gap: 1 }}>
              {done.map((it) => <TodoRow key={it.key} item={it} busy={false} onToggle={() => toggle(it.key)} />)}
              {archived.map((a) => (
                <TodoRow key={`${a.month}:${a.blockIndex}:${a.item.key}`} item={{ ...a.item, checked: true }} busy={false} archived onRestore={() => void restore(a)} />
              ))}
            </View>
          )}
        </View>
      )}
    </WebPage>
  );
}

/** One line: the box, the words (« @baarali » as a chip), and what can be done with it under the pointer. */
function TodoRow({ item, busy, archived, onToggle, onRun, onStop, onDismiss, onRestore }: {
  item: todo.TodoItem; busy: boolean; archived?: boolean;
  onToggle?: () => void; onRun?: () => void; onStop?: () => void; onDismiss?: () => void; onRestore?: () => void;
}) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  const parts = item.text.split(/(@(?:baarali|rowboat)\b)/i);
  return (
    <Pressable onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onPress={onToggle} disabled={!onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: hover ? tints.hover : 'transparent' }}>
      <View accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }}
        style={{ width: 17, height: 17, borderRadius: 4, borderWidth: item.checked ? 0 : 1.5, borderColor: colors.tertiaryLabel, backgroundColor: item.checked ? colors.label : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {item.checked ? <Icon name="checkmark" size={11} color={colors.background} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: item.checked ? colors.tertiaryLabel : colors.label, textDecorationLine: item.checked ? 'line-through' : 'none' }}>
        {parts.map((p, i) => (MENTION.test(p) && /^@/.test(p)
          ? <Text key={i} style={{ color: colors.label, fontWeight: '600', backgroundColor: tints.soft, borderRadius: 4 }}>{' @baarali '}</Text>
          : <Text key={i}>{p}</Text>))}
      </Text>
      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate('Baarali is on it…')}</Text>
          {onStop ? <OutlineButton label={translate('Stop')} onPress={onStop} /> : null}
        </View>
      ) : !item.checked && item.delegated && onRun ? (
        <Pressable accessibilityRole="button" onPress={onRun} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 6, backgroundColor: tints.soft }}>
          <Icon name="play.fill" size={10} color={colors.secondaryLabel} />
          <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate('run')}</Text>
        </Pressable>
      ) : null}
      {archived && onRestore ? <OutlineButton label={translate('Restore')} onPress={onRestore} /> : null}
      {hover && onDismiss && !busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Dismiss — moves to Done & dismissed, restorable')} onPress={onDismiss} hitSlop={6}
          {...({ title: translate('Dismiss — moves to Done & dismissed, restorable') } as object)}>
          <Icon name="xmark" size={13} color={colors.tertiaryLabel} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
