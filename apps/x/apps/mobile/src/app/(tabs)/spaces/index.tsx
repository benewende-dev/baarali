import { Stack, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { BaaraliSignInView } from '@/components/baarali-sign-in-view';
import { JoinWithLink } from '@/components/join-with-link';
import { Face } from '@/components/member-face';
import { useSpacesAccount, type SpacesOrg } from '@/lib/spaces/account';
import { connectInstance, sendCode, SignInError, verifyCode, type SignInProblem } from '@/lib/baarali-sign-in';
import { useConnection } from '@/lib/connection';
import { SpacesClient } from '@/lib/spaces/client';
import type { Member, Space } from '@rowboat/spaces-protocol';
import { useColors } from '@/theme/colors';

// Spaces home: signed out → one sign-in button; signed in → the user's orgs as
// inset-grouped cards (iOS Settings shape): org identity header, hairline-
// separated space rows, account footer.
export default function SpacesScreen() {
  const account = useSpacesAccount();
  const colors = useColors();

  if (account.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (account.status === 'signedOut') return <SignIn />;
  return <OrgList />;
}

function SignIn() {
  const account = useSpacesAccount();
  const { pair } = useConnection();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Baarali (07/10/2026): signing in happens here, with no web page: the
  // email, then the code it receives. The browser stays for Google and Apple.
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const say = (err: unknown) => setError(err instanceof SignInError ? problemText(err.reason) : err instanceof Error ? err.message : String(err));

  const askCode = async () => {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter your email address.');
      return;
    }
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setCode('');
      setStep('code');
    } catch (err) {
      say(err);
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (typed = code) => {
    if (busy || !/^\d{6}$/.test(typed.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const session = await verifyCode(email, typed);
      await account.signInWithSession(session);
      // The same cloud instance as the person's Mac: their chats, here.
      try {
        const server = await connectInstance(session, Device.deviceName ?? 'iPhone');
        await pair({ url: server.url, token: server.key, name: 'Baarali' });
        if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/home');
      } catch (err) {
        // Signed in to Spaces all the same; the chats wait for the instance.
        say(err);
      }
    } catch (err) {
      say(err);
      if (err instanceof SignInError && err.reason === 'bad_code') setCode('');
    } finally {
      setBusy(false);
    }
  };

  const go = async () => {
    if (busy) return;
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setBusy(true);
    setError(null);
    try {
      await account.signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaaraliSignInView
      step={step} email={email} code={code} busy={busy} error={error}
      onEmail={value => { setEmail(value); setError(null); }}
      onCode={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
      onSend={() => void askCode()} onConfirm={() => void checkCode()}
      onChange={() => { setStep('email'); setCode(''); setError(null); }}
      onOther={() => void go()} onPair={() => router.push('/pairing')}
    />
  );
}


/** What went wrong, for the person. */
function problemText(problem: SignInProblem): string {
  switch (problem) {
    case 'bad_code':
      return 'That code isn’t right. Check it and try again.';
    case 'expired_code':
      return 'That code has expired. Send a new one.';
    case 'too_many':
      return 'Too many tries. Wait a minute, then send a new code.';
    case 'instances_full':
      return 'Early access is full for now: your chats will open as soon as a place frees up. Spaces already work.';
    case 'too_many_devices':
      return 'Too many devices on this account. Remove one in the Mac app’s settings, then sign in again.';
    case 'no_instance':
      return 'Your assistant can’t be reached right now. Spaces work; try again in a moment for your chats.';
    case 'network':
      return 'No connection. Check your internet and try again.';
    default:
      return 'Sign-in didn’t work. Try again.';
  }
}

function OrgList() {
  const account = useSpacesAccount();
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await account.refreshOrgs();
    setRefreshing(false);
  }, [account]);

  const who = account.orgs?.[0]?.displayName;

  return (
    <>
    {/* BAARALI(07/10/2026): a work group in one screen (mockup artboard 17). */}
    {account.orgs?.length ? (
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => {
                if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
                router.push('/spaces/new');
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.accent }}
            >
              <Image source="sf:plus" style={{ width: 13, height: 13 }} contentFit="contain" tintColor={colors.onAccent} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onAccent }}>New group</Text>
            </Pressable>
          ),
        }}
      />
    ) : null}
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 8, gap: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {account.orgsError ? (
        <Text selectable style={{ fontSize: 13, color: colors.destructive, paddingHorizontal: 16 }}>{account.orgsError}</Text>
      ) : null}
      {account.orgs === null && !account.orgsError ? <ActivityIndicator style={{ marginTop: 48 }} /> : null}
      {account.orgs?.map((org) => <OrgCard key={org.id} org={org} />)}
      {account.orgs?.length === 0 && !account.orgsError ? (
        <View style={{ alignItems: 'center', marginTop: 64, gap: 8 }}>
          <Image source="sf:person.2" style={{ width: 36, height: 36 }} tintColor={colors.tertiaryLabel} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.secondaryLabel }}>No orgs yet</Text>
          <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>Open an invite link to join one.</Text>
        </View>
      ) : null}

      {/* Account footer */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: colors.separator, paddingTop: 6 }}>
        {who ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Image source="sf:person.crop.circle" style={{ width: 20, height: 20 }} tintColor={colors.secondaryLabel} />
            <Text style={{ flex: 1, fontSize: 15, color: colors.secondaryLabel }}>{who}</Text>
          </View>
        ) : null}
        {who ? <View style={{ height: 1, marginLeft: 44, backgroundColor: colors.separator }} /> : null}
        <JoinWithLink />
        <View style={{ height: 1, marginLeft: 44, backgroundColor: colors.separator }} />
        <Pressable
          onPress={() => void account.signOut()}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Image source="sf:rectangle.portrait.and.arrow.right" style={{ width: 18, height: 18 }} tintColor={colors.destructive} />
          <Text style={{ fontSize: 15, color: colors.destructive }}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
    </>
  );
}

// Deterministic, muted org tile tint (same trick as message avatars).
const ORG_HUES = [211, 262, 174, 32, 340, 90];
function orgTint(id: string, dark: boolean): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${ORG_HUES[h % ORG_HUES.length]}, 50%, ${dark ? 34 : 40}%)`;
}

function OrgCard({ org }: { org: SpacesOrg }) {
  const account = useSpacesAccount();
  const colors = useColors();
  const dark = colors.background === '#000000';
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [members, setMembers] = useState<Map<string, Member[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(
    () => new SpacesClient({ baseUrl: `https://${org.address}`, token: (opts) => account.getAccessToken(opts) }),
    [org.address, account],
  );

  // Again on each visit: a group made from the phone, or elsewhere, shows.
  useFocusEffect(useCallback(() => {
    client
      .listSpaces()
      .then(async (list) => {
        setSpaces(list);
        // Member stacks per row — best-effort, rows render without them first.
        const loaded = await Promise.all(
          list.map(async (s) => [s.id, await client.listMembers(s.id).catch(() => [])] as const),
        );
        setMembers(new Map(loaded));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [client]));

  const [openingDm, setOpeningDm] = useState<string | null>(null);

  const openDm = async (m: Member) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setOpeningDm(m.id);
    try {
      const { space } = await client.openDirect(m.id);
      router.push({ pathname: '/spaces/chat', params: { org: org.address, space: space.id, title: m.displayName, me: org.memberId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningDm(null);
    }
  };

  const orgMembers = useMemo(() => {
    const seen = new Map<string, Member>();
    for (const list of members.values()) for (const m of list) if (!seen.has(m.id)) seen.set(m.id, m);
    return [...seen.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members]);

  return (
    <View style={{ gap: 4 }}>
      {/* Org identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View
          style={{
            width: 44, height: 44, borderRadius: 11, borderCurve: 'continuous',
            alignItems: 'center', justifyContent: 'center', backgroundColor: orgTint(org.id, dark),
          }}
        >
          <Text style={{ fontSize: 19, fontWeight: '700', color: '#ffffff' }}>
            {(org.name[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.label }}>{org.name}</Text>
          <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>
            {org.role === 'admin' ? 'Admin' : 'Member'}
            {spaces ? ` · ${spaces.length} ${spaces.length === 1 ? 'space' : 'spaces'}` : ''}
          </Text>
        </View>
      </View>

      {error ? <Text selectable style={{ fontSize: 13, color: colors.destructive, paddingHorizontal: 16, paddingBottom: 8 }}>{error}</Text> : null}
      {spaces === null && !error ? <ActivityIndicator style={{ alignSelf: 'center', marginVertical: 16 }} /> : null}

      {/* Spaces */}
      {spaces !== null ? <SectionLabel text="Spaces" /> : null}
      {spaces?.map((space) => (
        <Row
          key={space.id}
          onPress={() => {
            if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
            router.push({ pathname: '/spaces/chat', params: { org: org.address, space: space.id, title: space.name, me: org.memberId } });
          }}
        >
          <View style={{ width: 28, alignItems: 'center' }}>
            <Image source="sf:number" style={{ width: 17, height: 17 }} tintColor={colors.secondaryLabel} />
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.label }}>{space.name}</Text>
          {/* Who is in, people and agents (mockup artboard 17). */}
          <View style={{ flexDirection: 'row' }}>
            {(members.get(space.id) ?? []).slice(0, 4).map((m, i) => (
              <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -7, borderRadius: 12, borderWidth: 1.5, borderColor: colors.background }}>
                <Face name={m.displayName} agent={m.kind === 'agent'} size={22} />
              </View>
            ))}
          </View>
        </Row>
      ))}
      {spaces?.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.tertiaryLabel, paddingHorizontal: 16, paddingVertical: 4 }}>
          No spaces in this org yet.
        </Text>
      ) : null}

      {/* Direct messages: every other member is one tap from a DM (a DM is a
          `direct` space — openDirect is get-or-create, idempotent). */}
      {orgMembers.filter((m) => m.id !== org.memberId).length > 0 ? (
        <>
          <View style={{ height: 16 }} />
          <SectionLabel text="Direct messages" />
          {orgMembers.filter((m) => m.id !== org.memberId).map((m) => (
            <Row key={m.id} disabled={openingDm !== null} dimmed={openingDm !== null && openingDm !== m.id} onPress={() => void openDm(m)}>
              <View style={{ width: 28, alignItems: 'center' }}>
                <View
                  style={{
                    width: 26, height: 26, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: orgTint(m.id, dark),
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#ffffff' }}>
                    {(m.displayName[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.label }}>{m.displayName}</Text>
              {openingDm === m.id ? <ActivityIndicator size="small" /> : null}
            </Row>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Slack's quiet section label: small, weighty, inset with the row text. */
function SectionLabel({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.secondaryLabel, paddingHorizontal: 16, paddingBottom: 4 }}>
      {text}
    </Text>
  );
}

/** 44pt list row with an inset rounded pressed state — no chevrons, like Slack. */
function Row({ children, onPress, disabled, dimmed }: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  dimmed?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42,
        marginHorizontal: 8, paddingHorizontal: 8, borderRadius: 10, borderCurve: 'continuous',
        backgroundColor: pressed ? colors.secondaryBackground : 'transparent',
        opacity: dimmed ? 0.5 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
