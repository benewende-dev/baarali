import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, View, KeyboardAvoidingView } from 'react-native';
import type { Member } from '@rowboat/spaces-protocol';

import { SafeAreaView } from 'react-native-safe-area-context';
import { BaaraliMark } from '@/components/baarali-mark';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { searchKey } from '@/lib/team-directory';
import type { Space } from '@rowboat/spaces-protocol';
import { AgentMark, Face } from '@/components/member-face';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useSpacesAccount } from '@/lib/spaces/account';
import { SpacesClient } from '@/lib/spaces/client';
import { useColors } from '@/theme/colors';

// BAARALI(12/10/2026): participants before the name keeps the reviewed
// WhatsApp flow short. Owned agents still enroll through the instance,
// which keeps their keys, before the group's membership is written.

const tap = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};

export default function NewGroupScreen() {
  const colors = useColors();
  const account = useSpacesAccount();
  const { pairing, rpc } = useConnection();
  const { team } = useBaarasseurs();
  const params = useLocalSearchParams<{ org?: string }>();
  const orgs = account.orgs ?? [];
  const [orgAddress, setOrgAddress] = useState(params.org || orgs[0]?.address || '');
  const org = orgs.find((o) => o.address === orgAddress) ?? orgs[0];

  const client = useMemo(
    () => (org ? new SpacesClient({ baseUrl: `https://${org.address}`, token: (opts) => account.getAccessToken(opts) }) : null),
    [org?.address, account.getAccessToken],
  );

  const [step, setStep] = useState<0 | 1>(0);
  const created = useRef<Space | null>(null);
  const submitting = useRef(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<Member[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setRoster(null);
    setPicked(new Set());
    let active = true;
    client
      .listOrgMembers()
      .then(items => { if (active) setRoster(items); })
      .catch((err) => {
        if (!active) return;
        setRoster([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { active = false; };
  }, [client]);

  const me = org?.memberId;
  const others = useMemo(() => (roster ?? []).filter((m) => m.id !== me), [roster, me]);
  const q = searchKey(query);
  const shown = (m: { displayName: string }) => !q || searchKey(m.displayName).includes(q);
  // A baarasseur already in the org is its roster entry: the same name, owned by the person.
  const memberOf = (name: string) => others.find((m) => m.kind === 'agent' && m.ownerId === me && m.displayName === name);
  const crew = pairing ? (team ?? []) : [];
  const mine = others.filter((m) => m.kind === 'agent' && m.ownerId === me && !crew.some((b) => b.name === m.displayName));
  const orgAgents = others.filter((m) => m.kind === 'agent' && m.ownerId !== me);
  const people = others.filter((m) => m.kind !== 'agent');
  const chosen = others.filter((m) => picked.has(m.id));
  const chosenCrew = crew.filter((b) => picked.has(`b:${b.id}`));

  const toggle = (id: string) => {
    tap();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!client || !org || !name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      // The baarasseurs ticked: their member ids, joining the org first if they are not in it.
      // Before the group exists, so a refusal leaves nothing half made.
      const ids = [...picked].filter((id) => !id.startsWith('b:'));
      // The instance knows which are in already (it answers at once for those).
      for (const b of chosenCrew) {
        if (rpc) {
          const { memberId } = (await rpc.call('spaces:enrollBaarasseur', { orgAddress: org.address, baarasseurId: b.id })) as { memberId: string };
          ids.push(memberId);
        } else {
          const known = memberOf(b.name);
          if (known) ids.push(known.id);
        }
      }
      const space = created.current ?? await client.createSpace(name.trim());
      created.current = space;
      if (ids.length > 0) await client.addMembers(space.id, ids);
      if (invite) {
        const { link } = await client.createInvite(space.id);
        await Share.share({ message: link }).catch(() => {});
      }
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/spaces/chat', params: { org: org.address, space: space.id, title: space.name, me: org.memberId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    } finally { submitting.current = false; }
  };

  const canCreate = Boolean(client && name.trim()) && !busy;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={step === 0 ? 'Cancel' : 'Back'} disabled={busy} onPress={() => { if (step === 1) setStep(0); else router.back(); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={step === 0 ? 'sf:xmark' : 'sf:chevron.left'} style={{ width: 18, height: 18 }} tintColor={colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 20, fontWeight: '600', color: colors.label }}>New group</Text><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{step === 0 ? 'Members' : 'Group details'}</Text></View>
      </View>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
        {error && <Text style={{ color: colors.destructive, padding: 16 }}>{error}</Text>}
        {step === 0 ? <>
          {orgs.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 8 }}>
            {orgs.map(item => <Pressable key={item.id} disabled={busy || !!created.current} onPress={() => setOrgAddress(item.address)} style={{ padding: 12, borderRadius: 18, backgroundColor: item.address === org?.address ? colors.accent : colors.secondaryBackground }}><Text style={{ color: item.address === org?.address ? colors.onAccent : colors.label }}>{item.name}</Text></Pressable>)}
          </ScrollView>}
          <View style={{ marginHorizontal: 20, paddingHorizontal: 12, minHeight: 44, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.secondaryBackground }}>
            <Image source="sf:magnifyingglass" style={{ width: 16, height: 16 }} tintColor={colors.secondaryLabel} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Find an agent or a person" accessibilityLabel="Find an agent or a person" autoCorrect={false} placeholderTextColor={colors.tertiaryLabel} style={{ flex: 1, fontSize: 16, color: colors.label, paddingVertical: 12 }} />
          </View>
          <Text style={{ paddingHorizontal: 20, paddingTop: 16, color: colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>Choose people and agents from your team.</Text>
          <Section title="Your agents" />
          {shown({ displayName: 'Baarali' }) && <PickRow face={<BaaraliFace />} name="Baarali" detail={translate("Available in your groups: write @baarali")} state="always" />}
          {mine.filter(shown).map(member => <PickRow key={member.id} face={<Face name={member.displayName} agent />} name={member.displayName} state={picked.has(member.id) ? 'on' : 'off'} onPress={() => toggle(member.id)} />)}
          {crew.filter(agent => shown({ displayName: agent.name })).map(agent => <PickRow key={agent.id} face={<View><BaarasseurAvatar b={agent} size={40} /><AgentMark size={40} /></View>} name={agent.name} detail={agent.role} state={picked.has(`b:${agent.id}`) ? 'on' : 'off'} onPress={() => toggle(`b:${agent.id}`)} />)}
          {orgAgents.some(shown) && <Section title="Team agents" />}
          {orgAgents.filter(shown).map(member => <PickRow key={member.id} face={<Face name={member.displayName} agent />} name={member.displayName} state={picked.has(member.id) ? 'on' : 'off'} onPress={() => toggle(member.id)} />)}
          <Section title="Team members" />
          {roster === null ? <View style={{ alignItems: 'center', padding: 20 }}><BaaraliMark motion="loading" size={32} /></View>
            : people.filter(shown).map(member => <PickRow key={member.id} face={<Face name={member.displayName} />} name={member.displayName} state={picked.has(member.id) ? 'on' : 'off'} onPress={() => toggle(member.id)} />)}
          {roster !== null && people.filter(shown).length === 0 && <Text style={{ padding: 20, color: colors.secondaryLabel, fontSize: 14 }}>{q ? 'No matching results' : 'Nobody else in this org yet.'}</Text>}
          <PickRow face={<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondaryBackground, alignItems: 'center', justifyContent: 'center' }}><Image source="sf:link" style={{ width: 18, height: 18 }} tintColor={colors.accent} /></View>} name={translate("Invite with a link")} detail={translate("Prepare a link after creating the group")} state={invite ? 'on' : 'off'} onPress={() => { tap(); setInvite(value => !value); }} />
        </> : <>
          <View style={{ margin: 20, padding: 16, borderRadius: 20, backgroundColor: colors.secondaryBackground, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Image source="sf:person.2" style={{ width: 26, height: 26 }} tintColor={colors.label} /></View>
            <TextInput value={name} onChangeText={setName} placeholder="Group name" accessibilityLabel="Group name" autoFocus maxLength={128} editable={!busy && !created.current} style={{ flex: 1, fontSize: 18, fontWeight: '500', color: colors.label }} placeholderTextColor={colors.tertiaryLabel} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}><Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.label }}>Members</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep(0)} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 14 }}>Edit members</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Chip label={translate('You')} face={<Face name={org?.displayName ?? '?'} />} />
            <Chip label="Baarali" face={<BaaraliFace />} />
            {chosenCrew.map(agent => <Chip key={agent.id} label={agent.name} face={<View><BaarasseurAvatar b={agent} size={40} /><AgentMark size={40} /></View>} onRemove={busy ? undefined : () => toggle(`b:${agent.id}`)} />)}
            {chosen.map(member => <Chip key={member.id} label={member.displayName} face={<Face name={member.displayName} agent={member.kind === 'agent'} />} onRemove={busy ? undefined : () => toggle(member.id)} />)}
          </ScrollView>
          <Text style={{ paddingHorizontal: 20, paddingTop: 12, fontSize: 14, lineHeight: 21, color: colors.secondaryLabel }}>Messages, shared files and agents in one group.</Text>
          {invite && <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 20 }}><Image source="sf:link" style={{ width: 18, height: 18 }} tintColor={colors.accent} /><Text style={{ flex: 1, color: colors.secondaryLabel, fontSize: 14 }}>An invitation link will be ready after creation.</Text></View>}
        </>}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable accessibilityRole="button" disabled={busy || !client || (step === 1 && !canCreate)} onPress={() => { tap(); if (step === 0) { setQuery(''); setStep(1); } else void create(); }} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.accent, opacity: busy || !client || (step === 1 && !canCreate) ? 0.4 : 1 }}>
          {busy ? <BaaraliMark motion="loading" size={30} color={colors.onAccent} /> : <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>{step === 0 ? 'Continue' : 'Create group'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function BaaraliFace() {
  const colors = useColors();
  return <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}><BaaraliMark size={34} /></View>;
}

function Section({ title }: { title: string }) {
  const colors = useColors();
  return <Text style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>{title}</Text>;
}

function Chip({ label, face, onRemove }: { label: string; face: ReactNode; onRemove?: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onRemove} disabled={!onRemove} accessibilityLabel={label} style={{ width: 58, alignItems: 'center', gap: 4 }}>
      <View>
        {face}
        {onRemove ? (
          <View style={{ position: 'absolute', top: -4, right: -6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tertiaryLabel }}>
            <Image source="sf:xmark" style={{ width: 8, height: 8 }} contentFit="contain" tintColor="#ffffff" />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.label, maxWidth: 58 }}>{label}</Text>
    </Pressable>
  );
}

function PickRow({ face, name, detail, state, onPress }: {
  face: ReactNode;
  name: string;
  detail?: string;
  state: 'on' | 'off' | 'always';
  onPress?: () => void;
}) {
  const colors = useColors();
  const on = state === 'on' || state === 'always';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !onPress }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
      })}
    >
      {face}
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.label }}>{name}</Text>
        {detail ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.secondaryLabel }}>{detail}</Text> : null}
      </View>
      {on ? (
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: state === 'always' ? colors.tertiaryLabel : colors.accent }}>
          <Image source="sf:checkmark" style={{ width: 12, height: 12 }} contentFit="contain" tintColor={colors.onAccent} />
        </View>
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.tertiaryLabel }} />
      )}
    </Pressable>
  );
}
