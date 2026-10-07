import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import type { Member } from '@rowboat/spaces-protocol';

import { AgentMark, Face, RowboatFace } from '@/components/member-face';
import { BaarasseurAvatar, useBaarasseurs } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import { useSpacesAccount } from '@/lib/spaces/account';
import { SpacesClient } from '@/lib/spaces/client';
import { useColors } from '@/theme/colors';

// BAARALI(07/10/2026): a work group in one screen (mockup artboard 18,
// claude.ai/artifact/5hiVQMibobFRRitE7ictcw): a name, then tick who joins —
// your agents and the people of the org — and Create. Rowboat is always
// there (write @rowboat). A baarasseur ticked here joins the org as an agent
// the person owns, once (the instance keeps its key: core spaces/
// baarasseur-members.ts), then the group like anyone. Someone not in the org
// yet: a link to share after.

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
    [org, account],
  );

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
    client
      .listOrgMembers()
      .then(setRoster)
      .catch((err) => {
        setRoster([]);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [client]);

  const me = org?.memberId;
  const others = useMemo(() => (roster ?? []).filter((m) => m.id !== me), [roster, me]);
  const q = query.trim().toLowerCase();
  const shown = (m: { displayName: string }) => !q || m.displayName.toLowerCase().includes(q);
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
    if (!client || !org || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const space = await client.createSpace(name.trim());
      // The baarasseurs ticked: their member ids, joining the org first if they are not in it.
      const ids = [...picked].filter((id) => !id.startsWith('b:'));
      for (const b of chosenCrew) {
        const known = memberOf(b.name);
        if (known) ids.push(known.id);
        else if (rpc) {
          const { memberId } = (await rpc.call('spaces:enrollBaarasseur', { orgAddress: org.address, baarasseurId: b.id })) as { memberId: string };
          ids.push(memberId);
        }
      }
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
    }
  };

  const canCreate = Boolean(client && name.trim()) && !busy;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={{ fontSize: 17, color: colors.label }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () =>
            busy ? (
              <ActivityIndicator />
            ) : (
              <Pressable onPress={() => void create()} disabled={!canCreate} hitSlop={8}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: canCreate ? colors.label : colors.tertiaryLabel }}>Create</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* The name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
            <Image source="sf:number" style={{ width: 22, height: 22 }} contentFit="contain" tintColor={colors.secondaryLabel} />
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.tertiaryLabel}
            autoFocus
            maxLength={128}
            returnKeyType="done"
            style={{ flex: 1, height: 48, fontSize: 18, fontWeight: '600', color: colors.label, borderBottomWidth: 2, borderBottomColor: colors.accent }}
          />
        </View>

        {/* Several orgs: which one the group belongs to. */}
        {orgs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14 }}>
            {orgs.map((o) => {
              const on = o.address === org?.address;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => { tap(); setOrgAddress(o.address); }}
                  style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? colors.accent : colors.secondaryBackground }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: on ? colors.onAccent : colors.label }}>{o.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Who is in: you, Rowboat, and everyone ticked (a tap takes one out). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingTop: 16 }}>
          <Chip label="You" face={<Face name={org?.displayName ?? '?'} />} />
          <Chip label="Rowboat" face={<RowboatFace />} />
          {chosenCrew.map((b) => (
            <Chip key={b.id} label={b.name} face={<View><BaarasseurAvatar b={b} size={40} /><AgentMark size={40} /></View>} onRemove={() => toggle(`b:${b.id}`)} />
          ))}
          {chosen.map((m) => (
            <Chip key={m.id} label={m.displayName} face={<Face name={m.displayName} agent={m.kind === 'agent'} />} onRemove={() => toggle(m.id)} />
          ))}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, height: 38,
            paddingHorizontal: 12, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.secondaryBackground,
          }}
        >
          <Image source="sf:magnifyingglass" style={{ width: 15, height: 15 }} contentFit="contain" tintColor={colors.tertiaryLabel} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find an agent or a person"
            placeholderTextColor={colors.tertiaryLabel}
            style={{ flex: 1, fontSize: 15, color: colors.label }}
          />
        </View>

        {error ? <Text selectable style={{ fontSize: 13, color: colors.destructive, paddingHorizontal: 16, paddingTop: 12 }}>{error}</Text> : null}

        <Section title="Your agents" />
        {shown({ displayName: 'Rowboat' }) ? (
          <PickRow face={<RowboatFace />} name="Rowboat" detail="Always in your groups: write @rowboat" state="always" />
        ) : null}
        {mine.filter(shown).map((m) => (
          <PickRow key={m.id} face={<Face name={m.displayName} agent />} name={m.displayName} state={picked.has(m.id) ? 'on' : 'off'} onPress={() => toggle(m.id)} />
        ))}
        {pairing
          ? crew.filter((b) => shown({ displayName: b.name })).map((b) => (
              <PickRow
                key={b.id}
                face={<View><BaarasseurAvatar b={b} size={40} /><AgentMark size={40} /></View>}
                name={b.name}
                detail={b.role}
                state={picked.has(`b:${b.id}`) ? 'on' : 'off'}
                onPress={() => toggle(`b:${b.id}`)}
              />
            ))
          : null}

        {roster === null ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}

        {orgAgents.some(shown) ? <Section title={`Agents of ${org?.name ?? ''}`} /> : null}
        {orgAgents.filter(shown).map((m) => (
          <PickRow key={m.id} face={<Face name={m.displayName} agent />} name={m.displayName} state={picked.has(m.id) ? 'on' : 'off'} onPress={() => toggle(m.id)} />
        ))}

        {roster !== null ? <Section title={`People of ${org?.name ?? ''}`} /> : null}
        {people.filter(shown).map((m) => (
          <PickRow key={m.id} face={<Face name={m.displayName} />} name={m.displayName} state={picked.has(m.id) ? 'on' : 'off'} onPress={() => toggle(m.id)} />
        ))}
        {roster !== null && people.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.tertiaryLabel, paddingHorizontal: 16, paddingVertical: 6 }}>Nobody else in this org yet.</Text>
        ) : null}

        {/* Someone outside the org: a link, shared once the group exists. */}
        <PickRow
          face={
            <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Image source="sf:link" style={{ width: 16, height: 16 }} contentFit="contain" tintColor={colors.accent} />
            </View>
          }
          name="Invite someone else"
          detail="A link to share, once the group is created"
          state={invite ? 'on' : 'off'}
          onPress={() => { tap(); setInvite((on) => !on); }}
        />
      </ScrollView>
    </>
  );
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
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.separator }} />
      )}
    </Pressable>
  );
}
