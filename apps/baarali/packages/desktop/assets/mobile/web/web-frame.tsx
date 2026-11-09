import { router, useGlobalSearchParams, useLocalSearchParams, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { baarasseurs as team, billing, sessions as sessionsShared } from '@x/shared';
import type { backgroundTask } from '@x/shared';
import { BaaraliMark } from '@/components/baarali-mark';
import { BaaraliGreeting } from '@/components/chat-header';
import { WebPageHeader } from '@/components/baarali-web-pages';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { usageMetrics } from '@/lib/usage-metrics';
import { sessionResetText, weekResetText } from '@/lib/usage-reset';
import { useWorkAccess } from '@/lib/work-access-provider';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate, interfaceText } from '@/baarali-i18n/mobile/runtime';

// BAARALI(08/11/2026): Baarali in the browser, laid out as claude.ai (the
// founder's call): on a wide screen, the conversations stay on the left and
// the screen in the middle at a readable width. On the phone, and in a narrow
// window, nothing changes: the app is the phone's.
// BAARALI(09/11/2026): as the desktop app (the founder's call): the first
// page is the chat (WebChatWelcome); the sidebar is the desktop's, drawn from
// it: the name and the bell, New chat, Search, Agents, Routines (and how many
// failed), Code, To-do, Library, the rest under « More », the conversations
// under « Discussions », and at the foot the account, the usage ring (the
// session and the week, as the desktop's) and the settings, then whether the
// computer is reached. It folds into a thin rail (⌘B), ⌘K opens a new chat.
// A page opened from the sidebar takes the place of the one shown, as a tab.

/** From this width on, the sidebar stays open. */
const WIDE = 1024;
const SIDEBAR = 272;
const RAIL = 60;
const CONTENT = 880;
/** Conversations shown, then « Show more » adds as many. */
const PAGE = 50;
const FOLDED_KEY = 'baarali.web.sidebar-folded.v1';

type Entry = sessionsShared.SessionIndexEntry;
type Place = { id: string; label: string; icon: string; path: string; paid?: boolean };

/** The desktop's sidebar, in its order. */
const PLACES: Place[] = [
  { id: 'agents', label: 'Agents', icon: 'person.2', path: '/baarasseurs', paid: true },
  { id: 'routines', label: 'Routines', icon: 'clock', path: '/routines', paid: true },
  { id: 'code', label: 'Code', icon: 'chevron.left.forwardslash.chevron.right', path: '/projects', paid: true },
  { id: 'todo', label: 'To-do', icon: 'checklist', path: '/tasks' },
  { id: 'library', label: 'Library', icon: 'books.vertical', path: '/notes' },
];
/** Under « More », as on the desktop. */
const MORE: Place[] = [
  { id: 'email', label: 'Email', icon: 'envelope', path: '/email', paid: true },
  { id: 'meetings', label: 'Meetings', icon: 'calendar', path: '/meetings', paid: true },
  // Team spaces stay out for now: their server does not answer a browser (« Failed to fetch »).
  { id: 'studio', label: 'Studio', icon: 'film', path: '/studio', paid: true },
];

/** The phone's screens that wear the desktop's page title in the browser. */
const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/notes': { title: 'Library', subtitle: 'Your notes and files' },
  '/email': { title: 'Email' },
  '/meetings': { title: 'Meetings' },
};

/** In the browser on a wide screen, linked: the sidebar is there. */
export function useWebWide(): boolean {
  const { width } = useWindowDimensions();
  const { pairing } = useConnection();
  return Platform.OS === 'web' && width >= WIDE && !!pairing;
}

function readFolded(): boolean {
  try { return globalThis.localStorage?.getItem(FOLDED_KEY) === '1'; } catch { return false; }
}
function saveFolded(folded: boolean) {
  try { globalThis.localStorage?.setItem(FOLDED_KEY, folded ? '1' : '0'); } catch { /* private window: forget it */ }
}

/** The hover and selection tints, a step under the app's grey. */
function useTints() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  return { hover: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', active: colors.secondaryBackground };
}

/** The day's groups, as claude.ai: Today, Yesterday, the last 7 and 30 days, Older. */
const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const;
function groupOf(updatedAt: string, now: Date): (typeof GROUPS)[number] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(updatedAt).getTime();
  const day = 86400000;
  if (t >= midnight) return 'Today';
  if (t >= midnight - day) return 'Yesterday';
  if (t >= midnight - 7 * day) return 'Previous 7 days';
  if (t >= midnight - 30 * day) return 'Previous 30 days';
  return 'Older';
}

function initials(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase() || '·';
}

/** Go to a page from the sidebar: it takes the place of the one shown. */
function go(href: Parameters<typeof router.replace>[0]) {
  router.replace(href);
}

function Icon({ name, size = 16, color }: { name: string; size?: number; color: string }) {
  return <Image source={`sf:${name}`} style={{ width: size, height: size }} tintColor={color} />;
}

/** The browser's tooltip. */
const tip = (label: string) => ({ title: label }) as object;

// ── What the sidebar reads: the account's use, the routines ────────────────

/** The account and its use, read once for the whole frame and kept between pages. */
let billingInfo: billing.BillingInfo | null = null;
const billingListeners = new Set<() => void>();
function useBilling(): billing.BillingInfo | null {
  const { rpc } = useConnection();
  const info = useSyncExternalStore((l) => { billingListeners.add(l); return () => { billingListeners.delete(l); }; }, () => billingInfo);
  useEffect(() => {
    if (!rpc) return;
    let alive = true;
    const read = () => rpc.call('billing:getInfo', null).then((v) => {
      if (!alive || !v) return;
      billingInfo = v;
      billingListeners.forEach((l) => l());
    }).catch(() => { /* keep the last one */ });
    void read();
    const poll = setInterval(read, 60000);
    return () => { alive = false; clearInterval(poll); };
  }, [rpc]);
  return info;
}

/** How many routines failed their last run, as the desktop says under « Routines ». */
function useFailedRoutines(): number {
  const { rpc, status } = useConnection();
  const [failed, setFailed] = useState(0);
  useEffect(() => {
    if (!rpc || status !== 'connected') return;
    let alive = true;
    const read = () => rpc.call('bg-task:list', { sort: 'name:asc' })
      .then((r) => { if (alive) setFailed((r.items as backgroundTask.BackgroundTaskSummary[]).filter((t) => t.active && !!t.lastRunError).length); })
      .catch(() => {});
    void read();
    const poll = setInterval(read, 120000);
    return () => { alive = false; clearInterval(poll); };
  }, [rpc, status]);
  return failed;
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Row({ label, icon, active, onPress, a11y, trailing, sub, subTone, strong }: {
  label: string; icon?: ReactNode; active?: boolean; onPress: () => void; a11y?: string; trailing?: ReactNode;
  sub?: string; subTone?: 'warn'; strong?: boolean;
}) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: !!active }} onPress={onPress}
      onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, paddingVertical: sub ? 4 : 0, paddingHorizontal: 10, borderRadius: 8,
        backgroundColor: active || strong ? tints.active : hover ? tints.hover : 'transparent' }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: active || hover || strong ? colors.label : colors.secondaryLabel, fontWeight: active || strong ? '600' : '400' }}>{label}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 11, color: subTone === 'warn' ? colors.destructive : colors.tertiaryLabel }}>{sub}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** A square button for the rail, the header and the foot. */
function IconButton({ name, label, onPress, filled, active, size = 36, children }: {
  name?: string; label: string; onPress: () => void; filled?: boolean; active?: boolean; size?: number; children?: ReactNode;
}) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      {...tip(label)}
      style={{ width: size, height: size, borderRadius: filled ? size / 2 : 8, alignItems: 'center', justifyContent: 'center',
        backgroundColor: filled ? colors.accent : active ? tints.active : hover ? tints.hover : 'transparent', opacity: filled && hover ? 0.85 : 1 }}>
      {children ?? (name ? <Icon name={name} size={17} color={filled ? colors.onAccent : active ? colors.label : colors.secondaryLabel} /> : null)}
    </Pressable>
  );
}

function Heading({ children, onPress, open }: { children: string; onPress?: () => void; open?: boolean }) {
  const colors = useColors();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, marginTop: 14, marginBottom: 4 }}>
      {onPress ? <Icon name={open ? 'chevron.down' : 'chevron.right'} size={11} color={colors.tertiaryLabel} /> : null}
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.tertiaryLabel }}>{translate(children)}</Text>
    </View>
  );
  if (!onPress) return body;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!open }} onPress={onPress}>{body}</Pressable>;
}

const usedPct = (b: { sanctionedCredits: number; usedCredits: number }) =>
  b.sanctionedCredits > 0 ? Math.min(100, Math.max(0, Math.round((b.usedCredits / b.sanctionedCredits) * 100))) : 0;

/** The desktop's usage ring: the session spent, red once nearly gone. */
function Ring({ pct, size = 18 }: { pct: number; size?: number }) {
  const colors = useColors();
  const fill = pct >= 90 ? colors.destructive : colors.label;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      ...({ backgroundImage: `conic-gradient(${fill} ${pct * 3.6}deg, ${colors.separator} 0deg)` } as object) }}>
      <View style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2, backgroundColor: colors.background }} />
    </View>
  );
}

function Meter({ label, pct, line }: { label: string; pct: number; line?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 13, color: colors.label }}>{label}</Text>
        <Text style={{ fontSize: 12.5, color: colors.secondaryLabel }}>{`${pct} %`}</Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.separator }}>
        <View style={{ height: 4, width: `${pct}%`, borderRadius: 2, backgroundColor: pct >= 90 ? colors.destructive : colors.label }} />
      </View>
      {line ? <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>{line}</Text> : null}
    </View>
  );
}

/** What the ring opens: the plan, the session and the week, the way to the details and to the plans. */
function UsagePopover({ info, onClose }: { info: billing.BillingInfo; onClose: () => void }) {
  const colors = useColors();
  const now = Date.now();
  const metrics = usageMetrics(info, now);
  const plan = billing.getBillingPlanData(info.catalog, info.subscriptionPlanId);
  const link = (label: string, path: '/settings' | '/plans') => (
    <Pressable accessibilityRole="link" onPress={() => { onClose(); router.push(path); }} style={{ flexDirection: 'row', alignItems: 'center', height: 32 }}>
      <Text style={{ flex: 1, fontSize: 13, color: colors.label }}>{label}</Text>
      <Icon name="chevron.right" size={12} color={colors.tertiaryLabel} />
    </Pressable>
  );
  return (
    <View style={{ position: 'absolute', left: 8, right: 8, bottom: 96, zIndex: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.separator,
      backgroundColor: colors.background, ...({ boxShadow: '0 8px 28px rgba(0,0,0,0.18)' } as object) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.label }}>{translate('Usage')}</Text>
        <Text style={{ fontSize: 12.5, color: colors.secondaryLabel }}>{plan?.displayName ?? translate('No plan')}</Text>
      </View>
      <Meter label={translate('5-hour session')} pct={metrics.session} line={interfaceText(sessionResetText(metrics.sessionOpen ? info.daily.resetsAt : undefined, now))} />
      <Meter label={translate('This week')} pct={usedPct(info.monthly)} line={(() => { const w = weekResetText(info.monthly.resetsAt, now); return w ? interfaceText(w) : undefined; })()} />
      <View style={{ height: 1, backgroundColor: colors.separator, marginVertical: 6 }} />
      {link(translate('See usage'), '/settings')}
      {link(translate('Plans'), '/plans')}
    </View>
  );
}

/** The account at the foot: initials, email, plan; then the ring and the settings. */
function Foot({ folded }: { folded: boolean }) {
  const colors = useColors();
  const tints = useTints();
  const info = useBilling();
  const { status } = useConnection();
  const [usageOpen, setUsageOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const plan = info ? billing.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  const email = info?.userEmail ?? null;
  const session = info ? usageMetrics(info, Date.now()).session : 0;
  const badge = (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.label, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.background }}>{initials(email)}</Text>
    </View>
  );
  const link = status === 'connected' ? translate('All caught up') : status === 'connecting' ? translate('Connecting…') : translate('Reconnecting…');
  const dot = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : colors.destructive;

  if (folded) {
    return (
      <View style={{ alignItems: 'center', gap: 6 }}>
        <IconButton label={translate('Usage')} onPress={() => router.push('/settings')}><Ring pct={session} /></IconButton>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Settings')} onPress={() => router.push('/settings')} {...tip(email ?? translate('Settings'))}>{badge}</Pressable>
      </View>
    );
  }
  return (
    <View>
      {usageOpen && info ? <UsagePopover info={info} onClose={() => setUsageOpen(false)} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Settings')} onPress={() => router.push('/settings')}
          onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 6, borderRadius: 9, backgroundColor: hover ? tints.hover : 'transparent' }}>
          {badge}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '500', color: colors.label }}>{email ?? 'Baarali'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.secondaryLabel }}>{plan?.displayName ?? (info ? translate('No plan') : ' ')}</Text>
          </View>
        </Pressable>
        <IconButton label={translate('Usage')} size={32} active={usageOpen} onPress={() => setUsageOpen((v) => !v)}><Ring pct={session} /></IconButton>
        <IconButton name="gearshape" label={translate('Settings')} size={32} onPress={() => router.push('/settings')} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingTop: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
        <Text style={{ fontSize: 11.5, color: colors.tertiaryLabel }}>{link}</Text>
      </View>
    </View>
  );
}

function useEntries() {
  const { sessions, events } = useConnection();
  const [entries, setEntries] = useState<Entry[]>([]);
  const refresh = useCallback(async () => {
    if (!sessions) return;
    try {
      const list = (await sessions.list()).sessions.filter(sessionsShared.isChatListSession);
      setEntries(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {
      // Keep the last list while the instance reconnects.
    }
  }, [sessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!events) return;
    const off = events.on('sessions:events', () => void refresh());
    const offResync = events.onResync(() => void refresh());
    return () => { off(); offResync(); };
  }, [events, refresh]);
  return entries;
}

/** The page the path belongs to, for the selection. */
function placeOf(path: string): string | null {
  for (const p of [...PLACES, ...MORE]) if (path === p.path || path.startsWith(`${p.path}/`)) return p.id;
  return null;
}

function Sidebar({ folded, onFold, searchRef, onNewChat, searching, setSearching }: {
  folded: boolean; onFold: () => void; searchRef: RefObject<TextInput | null>; onNewChat: () => void;
  searching: boolean; setSearching: (on: boolean) => void;
}) {
  const colors = useColors();
  const { team: agents } = useBaarasseurs();
  const { access } = useWorkAccess();
  const params = useGlobalSearchParams<{ id?: string; agent?: string }>();
  const path = usePathname();
  const entries = useEntries();
  const failed = useFailedRoutines();
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [shown, setShown] = useState(PAGE);

  const byId = useMemo(() => new Map((agents ?? []).map((b) => [b.id, b])), [agents]);
  const onChat = path === '/chat';
  const here = placeOf(path);
  const locked = access === 'free';
  useEffect(() => { if (here && MORE.some((p) => p.id === here)) setMoreOpen(true); }, [here]);

  const q = query.trim().toLocaleLowerCase();
  const found = useMemo(() => (q ? entries.filter((e) => (e.title || translate('New chat')).toLocaleLowerCase().includes(q)) : entries), [entries, q]);
  const groups = useMemo(() => {
    const now = new Date();
    const out = new Map<(typeof GROUPS)[number], Entry[]>();
    for (const e of found.slice(0, shown)) {
      const g = groupOf(e.updatedAt, now);
      out.set(g, [...(out.get(g) ?? []), e]);
    }
    return GROUPS.filter((g) => out.has(g)).map((g) => [g, out.get(g)!] as const);
  }, [found, shown]);
  useEffect(() => setShown(PAGE), [q]);
  useEffect(() => { if (searching) setTimeout(() => searchRef.current?.focus(), 30); }, [searching, searchRef]);
  const endSearch = () => { setQuery(''); setSearching(false); };

  const lock = (p: Place) => (locked && p.paid ? <Icon name="lock.fill" size={11} color={colors.tertiaryLabel} /> : null);
  const subOf = (p: Place): { sub?: string; subTone?: 'warn' } =>
    p.id === 'routines' && failed > 0 ? { sub: translate('$1 failed · Needs review', [failed]), subTone: 'warn' } : {};
  const place = (p: Place) => (
    <Row key={p.id} label={translate(p.label)} active={here === p.id} onPress={() => go(p.path as Parameters<typeof router.replace>[0])}
      icon={<Icon name={p.icon} size={15} color={here === p.id ? colors.label : colors.secondaryLabel} />} trailing={lock(p)} {...subOf(p)}
      a11y={locked && p.paid ? `${translate(p.label)}, ${translate('Paid plan')}` : undefined} />
  );

  if (folded) {
    return (
      <View style={{ width: RAIL, borderRightWidth: 1, borderRightColor: colors.separator, backgroundColor: colors.background, alignItems: 'center', paddingVertical: 12, gap: 4 }}>
        <IconButton name="sidebar.left" label={translate('Open sidebar')} onPress={onFold} />
        <View style={{ height: 4 }} />
        <IconButton name="square.and.pencil" label={translate('New chat')} onPress={onNewChat} active={onChat && !params.id && !params.agent} />
        <IconButton name="magnifyingglass" label={translate('Search')} onPress={() => { onFold(); setSearching(true); }} />
        {PLACES.map((p) => <IconButton key={p.id} name={p.icon} label={translate(p.label)} active={here === p.id} onPress={() => go(p.path as Parameters<typeof router.replace>[0])} />)}
        <View style={{ flex: 1 }} />
        <Foot folded />
      </View>
    );
  }

  return (
    <View style={{ width: SIDEBAR, borderRightWidth: 1, borderRightColor: colors.separator, backgroundColor: colors.background }}>
      {/* The top stays: the name, the bell, the fold, a new chat, the search. */}
      <View style={{ paddingTop: 12, paddingHorizontal: 8, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, marginBottom: 8 }}>
          <Pressable accessibilityRole="link" accessibilityLabel={translate('New chat')} onPress={onNewChat} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <BaaraliMark size={22} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.label }}>Baarali</Text>
          </Pressable>
          <IconButton name="bell" label={translate('Notifications')} size={32} onPress={() => router.push('/inbox')} />
          <IconButton name="sidebar.left" label={translate('Close sidebar')} size={32} onPress={onFold} />
        </View>
        <Row strong={!(onChat && !params.id && !params.agent)} active={onChat && !params.id && !params.agent} label={translate('New chat')} onPress={onNewChat}
          icon={<Icon name="square.and.pencil" size={15} color={colors.label} />}
          trailing={<Text style={{ fontSize: 11.5, color: colors.tertiaryLabel }}>{isMac() ? '⌘K' : 'Ctrl K'}</Text>} />
        {searching ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.tertiaryLabel }}>
            <Icon name="magnifyingglass" size={15} color={colors.secondaryLabel} />
            <TextInput ref={searchRef} value={query} onChangeText={setQuery} placeholder={translate('Search conversations')} placeholderTextColor={colors.tertiaryLabel}
              accessibilityLabel={translate('Search conversations')} onBlur={() => { if (!query) setSearching(false); }}
              onKeyPress={(e) => { if ((e.nativeEvent as { key?: string }).key === 'Escape') endSearch(); }}
              style={{ flex: 1, minWidth: 0, fontSize: 14, color: colors.label, paddingVertical: 0, ...({ outlineStyle: 'none' } as object) }} />
            <Pressable accessibilityRole="button" accessibilityLabel={translate('Close')} onPress={endSearch} hitSlop={6}>
              <Icon name="xmark" size={13} color={colors.tertiaryLabel} />
            </Pressable>
          </View>
        ) : (
          <Row label={translate('Search')} onPress={() => setSearching(true)} icon={<Icon name="magnifyingglass" size={15} color={colors.secondaryLabel} />} />
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        {!q && (
          <View style={{ gap: 1 }}>
            {PLACES.map(place)}
            <Heading onPress={() => setMoreOpen((v) => !v)} open={moreOpen}>More</Heading>
            {moreOpen && <View style={{ gap: 1 }}>{MORE.map(place)}</View>}
          </View>
        )}

        {!q && <View style={{ height: 1, backgroundColor: colors.separator, marginTop: 10, marginHorizontal: 6 }} />}
        {!q && <Heading onPress={() => setChatsOpen((v) => !v)} open={chatsOpen}>Discussions</Heading>}
        {(chatsOpen || q) && groups.map(([group, list]) => (
          <View key={group} style={{ gap: 1 }}>
            <Text style={{ fontSize: 11, color: colors.tertiaryLabel, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 }}>{translate(group)}</Text>
            {list.map((e) => {
              const agent = byId.get(team.baarasseurIdOf(e.lastAgentId) ?? '');
              const title = e.title || translate('New chat');
              return (
                <Row key={e.sessionId} label={title} a11y={agent ? `${title}, ${agent.name}` : title} active={onChat && params.id === e.sessionId}
                  onPress={() => go({ pathname: '/chat', params: { id: e.sessionId, ...(agent ? { agent: team.baarasseurAgentId(agent.id) } : {}) } })}
                  icon={agent ? <BaarasseurAvatar b={agent} size={15} /> : <Icon name="bubble.left" size={14} color={colors.tertiaryLabel} />} />
              );
            })}
          </View>
        ))}
        {(chatsOpen || q) && found.length > shown && <MoreButton label={translate('Show more')} onPress={() => setShown((n) => n + PAGE)} />}
        {q && found.length === 0 && (
          <Text style={{ fontSize: 13, color: colors.secondaryLabel, paddingHorizontal: 10, paddingTop: 16 }}>{translate('No conversation found')}</Text>
        )}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, padding: 8 }}>
        <Foot folded={false} />
      </View>
    </View>
  );
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{label}</Text>
    </Pressable>
  );
}

const STARTERS = [
  { icon: 'doc.text', title: 'Summarize a document', prompt: 'Please summarize this document and highlight its key points.' },
  { icon: 'play.rectangle', title: 'Prepare a presentation', prompt: 'Please help me prepare a clear, structured presentation.' },
  { icon: 'globe', title: 'Search the web', prompt: 'Please research reliable sources on the following subject: ' },
];

/** The new chat's page, as the desktop's: the B, the question, its line, the three ideas; the composer stays below. */
export function WebChatWelcome({ onPick }: { onPick: (prompt: string) => void }) {
  const colors = useColors();
  const { first } = useLocalSearchParams<{ first?: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 }}>
      <BaaraliMark size={44} />
      <Text style={{ fontFamily: 'Source Serif 4', fontSize: 32, fontWeight: '500', color: colors.label, textAlign: 'center' }}>{translate('How can I help you?')}</Text>
      {first === '1' ? <BaaraliGreeting /> : <Text style={{ fontSize: 14, color: colors.secondaryLabel, textAlign: 'center' }}>{translate('A question, an idea or a document to explore.')}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14, maxWidth: 560 }}>
        {STARTERS.map((s) => <Starter key={s.title} icon={s.icon} title={translate(s.title)} onPress={() => onPick(translate(s.prompt))} />)}
      </View>
    </View>
  );
}

function Starter({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 12, borderRadius: 9,
        borderWidth: 1, borderColor: hover ? colors.tertiaryLabel : colors.separator, backgroundColor: hover ? tints.hover : 'transparent' }}>
      <Icon name={icon} size={14} color={colors.secondaryLabel} />
      <Text style={{ fontSize: 13, color: colors.label }}>{title}</Text>
    </Pressable>
  );
}

export function WebFrame({ children }: { children: ReactNode }) {
  const colors = useColors();
  const path = usePathname();
  const wide = useWebWide();
  const [folded, setFolded] = useState(readFolded);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<TextInput | null>(null);

  const fold = useCallback(() => setFolded((v) => { saveFolded(!v); return !v; }), []);
  const newChat = useCallback(() => go('/chat'), []);

  // The first page is the chat, as on the desktop; the phone's home stays the phone's.
  useEffect(() => {
    if (wide && (path === '/home' || path === '/')) go('/chat');
  }, [wide, path]);

  // ⌘K a new chat, ⌘B the sidebar (Ctrl off the Mac).
  useEffect(() => {
    if (!wide || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); newChat(); }
      else if (key === 'b') { e.preventDefault(); fold(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, fold, newChat]);

  if (!wide) return <>{children}</>;
  const page = PAGE_TITLES[path];
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <Sidebar folded={folded} onFold={fold} searchRef={searchRef} onNewChat={newChat} searching={searching} setSearching={setSearching} />
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: CONTENT }}>
          {page ? <View style={{ paddingHorizontal: 16 }}><WebPageHeader title={translate(page.title)} subtitle={page.subtitle ? translate(page.subtitle) : undefined} /></View> : null}
          {children}
        </View>
      </View>
    </View>
  );
}
