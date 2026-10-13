import { router, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, FlatList, Keyboard, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { sessions as shared } from '@x/shared';
import { BaaraliLogo } from './baarali-logo';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';
import { searchKey } from '@/lib/team-directory';
import { useWorkAccess } from '@/lib/work-access-provider';
import { isWorkRoute } from '@/lib/work-access';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

const WORK_LINKS = [
  { label: 'Projects', icon: 'sf:folder', path: '/projects' },
  { label: 'Your agents', icon: 'sf:person.2', path: '/baarasseurs' },
  { label: 'Tasks', icon: 'sf:checkmark.square', path: '/tasks' },
  { label: 'Routines', icon: 'sf:clock', path: '/routines' },
  { label: 'Library', icon: 'sf:books.vertical', path: '/notes' },
  { label: 'Apps', icon: 'sf:square.grid.2x2', path: '/apps' },
  { label: 'Studio', icon: 'sf:play.rectangle', path: '/studio' },
  { label: 'Spaces', icon: 'sf:person.2.wave.2', path: '/(tabs)/spaces' },
  { label: 'Email', icon: 'sf:envelope', path: '/(tabs)/email' },
  { label: 'Meetings', icon: 'sf:mic', path: '/(tabs)/meetings' },
] as const;

// BAARALI(12/10/2026): the founder replaced bottom navigation with two
// discreet top destinations and a collapsible sidebar. Existing routes,
// account identity and session history remain the source of truth.
// The modal owns its safe-area provider so the brand stays below the notch.
export function TopNavigation({ mode = 'chat', inset = true }: { mode?: 'chat' | 'work'; inset?: boolean }) {
  const colors = useColors();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ mode?: string }>();
  const workName = 'Work';
  const currentMode = pathname === '/chat' && params.mode === 'work' ? 'work' : mode;
  const { sessions, pairing } = useConnection();
  const { access } = useWorkAccess();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(340, width - 48);
  const progress = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState<shared.SessionIndexEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { alive = false; subscription.remove(); progress.stopAnimation(); };
  }, [progress]);
  useEffect(() => {
    if (!open) return;
    Animated.timing(progress, { toValue: 1, duration: reducedMotion ? 0 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, progress, reducedMotion]);
  useEffect(() => {
    if (!open || !sessions) return;
    let alive = true;
    setFailed(false);
    void sessions.list().then(result => {
      if (alive) setChats(result.sessions.filter(shared.isChatListSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, sessions, version]);
  useEffect(() => { setChats([]); }, [sessions]);
  const close = () => {
    Animated.timing(progress, { toValue: 0, duration: reducedMotion ? 0 : 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) { setOpen(false); setQuery(''); }
    });
  };
  const go = (path: Href) => {
    Keyboard.dismiss(); setOpen(false); progress.setValue(0); setQuery('');
    const route = typeof path === 'string' ? path : path.pathname;
    router.navigate(isWorkRoute(route) && access !== 'paid' ? '/(tabs)/more' : path);
  };
  const newChat = () => { setOpen(false); progress.setValue(0); router.push({ pathname: '/chat', params: { id: '', mode: currentMode } }); };
  const needle = searchKey(query);
  const filtered = chats.filter(chat => !needle || searchKey(chat.title ?? '').includes(needle));

  return <>
    <SafeAreaView edges={inset ? ['top'] : []} style={{ backgroundColor: colors.background }}>
      <View style={{ height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open sidebar" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Image source="sf:line.3.horizontal" style={{ width: 19, height: 19 }} tintColor={colors.label} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }} accessibilityRole="tablist">
          {[{ label: 'Chat', value: 'chat', path: '/(tabs)/home' }, { label: 'Work', value: 'work', path: '/(tabs)/more' }].map(item => {
            const selected = currentMode === item.value;
            return <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => go(item.path as Href)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: selected ? colors.secondaryBackground : 'transparent' }}><Text style={{ fontSize: 14, fontWeight: selected ? '600' : '400', color: selected ? colors.label : colors.secondaryLabel }}>{item.value === 'work' ? workName : translate(item.label)}</Text>{item.value === 'work' && access === 'free' && <Image source="sf:lock" style={{ width: 11, height: 11 }} tintColor={colors.secondaryLabel} />}</Pressable>;
          })}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={newChat} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Image source="sf:square.and.pencil" style={{ width: 19, height: 19 }} tintColor={colors.label} /></Pressable>
      </View>
    </SafeAreaView>
    <Modal visible={open} transparent animationType="none" onRequestClose={close}>
      <SafeAreaProvider>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', opacity: progress }}><Pressable accessibilityRole="button" accessibilityLabel="Close sidebar" onPress={close} style={{ flex: 1 }} /></Animated.View>
        <Animated.View style={{ width: drawerWidth, backgroundColor: colors.background, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }) }], borderRightWidth: 0.5, borderRightColor: colors.separator }}>
          <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, height: 58 }}><View style={{ flex: 1 }}><BaaraliLogo /></View><Pressable accessibilityRole="button" accessibilityLabel="Close sidebar" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Image source="sf:chevron.left" style={{ width: 17, height: 17 }} tintColor={colors.label} /></Pressable></View>
            <View style={{ marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: 14, backgroundColor: colors.secondaryBackground, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Image source="sf:magnifyingglass" style={{ width: 16, height: 16 }} tintColor={colors.secondaryLabel} /><TextInput value={query} onChangeText={setQuery} placeholder="Search conversations" accessibilityLabel="Search conversations" autoCorrect={false} style={{ flex: 1, fontSize: 15, color: colors.label }} placeholderTextColor={colors.tertiaryLabel} /></View>
            <FlatList data={filtered} keyExtractor={item => item.sessionId} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
              ListHeaderComponent={<>
                {!query && <View style={{ paddingBottom: 12 }}>
                  <SidebarRow label="Chat" icon="sf:bubble.left" selected={pathname === '/home' || (pathname === '/chat' && currentMode === 'chat')} onPress={() => go('/(tabs)/home')} />
                  <SidebarRow label={workName} icon="sf:chevron.left.forwardslash.chevron.right" selected={pathname === '/more'} onPress={() => go('/(tabs)/more')} />
                  <Text style={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 8, fontSize: 12, color: colors.secondaryLabel }}>Workspace</Text>
                  {WORK_LINKS.filter(link => ['/projects', '/baarasseurs', '/(tabs)/spaces'].includes(link.path) && (pairing || link.path.endsWith('/spaces'))).map(link => <SidebarRow key={link.path} label={link.label} icon={link.icon} selected={pathname.startsWith(link.path.replace('/(tabs)', ''))} onPress={() => go(link.path as Href)} />)}
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: toolsOpen }} onPress={() => setToolsOpen(value => !value)} style={{ minHeight: 44, marginHorizontal: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Image source="sf:square.grid.2x2" style={{ width: 18, height: 18 }} tintColor={colors.label} /><Text style={{ flex: 1, fontSize: 15, color: colors.label }}>Tools</Text><Image source={toolsOpen ? 'sf:chevron.up' : 'sf:chevron.down'} style={{ width: 12, height: 12 }} tintColor={colors.secondaryLabel} /></Pressable>
                  {toolsOpen && WORK_LINKS.filter(link => !['/projects', '/baarasseurs', '/(tabs)/spaces'].includes(link.path) && (pairing || ['/email', '/meetings'].some(route => link.path.endsWith(route)))).map(link => <SidebarRow key={link.path} label={link.label} icon={link.icon} selected={pathname.startsWith(link.path.replace('/(tabs)', ''))} onPress={() => go(link.path as Href)} />)}
                </View>}
                <Text style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 8, fontSize: 12, color: colors.secondaryLabel }}>Recent conversations</Text>
                {failed && <Pressable accessibilityRole="button" onPress={() => setVersion(value => value + 1)} style={{ padding: 20 }}><Text style={{ color: colors.accent }}>Reload conversations</Text></Pressable>}
              </>}
              renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => go({ pathname: '/chat', params: { id: item.sessionId, mode: item.lastAgentId && item.lastAgentId !== 'copilot' ? 'work' : 'chat' } })} style={({ pressed }) => ({ minHeight: 46, marginHorizontal: 12, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: pressed ? colors.secondaryBackground : 'transparent' })}><Text numberOfLines={1} style={{ fontSize: 14, color: colors.label }}>{item.title || translate('New chat')}</Text></Pressable>}
              ListEmptyComponent={needle ? <Text style={{ padding: 24, color: colors.secondaryLabel }}>No conversations found</Text> : null}
            />
            <View style={{ paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.separator }}><SidebarRow label="Notifications" icon="sf:bell" onPress={() => go('/inbox')} /><SidebarRow label="Usage" icon="sf:chart.bar" onPress={() => go({ pathname: '/settings', params: { section: 'usage' } })} /><SidebarRow label="Settings" icon="sf:gearshape" onPress={() => go('/settings')} /></View>
          </SafeAreaView>
        </Animated.View>
      </View>
      </SafeAreaProvider>
    </Modal>
  </>;
}

function SidebarRow({ label, icon, selected, onPress }: { label: string; icon: string; selected?: boolean; onPress: () => void }) {
  const colors = useColors();
  const workName = 'Work';
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginHorizontal: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: selected || pressed ? colors.secondaryBackground : 'transparent' })}><Image source={icon} style={{ width: 18, height: 18 }} tintColor={colors.label} /><Text style={{ fontSize: 15, color: colors.label }}>{label === 'Work' ? workName : translate(label)}</Text></Pressable>;
}
