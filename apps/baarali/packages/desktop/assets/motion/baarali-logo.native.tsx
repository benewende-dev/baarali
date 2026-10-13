import { Image } from 'expo-image';
import { View } from 'react-native';
import { BaaraliMark } from './baarali-mark';
import { useColors } from '@/theme/colors';

// BAARALI(12/10/2026): the approved monochrome icon accompanies the original
// italic wordmark, including its blue i dot, on the mobile home screen.
export function BaaraliLogo() {
  const colors = useColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel="Baarali">
    <BaaraliMark motion="loading" size={32} />
    <Image source={colors.label === '#ffffff' ? require('../../assets/brand/wordmark-light.svg') : require('../../assets/brand/wordmark-dark.svg')}
      contentFit="contain" style={{ width: 104, height: 28 }} accessible={false} />
  </View>;
}
