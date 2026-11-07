import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ActionSheetIOS, Alert, Pressable, Text, View, useColorScheme } from 'react-native';
import { baarasseurs as shared } from '@x/shared';

import { BaaraliMark } from '@/components/baarali-mark';
import { AgentShape, adaptive, useLook } from '@/components/agent-shape';
import { BaarasseurAvatar, type Baarasseur } from '@/lib/baarasseurs';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(07/11/2026): Grok Bot's conversation header (the founder's call):
// whom you talk to in a pill in the middle, « … » on the right.

const profile = (b: Baarasseur | null) => b
  ? router.push({ pathname: '/baarasseurs/recruit', params: { id: b.id } })
  : router.push('/settings');

export function ChatTitle({ baarasseur }: { baarasseur: Baarasseur | null }) {
  const colors = useColors();
  const look = useLook();
  const dark = useColorScheme() === 'dark';
  return <Pressable accessibilityRole="button" accessibilityLabel={translate('View profile')} onPress={() => profile(baarasseur)}
    style={{ height: 44, paddingLeft: 6, paddingRight: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondaryBackground }}>
    {baarasseur ? <BaarasseurAvatar b={baarasseur} size={32} /> : look ? <AgentShape shape={look.shape} color={adaptive(look.color, dark)} size={32} /> : <BaaraliMark size={32} />}
    <Text numberOfLines={1} style={{ maxWidth: 180, fontSize: 17, fontWeight: '500', color: colors.label }}>{baarasseur?.name ?? 'Baarali'}</Text>
  </Pressable>;
}

export function ChatMenu({ baarasseur }: { baarasseur: Baarasseur | null }) {
  const colors = useColors();
  const fresh = () => router.replace({ pathname: '/chat', params: { id: '', agent: baarasseur ? shared.baarasseurAgentId(baarasseur.id) : undefined } });
  const choices = [
    { label: translate('View profile'), run: () => profile(baarasseur) },
    { label: translate('New conversation'), run: fresh },
    { label: translate('All conversations'), run: () => router.navigate('/(tabs)/home') },
  ];
  const open = () => {
    if (process.env.EXPO_OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...choices.map(c => c.label), translate('Cancel')], cancelButtonIndex: choices.length },
        index => choices[index]?.run());
    } else {
      Alert.alert(baarasseur?.name ?? 'Baarali', undefined, [...choices.map(c => ({ text: c.label, onPress: c.run })), { text: translate('Cancel'), style: 'cancel' }]);
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={translate('More')} onPress={open}
    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
    <Image source="sf:ellipsis" style={{ width: 18, height: 18 }} tintColor={colors.label} />
  </Pressable>;
}

/** The empty conversation with Baarali: its greeting the first time (home passes `first`), else a hint. */
export function BaaraliGreeting() {
  const colors = useColors();
  const { first } = useLocalSearchParams<{ first?: string }>();
  if (first !== '1') return <Text style={{ fontSize: 15, color: colors.tertiaryLabel }}>Ask anything to get started</Text>;
  return <View style={{ alignSelf: 'stretch', marginTop: 18, marginHorizontal: 24, padding: 14, borderRadius: 18, backgroundColor: colors.secondaryBackground }}>
    <Text style={{ fontSize: 16, lineHeight: 22, color: colors.label }}>Hello, I'm Baarali. Before we start, what should I call you?</Text>
  </View>;
}
