import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { baarasseurs as team, sessions as sessionsShared } from '@x/shared';
import { BaaraliMark } from '@/components/baarali-mark';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(08/11/2026): Baarali in the browser, laid out as claude.ai (the
// founder's call): on a wide screen, the conversations stay on the left and
// the screen in the middle at a readable width. On the phone, and in a narrow
// window, nothing changes: the app is the phone's.

/** From this width on, the sidebar stays open. */
const WIDE = 1024;
const SIDEBAR = 272;
const CONTENT = 880;

type Entry = sessionsShared.SessionIndexEntry;

function Row({ label, icon, active, onPress, sub }: { label: string; icon: ReactNode; active?: boolean; onPress: () => void; sub?: string }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
        backgroundColor: active ? colors.secondaryBackground : hover ? colors.secondaryBackground : 'transparent' }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: colors.label, fontWeight: active ? '600' : '400' }}>{label}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondaryLabel }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function Heading({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={{ fontSize: 12, fontWeight: '600', color: colors.secondaryLabel, paddingHorizontal: 10, marginTop: 18, marginBottom: 4 }}>{translate(children)}</Text>;
}

function Sidebar() {
  const colors = useColors();
  const { sessions, events } = useConnection();
  const { team: agents } = useBaarasseurs();
  const params = useGlobalSearchParams<{ id?: string; agent?: string }>();
  const path = usePathname();
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

  const byId = useMemo(() => new Map((agents ?? []).map((b) => [b.id, b])), [agents]);
  const open = (p: { id?: string; agent?: string }) => router.push({ pathname: '/chat', params: { id: '', ...p } });
  const onChat = path === '/chat';

  return (
    <View style={{ width: SIDEBAR, borderRightWidth: 1, borderRightColor: colors.separator, backgroundColor: colors.background, paddingTop: 14 }}>
      <Pressable accessibilityRole="link" accessibilityLabel="Baarali" onPress={() => router.push('/home')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 12 }}>
        <BaaraliMark size={26} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.label }}>Baarali</Text>
      </Pressable>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        <Row label={translate('New chat')} active={onChat && !params.id && !params.agent} onPress={() => open({})}
          icon={<Image source="sf:plus" style={{ width: 16, height: 16 }} tintColor={colors.label} />} />
        {(agents ?? []).length > 0 && <Heading>Your agents</Heading>}
        {(agents ?? []).map((b) => (
          <Row key={b.id} label={b.name} sub={b.role ?? undefined} active={onChat && params.agent === team.baarasseurAgentId(b.id) && !params.id}
            onPress={() => open({ agent: team.baarasseurAgentId(b.id) })} icon={<BaarasseurAvatar b={b} size={22} />} />
        ))}
        {entries.length > 0 && <Heading>Conversations</Heading>}
        {entries.slice(0, 60).map((e) => {
          const agent = byId.get(team.baarasseurIdOf(e.lastAgentId) ?? '');
          return (
            <Row key={e.sessionId} label={e.title || translate('New chat')} sub={agent?.name} active={onChat && params.id === e.sessionId}
              onPress={() => open({ id: e.sessionId, ...(agent ? { agent: team.baarasseurAgentId(agent.id) } : {}) })}
              icon={agent ? <BaarasseurAvatar b={agent} size={18} /> : <Image source="sf:bubble.left" style={{ width: 15, height: 15 }} tintColor={colors.secondaryLabel} />} />
          );
        })}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, padding: 8 }}>
        <Row label={translate('Settings')} onPress={() => router.push('/settings')}
          icon={<Image source="sf:person.crop.circle" style={{ width: 18, height: 18 }} tintColor={colors.label} />} />
      </View>
    </View>
  );
}

export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { pairing } = useConnection();
  const colors = useColors();
  if (Platform.OS !== 'web' || width < WIDE || !pairing) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <Sidebar />
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: CONTENT }}>{children}</View>
      </View>
    </View>
  );
}
