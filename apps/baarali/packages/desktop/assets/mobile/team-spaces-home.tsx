import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Member, Space } from '@rowboat/spaces-protocol';
import { BaaraliMark } from './baarali-mark';
import { TopNavigation } from './top-navigation';
import { Face } from './member-face';
import { JoinWithLink } from './join-with-link';
import { useSpacesAccount, type SpacesOrg } from '@/lib/spaces/account';
import { SpacesClient } from '@/lib/spaces/client';
import { filterDirectory } from '@/lib/team-directory';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

const tap = () => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); };

// BAARALI(12/10/2026): one active team, search and explicit destinations
// adapt the reviewed Slack references to Baarali's existing Spaces routes.
export function TeamSpacesHome() {
  const account = useSpacesAccount();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const org = account.orgs?.find(item => item.address === address) ?? account.orgs?.[0];
  const [refreshing, setRefreshing] = useState(false);
  const refreshOrgs = async () => {
    setRefreshing(true);
    try { await account.refreshOrgs(); } finally { setRefreshing(false); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <TopNavigation mode="work" inset={false} />
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>TEAM SPACES</Text>
        <Text numberOfLines={1} style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.5, color: colors.label }}>{org?.name ?? 'Your team'}</Text>
      </View>
      {!!org && <Pressable accessibilityRole="button" accessibilityLabel="New group" onPress={() => { tap(); router.push({ pathname: '/spaces/new', params: { org: org.address } }); }} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}><Image source="sf:plus" style={{ width: 20, height: 20 }} tintColor={colors.onAccent} /></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Team and account" onPress={() => { tap(); setMenu(true); }}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:ellipsis" style={{ width: 20, height: 20 }} tintColor={colors.label} />
      </Pressable>
    </View>
    {org ? <TeamDirectory key={`${org.address}:${org.memberId}`} org={org} /> : <ScrollView style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshOrgs()} />}>
      {account.orgs === null && !account.orgsError ? <View style={{ alignItems: 'center', paddingTop: 40 }}><BaaraliMark size={42} motion="loading" /></View>
        : <View style={{ alignItems: 'center', paddingVertical: 38, gap: 12 }}>
          <Image source="sf:person.2" style={{ width: 34, height: 34 }} tintColor={colors.secondaryLabel} />
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.label }}>Work together in one place</Text>
          <Text style={{ fontSize: 15, lineHeight: 22, textAlign: 'center', color: colors.secondaryLabel }}>Join your team with its invitation link.</Text>
          <JoinWithLink />
          {account.orgsError && <><Text style={{ color: colors.destructive }}>{account.orgsError}</Text><Action text="Try again" onPress={() => void refreshOrgs()} /></>}
        </View>}
    </ScrollView>}
    <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setMenu(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12, maxHeight: '75%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.label }}>Team and account</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setMenu(false)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Image source="sf:xmark" style={{ width: 16, height: 16 }} tintColor={colors.label} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {(account.orgs ?? []).map(team => <Pressable key={team.id} accessibilityRole="button" accessibilityState={{ selected: team.address === org?.address }}
            onPress={() => { tap(); setAddress(team.address); setMenu(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
            <Face name={team.name} size={40} />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '500', color: colors.label }}>{team.name}</Text><Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>{team.role === 'admin' ? 'Admin' : 'Member'}</Text></View>
            {team.address === org?.address && <Image source="sf:checkmark" style={{ width: 16, height: 16 }} tintColor={colors.accent} />}
          </Pressable>)}
          <View style={{ borderTopWidth: 0.5, borderColor: colors.separator, paddingTop: 8 }}><JoinWithLink /></View>
          {!!org?.displayName && <Text style={{ padding: 14, color: colors.secondaryLabel, fontSize: 13 }}>{org.displayName}</Text>}
          <Pressable accessibilityRole="button" onPress={() => { setMenu(false); void account.signOut(); }} style={{ padding: 14 }}><Text style={{ color: colors.destructive, fontSize: 15 }}>Sign out</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </SafeAreaView>;
}

function TeamDirectory({ org }: { org: SpacesOrg }) {
  const account = useSpacesAccount();
  const colors = useColors();
  const client = useMemo(() => new SpacesClient({ baseUrl: `https://${org.address}`, token: account.getAccessToken }), [org.address, account.getAccessToken]);
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'spaces' | 'people'>('spaces');
  const [refreshing, setRefreshing] = useState(false);
  const [openingDm, setOpeningDm] = useState<string | null>(null);
  const opening = useRef(false);
  const generation = useRef(0);

  // Two requests per active team replace a listMembers call for every
  // space in every team. Partial failure does not hide the other list.
  const load = useCallback(async () => {
    const mine = ++generation.current;
    await Promise.all([
      client.listSpaces().then(items => { if (mine === generation.current) { setSpaces(items); setSpaceError(null); } }, () => { if (mine === generation.current) setSpaceError('Could not load team spaces. Please try again.'); }),
      client.listOrgMembers().then(items => { if (mine === generation.current) { setMembers(items); setMemberError(null); } }, () => { if (mine === generation.current) setMemberError('Could not load the team directory. Please try again.'); }),
    ]);
  }, [client]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current += 1; }; }, [load]));
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([load(), account.refreshOrgs()]); } finally { setRefreshing(false); }
  };
  const directory = useMemo(() => filterDirectory(spaces ?? [], members ?? [], query, org.memberId), [spaces, members, query, org.memberId]);
  const error = tab === 'spaces' ? spaceError : memberError;
  const loading = tab === 'spaces' ? spaces === null : members === null;
  const empty = tab === 'spaces' ? directory.spaces.length === 0 : directory.members.length === 0;
  const goSpace = (space: Space) => { tap(); router.push({ pathname: '/spaces/chat', params: { org: org.address, space: space.id, title: space.name, me: org.memberId } }); };
  const goDm = async (member: Member) => {
    if (opening.current) return;
    opening.current = true;
    setOpeningDm(member.id);
    tap();
    try {
      const { space } = await client.openDirect(member.id);
      router.push({ pathname: '/spaces/chat', params: { org: org.address, space: space.id, title: member.displayName, me: org.memberId } });
    } catch {
      Alert.alert(translate('Direct message'), translate('The conversation could not be opened. Please try again.'));
    } finally { opening.current = false; setOpeningDm(null); }
  };

  return <View style={{ flex: 1 }}>
    <View style={{ marginHorizontal: 20, paddingHorizontal: 12, minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondaryBackground }}>
      <Image source="sf:magnifyingglass" style={{ width: 17, height: 17 }} tintColor={colors.secondaryLabel} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Find a group or a person" accessibilityLabel="Find a group or a person" autoCorrect={false}
        placeholderTextColor={colors.tertiaryLabel} style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: colors.label }} returnKeyType="search" />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={{ width: 32, height: 40, justifyContent: 'center', alignItems: 'center' }}><Image source="sf:xmark.circle.fill" style={{ width: 16, height: 16 }} tintColor={colors.secondaryLabel} /></Pressable>}
    </View>
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 }}>
      {(['spaces', 'people'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => { tap(); setTab(value); }}
        style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: tab === value ? colors.label : colors.secondaryBackground }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: tab === value ? colors.background : colors.secondaryLabel }}>{value === 'spaces' ? 'Groups' : 'Direct messages'}</Text>
      </Pressable>)}
    </View>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      {error && <View style={{ gap: 8, paddingVertical: 12 }}><Text style={{ fontSize: 13, color: colors.destructive }}>{translate(error)}</Text><Action text="Try again" onPress={() => void load()} /></View>}
      {loading && !error ? <View style={{ alignItems: 'center', paddingVertical: 36 }}><BaaraliMark size={38} motion="loading" /></View> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12 }}><Text style={{ flex: 1, color: colors.secondaryLabel, fontSize: 12 }}>{tab === 'spaces' ? 'Your groups' : 'People and agents'}</Text>

        </View>
        {tab === 'spaces' ? directory.spaces.map(space => <DirectoryRow key={space.id} onPress={() => goSpace(space)}
          face={<View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}><Image source={space.visibility === 'private' ? 'sf:lock' : 'sf:number'} style={{ width: 20, height: 20 }} tintColor={colors.label} /></View>}
          name={space.name} detail={space.visibility === 'private' ? 'Members only' : 'Open to your team'} />)
          : directory.members.map(member => <DirectoryRow key={member.id} onPress={() => void goDm(member)} disabled={openingDm !== null} loading={openingDm === member.id}
            face={<Face name={member.displayName} agent={member.kind === 'agent'} size={44} />} name={member.displayName} detail={member.kind === 'agent' ? 'Agent' : 'Team member'} />)}
        {empty && !error && <View style={{ alignItems: 'center', paddingVertical: 38, gap: 10 }}><Image source={query ? 'sf:magnifyingglass' : tab === 'spaces' ? 'sf:bubble.left.and.bubble.right' : 'sf:person.2'} style={{ width: 32, height: 32 }} tintColor={colors.secondaryLabel} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label }}>{query ? 'No matching results' : tab === 'spaces' ? 'Your first group' : 'Your directory is empty'}</Text>
          <Text style={{ textAlign: 'center', fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>{query ? 'Try another name or clear your search.' : tab === 'spaces' ? 'Create a group to bring your team and agents together.' : 'People and agents in your team will appear here.'}</Text>
        </View>}
      </>}
    </ScrollView>
  </View>;
}

function Action({ text, onPress }: { text: string; onPress: () => void }) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ fontSize: 13, fontWeight: '500', color: colors.accent }}>{translate(text)}</Text></Pressable>;
}

function DirectoryRow({ face, name, detail, onPress, disabled, loading }: { face: ReactNode; name: string; detail: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5, borderColor: colors.separator, opacity: pressed || disabled ? 0.6 : 1 })}>
    {face}<View style={{ flex: 1, gap: 3 }}><Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: colors.label }}>{name}</Text><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{translate(detail)}</Text></View>
    {loading ? <BaaraliMark size={26} motion="loading" /> : <Image source="sf:chevron.right" style={{ width: 12, height: 12 }} tintColor={colors.tertiaryLabel} />}
  </Pressable>;
}
