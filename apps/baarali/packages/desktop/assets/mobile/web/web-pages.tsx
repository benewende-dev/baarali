import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { baarasseurs as shared, sessions as sessionsShared } from '@x/shared';
import type { backgroundTask } from '@x/shared';
import { BaaraliMark } from '@/components/baarali-mark';
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
        action={{ label: translate('New routine'), icon: 'plus', onPress: () => chatWith('') }} />
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
            <Card key={idea.title} onPress={() => chatWith(translate(idea.prompt))} style={{ padding: 14, gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
                <Icon name={idea.icon} size={15} color={colors.label} />
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.label }}>{translate(idea.title)}</Text>
              <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate(idea.when)}</Text>
            </Card>
          ))}
        </Grid>
      </Section>
    </WebPage>
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
  const start = async (projectId: string | null, text: string) => {
    if (!rpc || busy) return;
    setBusy(true);
    try {
      if (projectId) {
        const { sessionId } = await rpc.call('projects:createChat', { projectId });
        openChat(sessionId, text ? { draft: text, submit: '1' } : {});
      } else {
        openChat('', text ? { draft: text, submit: '1' } : {});
      }
      setDraft('');
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
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, padding: 12, gap: 8, ...({ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' } as object) }}>
        <TextInput value={draft} onChangeText={setDraft} multiline placeholder={translate('Describe a task, an app or a project.')} placeholderTextColor={colors.tertiaryLabel}
          onKeyPress={(e) => {
            const k = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (k.key === 'Enter' && !k.shiftKey) { e.preventDefault(); if (draft.trim()) void start(chosen, draft.trim()); }
          }}
          style={{ minHeight: 48, maxHeight: 200, fontSize: 15, color: colors.label, ...({ outlineStyle: 'none' } as object) }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 12, color: colors.tertiaryLabel }}>{project ? project.path : ' '}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={translate('Send')} disabled={!draft.trim() || busy} onPress={() => void start(chosen, draft.trim())}
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: !draft.trim() || busy ? 0.35 : 1 }}>
            {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Icon name="arrow.up" size={16} color={colors.onAccent} />}
          </Pressable>
        </View>
      </View>

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
