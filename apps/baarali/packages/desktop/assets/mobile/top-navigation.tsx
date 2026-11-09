import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { useWebWide } from '@/components/baarali-web-frame';

// BAARALI(07/11/2026): Grok Bot hides everything (the founder's call): no
// sidebar and no Chat / Work switch any more. The places Work keeps (email,
// meetings, spaces, the gate) are reached from the settings, and this bar is
// only the way back to the home. The props stay so their screens are unchanged.
export function TopNavigation({ inset = true }: { mode?: 'chat' | 'work'; inset?: boolean }) {
  const colors = useColors();
  // BAARALI(09/11/2026): in the browser the sidebar is the way around (baarali-web-frame.tsx).
  const webWide = useWebWide();
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/home'));
  if (webWide) return null;
  return <SafeAreaView edges={inset ? ['top'] : []} style={{ backgroundColor: colors.background }}>
    <View style={{ height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={translate('Back')} onPress={back}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:chevron.left" style={{ width: 17, height: 17 }} tintColor={colors.label} />
      </Pressable>
    </View>
  </SafeAreaView>;
}
