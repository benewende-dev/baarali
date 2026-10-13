import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/theme/colors';

// BAARALI(12/10/2026): messages and shared files are explicit destinations
// in the approved space layout; the existing routes own their live data.
export function SpaceTabs({ selected, onMessages, onFiles }: { selected: 'messages' | 'files'; onMessages: () => void; onFiles: () => void }) {
  const colors = useColors();
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
    {[{ id: 'messages', label: 'Messages', onPress: onMessages }, { id: 'files', label: 'Files', onPress: onFiles }].map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: selected === tab.id }} onPress={tab.onPress}
      style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: selected === tab.id ? colors.label : colors.secondaryBackground }}>
      <Text style={{ fontSize: 14, color: selected === tab.id ? colors.background : colors.secondaryLabel }}>{tab.label}</Text>
    </Pressable>)}
  </View>;
}
