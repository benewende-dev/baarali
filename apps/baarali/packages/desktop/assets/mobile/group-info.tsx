import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Member, Space } from '@rowboat/spaces-protocol';
import { Face } from './member-face';
import { BaaraliMark } from './baarali-mark';
import type { SpacesClient } from '@/lib/spaces/client';
import { searchKey } from '@/lib/team-directory';
import { useConnection } from '@/lib/connection';
import { useBaarasseurs, BaarasseurAvatar } from '@/lib/baarasseurs';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(12/10/2026): existing groups also have a visible member picker
// and invitation action; direct messages keep their fixed membership.
export function GroupInfoButton({ client, space, orgAddress, me, title, onMembers }: {
  client: SpacesClient; space: string; orgAddress: string; me: string; title?: string; onMembers: (members: Member[]) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rpc } = useConnection();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Space | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [roster, setRoster] = useState<Member[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const generation = useRef(0);
  const load = async () => {
    const mine = ++generation.current;
    setError(null);
    try {
      const [spaces, people] = await Promise.all([client.listSpaces({ includeDirect: true }), client.listMembers(space)]);
      if (mine !== generation.current) return;
      setInfo(spaces.find(item => item.id === space) ?? null);
      setMembers(people);
    } catch { if (mine === generation.current) setError('Could not load group members. Please try again.'); }
  };
  useEffect(() => {
    if (!open) return;
    void load();
    return () => { generation.current += 1; };
  }, [open, client, space]);
  const close = () => { if (submitting.current) return; setOpen(false); setAdding(false); setPicked(new Set()); setQuery(''); setRoster(null); setMembers(null); setInfo(null); };
  const beginAdd = async () => {
    setAdding(true);
    setError(null);
    const mine = generation.current;
    try { const people = await client.listOrgMembers(); if (mine === generation.current) setRoster(people); }
    catch { if (mine === generation.current) setError('Could not load the team directory. Please try again.'); }
  };
  const candidates = useMemo(() => {
    const present = new Set((members ?? []).map(member => member.id));
    const needle = searchKey(query);
    return (roster ?? []).filter(member => !present.has(member.id) && (!needle || searchKey(member.displayName).includes(needle))).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [roster, members, query]);
  const add = async () => {
    if (!picked.size || submitting.current || info?.kind !== 'shared') return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const ids = [...picked].filter(id => !id.startsWith('b:'));
      for (const id of picked) if (id.startsWith('b:')) {
        if (!rpc) throw new Error('Not connected');
        const { memberId } = await rpc.call('spaces:enrollBaarasseur', { orgAddress, baarasseurId: id.slice(2) });
        ids.push(memberId);
      }
      await client.addMembers(space, ids);
      const people = await client.listMembers(space);
      setMembers(people);
      onMembers(people);
      setPicked(new Set());
      setAdding(false);
      setQuery('');
    } catch { setError('The members could not be added. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const invite = async () => {
    if (submitting.current || info?.kind !== 'shared') return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try { const { link } = await client.createInvite(space); await Share.share({ message: link }); }
    catch { setError('The invitation link could not be prepared. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Group members" hitSlop={8} onPress={() => setOpen(true)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Image source="sf:person.2" style={{ width: 20, height: 20 }} tintColor={colors.label} />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, maxHeight: '80%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12 }}>
          <View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 20, fontWeight: '600', color: colors.label }}>{adding ? 'Add members' : title ?? info?.name ?? 'Members'}</Text><Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{adding ? 'Choose people and agents from your team.' : translate('Members')}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={busy} onPress={close} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Image source="sf:xmark" style={{ width: 16, height: 16 }} tintColor={colors.label} /></Pressable>
        </View>
        {error && <View style={{ gap: 8, paddingBottom: 12 }}><Text style={{ fontSize: 13, color: colors.destructive }}>{translate(error)}</Text><Pressable accessibilityRole="button" onPress={() => void (adding ? beginAdd() : load())} style={{ minHeight: 36, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Try again</Text></Pressable></View>}
        {adding && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.secondaryBackground, marginBottom: 12 }}>
          <Image source="sf:magnifyingglass" style={{ width: 16, height: 16 }} tintColor={colors.secondaryLabel} /><TextInput value={query} onChangeText={setQuery} placeholder="Find an agent or a person" autoCorrect={false} placeholderTextColor={colors.tertiaryLabel} style={{ flex: 1, fontSize: 16, color: colors.label }} />
        </View>}
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {adding && roster !== null && <OwnedAgentChoices roster={roster} members={members ?? []} me={me} query={query} picked={picked} busy={busy} onToggle={id => setPicked(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />}
          {(adding ? roster === null : members === null) && !error ? <View style={{ alignItems: 'center', padding: 24 }}><BaaraliMark size={34} motion="loading" /></View>
            : (adding ? candidates : members ?? []).map(member => <Pressable key={member.id} accessibilityRole={adding ? 'checkbox' : undefined} accessibilityState={adding ? { checked: picked.has(member.id), disabled: busy } : undefined} disabled={!adding || busy}
              onPress={() => setPicked(previous => { const next = new Set(previous); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <Face name={member.displayName} agent={member.kind === 'agent'} size={40} /><View style={{ flex: 1 }}><Text style={{ color: colors.label, fontSize: 16 }}>{member.displayName}</Text><Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>{member.kind === 'agent' ? 'Agent' : 'Team member'}</Text></View>
              {adding && <Image source={picked.has(member.id) ? 'sf:checkmark.circle.fill' : 'sf:circle'} style={{ width: 24, height: 24 }} tintColor={picked.has(member.id) ? colors.accent : colors.tertiaryLabel} />}
            </Pressable>)}
          {adding && roster !== null && !candidates.length && !error && <Text style={{ paddingVertical: 20, color: colors.secondaryLabel, fontSize: 14 }}>{query ? 'No matching results' : 'No other team members to add.'}</Text>}
        </ScrollView>
        {info?.kind === 'shared' && <View style={{ gap: 8, paddingTop: 14 }}>
          {adding ? <><Pressable accessibilityRole="button" disabled={!picked.size || busy} onPress={() => void add()} style={{ minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: !picked.size || busy ? 0.4 : 1 }}><Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>{busy ? 'Adding…' : 'Add members'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setAdding(false); setError(null); }} style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Back</Text></Pressable></>
            : <><Pressable accessibilityRole="button" disabled={busy} onPress={() => void beginAdd()} style={{ minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}><Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>Add members</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void invite()} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.accent }}>{busy ? 'Preparing…' : 'Invite with a link'}</Text></Pressable></>}
        </View>}
      </View>
    </Modal>
  </>;
}

function OwnedAgentChoices({ roster, members, me, query, picked, busy, onToggle }: { roster: Member[]; members: Member[]; me: string; query: string; picked: Set<string>; busy: boolean; onToggle: (id: string) => void }) {
  const { rpc } = useConnection();
  const { team } = useBaarasseurs();
  const colors = useColors();
  if (!rpc) return null;
  const agents = (team ?? []).filter(agent => ![...roster, ...members].some(member => member.kind === 'agent' && member.ownerId === me && member.displayName === agent.name) && (!query || searchKey(agent.name).includes(searchKey(query))));
  if (!agents.length) return null;
  return <View><Text style={{ color: colors.secondaryLabel, fontSize: 13, paddingVertical: 8 }}>Your agents</Text>{agents.map(agent => <Pressable key={agent.id} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(`b:${agent.id}`), disabled: busy }} disabled={busy} onPress={() => onToggle(`b:${agent.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
    <BaarasseurAvatar b={agent} size={40} /><View style={{ flex: 1 }}><Text style={{ color: colors.label, fontSize: 16 }}>{agent.name}</Text><Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>{agent.role}</Text></View><Image source={picked.has(`b:${agent.id}`) ? 'sf:checkmark.circle.fill' : 'sf:circle'} style={{ width: 24, height: 24 }} tintColor={picked.has(`b:${agent.id}`) ? colors.accent : colors.tertiaryLabel} />
  </Pressable>)}</View>;
}
