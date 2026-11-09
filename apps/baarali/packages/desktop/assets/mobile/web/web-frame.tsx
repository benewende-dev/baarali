import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { baarasseurs as team, billing, sessions as sessionsShared } from '@x/shared';
import { BaaraliMark } from '@/components/baarali-mark';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(08/11/2026): Baarali in the browser, laid out as claude.ai (the
// founder's call): on a wide screen, the conversations stay on the left and
// the screen in the middle at a readable width. On the phone, and in a narrow
// window, nothing changes: the app is the phone's.
// BAARALI(09/11/2026): the sidebar made richer, still on the web only: a
// search, the conversations by day, a sidebar that folds into a thin rail
// (⌘B), ⌘K for a new chat, the account and its plan at the foot, the agents
// tighter, the top and the foot always in sight.

/** From this width on, the sidebar stays open. */
const WIDE = 1024;
const SIDEBAR = 272;
const RAIL = 60;
const CONTENT = 880;
/** Agents shown before « Show all ». */
const AGENTS_SHOWN = 5;
/** Conversations shown, then « Show more » adds as many. */
const PAGE = 50;
const FOLDED_KEY = 'baarali.web.sidebar-folded.v1';

type Entry = sessionsShared.SessionIndexEntry;

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

function Icon({ name, size = 16, color }: { name: string; size?: number; color: string }) {
  return <Image source={`sf:${name}`} style={{ width: size, height: size }} tintColor={color} />;
}

function Row({ label, icon, active, onPress, compact, a11y }: {
  label: string; icon: ReactNode; active?: boolean; onPress: () => void; compact?: boolean; a11y?: string;
}) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: !!active }} onPress={onPress}
      onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: compact ? 32 : 36, paddingHorizontal: 10, borderRadius: 9,
        backgroundColor: active ? tints.active : hover ? tints.hover : 'transparent' }}>
      {icon}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14, color: active ? colors.label : hover ? colors.label : colors.secondaryLabel, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

/** A square button for the rail and the header. */
function IconButton({ name, label, onPress, filled }: { name: string; label: string; onPress: () => void; filled?: boolean }) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      // The title shows as the browser's tooltip.
      {...({ title: label } as object)}
      style={{ width: 36, height: 36, borderRadius: filled ? 18 : 9, alignItems: 'center', justifyContent: 'center',
        backgroundColor: filled ? colors.accent : hover ? tints.hover : 'transparent', opacity: filled && hover ? 0.85 : 1 }}>
      <Icon name={name} size={18} color={filled ? colors.onAccent : colors.secondaryLabel} />
    </Pressable>
  );
}

function Heading({ children, onPress, open }: { children: string; onPress?: () => void; open?: boolean }) {
  const colors = useColors();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, marginTop: 16, marginBottom: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.tertiaryLabel }}>{translate(children)}</Text>
      {onPress ? <Icon name={open ? 'chevron.down' : 'chevron.right'} size={12} color={colors.tertiaryLabel} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!open }} onPress={onPress}>{body}</Pressable>;
}

/** The last account read, so the rail and the sidebar show it at once. */
let lastInfo: billing.BillingInfo | null = null;

/** The account at the foot: initials, email, plan; opens the settings. */
function Account({ folded }: { folded: boolean }) {
  const colors = useColors();
  const tints = useTints();
  const { rpc } = useConnection();
  const [info, setInfo] = useState<billing.BillingInfo | null>(lastInfo);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!rpc) return;
    let alive = true;
    rpc.call('billing:getInfo', null).then((v) => { if (v) lastInfo = v; if (alive && v) setInfo(v); }).catch(() => { /* keep the last one */ });
    return () => { alive = false; };
  }, [rpc]);
  const plan = info ? billing.getBillingPlanData(info.catalog, info.subscriptionPlanId) : null;
  const email = info?.userEmail ?? null;
  const badge = (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.label, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.background }}>{initials(email)}</Text>
    </View>
  );
  const label = translate('Settings');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/settings')}
      onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} {...({ title: label } as object)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: folded ? 2 : 8, borderRadius: 10,
        alignSelf: folded ? 'center' : 'stretch', backgroundColor: hover ? tints.hover : 'transparent' }}>
      {badge}
      {!folded && (
        <>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '500', color: colors.label }}>{email ?? 'Baarali'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondaryLabel }}>{plan?.displayName ?? (info ? translate('No plan') : ' ')}</Text>
          </View>
          <Icon name="gearshape" size={16} color={colors.tertiaryLabel} />
        </>
      )}
    </Pressable>
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

function Sidebar({ folded, onFold, searchRef, onNewChat }: {
  folded: boolean; onFold: () => void; searchRef: RefObject<TextInput | null>; onNewChat: () => void;
}) {
  const colors = useColors();
  const { team: agents } = useBaarasseurs();
  const params = useGlobalSearchParams<{ id?: string; agent?: string }>();
  const path = usePathname();
  const entries = useEntries();
  const [query, setQuery] = useState('');
  const [allAgents, setAllAgents] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [focused, setFocused] = useState(false);

  const byId = useMemo(() => new Map((agents ?? []).map((b) => [b.id, b])), [agents]);
  const open = (p: { id?: string; agent?: string }) => router.push({ pathname: '/chat', params: { id: '', ...p } });
  const onChat = path === '/chat';

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

  if (folded) {
    return (
      <View style={{ width: RAIL, borderRightWidth: 1, borderRightColor: colors.separator, backgroundColor: colors.background, alignItems: 'center', paddingVertical: 12, gap: 6 }}>
        <IconButton name="sidebar.left" label={translate('Open sidebar')} onPress={onFold} />
        <IconButton name="plus" label={translate('New chat')} onPress={onNewChat} filled />
        <IconButton name="magnifyingglass" label={translate('Search')} onPress={() => { onFold(); setTimeout(() => searchRef.current?.focus(), 50); }} />
        <View style={{ flex: 1 }} />
        <Account folded />
      </View>
    );
  }

  const agentList = agents ?? [];
  const visibleAgents = allAgents ? agentList : agentList.slice(0, AGENTS_SHOWN);

  return (
    <View style={{ width: SIDEBAR, borderRightWidth: 1, borderRightColor: colors.separator, backgroundColor: colors.background }}>
      {/* The top stays: the name, the fold, a new chat, the search. */}
      <View style={{ paddingTop: 12, paddingHorizontal: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
          <Pressable accessibilityRole="link" accessibilityLabel="Baarali" onPress={() => router.push('/home')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <BaaraliMark size={24} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.label }}>Baarali</Text>
          </Pressable>
          <IconButton name="sidebar.left" label={translate('Close sidebar')} onPress={onFold} />
        </View>
        <NewChatButton active={onChat && !params.id && !params.agent} onPress={onNewChat} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 10, borderRadius: 9,
          borderWidth: 1, borderColor: focused ? colors.tertiaryLabel : colors.separator }}>
          <Icon name="magnifyingglass" size={15} color={colors.tertiaryLabel} />
          <TextInput ref={searchRef} value={query} onChangeText={setQuery} placeholder={translate('Search conversations')} placeholderTextColor={colors.tertiaryLabel}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel={translate('Search conversations')}
            onKeyPress={(e) => { if ((e.nativeEvent as { key?: string }).key === 'Escape') { setQuery(''); searchRef.current?.blur(); } }}
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: colors.label, paddingVertical: 0, ...({ outlineStyle: 'none' } as object) }} />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel={translate('Clear')} onPress={() => setQuery('')} hitSlop={6}>
            <Icon name="xmark.circle.fill" size={14} color={colors.tertiaryLabel} />
          </Pressable> : null}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        {!q && agentList.length > 0 && (
          <>
            <Heading onPress={() => setAgentsOpen((v) => !v)} open={agentsOpen}>Your agents</Heading>
            {agentsOpen && visibleAgents.map((b) => (
              <Row key={b.id} compact label={b.name} a11y={b.role ? `${b.name}, ${b.role}` : b.name}
                active={onChat && params.agent === team.baarasseurAgentId(b.id) && !params.id}
                onPress={() => open({ agent: team.baarasseurAgentId(b.id) })} icon={<BaarasseurAvatar b={b} size={20} />} />
            ))}
            {agentsOpen && agentList.length > AGENTS_SHOWN && (
              <MoreButton label={allAgents ? translate('Show less') : `${translate('Show all')} (${agentList.length})`} onPress={() => setAllAgents((v) => !v)} />
            )}
          </>
        )}

        {groups.map(([group, list]) => (
          <View key={group}>
            <Heading>{group}</Heading>
            {list.map((e) => {
              const agent = byId.get(team.baarasseurIdOf(e.lastAgentId) ?? '');
              const title = e.title || translate('New chat');
              return (
                <Row key={e.sessionId} compact label={title} a11y={agent ? `${title}, ${agent.name}` : title} active={onChat && params.id === e.sessionId}
                  onPress={() => open({ id: e.sessionId, ...(agent ? { agent: team.baarasseurAgentId(agent.id) } : {}) })}
                  icon={agent ? <BaarasseurAvatar b={agent} size={18} /> : <Icon name="bubble.left" size={15} color={colors.tertiaryLabel} />} />
              );
            })}
          </View>
        ))}
        {found.length > shown && <MoreButton label={translate('Show more')} onPress={() => setShown((n) => n + PAGE)} />}
        {q && found.length === 0 && (
          <Text style={{ fontSize: 13, color: colors.secondaryLabel, paddingHorizontal: 10, paddingTop: 16 }}>{translate('No conversation found')}</Text>
        )}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, padding: 8 }}>
        <Account folded={false} />
      </View>
    </View>
  );
}

/** The main button, as claude.ai's: a filled round « + » and its words. */
function NewChatButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const colors = useColors();
  const tints = useTints();
  const [hover, setHover] = useState(false);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={translate('New chat')} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 6, borderRadius: 10,
        backgroundColor: active ? tints.active : hover ? tints.hover : 'transparent' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={16} color={colors.onAccent} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.label }}>{translate('New chat')}</Text>
      {hover ? <Text style={{ fontSize: 12, color: colors.tertiaryLabel }}>{mac ? '⌘K' : 'Ctrl K'}</Text> : null}
    </Pressable>
  );
}

function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{label}</Text>
    </Pressable>
  );
}

export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { pairing } = useConnection();
  const colors = useColors();
  const [folded, setFolded] = useState(readFolded);
  const searchRef = useRef<TextInput | null>(null);
  const wide = Platform.OS === 'web' && width >= WIDE && !!pairing;

  const fold = useCallback(() => setFolded((v) => { saveFolded(!v); return !v; }), []);
  const newChat = useCallback(() => router.push({ pathname: '/chat', params: { id: '' } }), []);

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
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <Sidebar folded={folded} onFold={fold} searchRef={searchRef} onNewChat={newChat} />
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: CONTENT }}>{children}</View>
      </View>
    </View>
  );
}
