import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useColors } from '@/theme/colors';

// The faces of Spaces members (Baarali, 07/10/2026, mockup artboards 17 and
// 18): the initial on a steady tint, and the agent mark at the corner of an
// agent, so people and agents tell apart at a glance.

// Muted, steady tints per name, as the message avatars do.
const HUES = [211, 262, 174, 32, 340, 90];
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/** A face: the initial, and the agent mark at its corner for an agent. */
export function Face({ name, agent = false, size = 40 }: { name: string; agent?: boolean; size?: number }) {
  const colors = useColors();
  const dark = colors.background === '#000000';
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `hsl(${hue(name)}, 50%, ${dark ? 34 : 40}%)` }}>
        <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: '#ffffff' }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
      </View>
      {agent ? <AgentMark size={size} /> : null}
    </View>
  );
}

export function AgentMark({ size }: { size: number }) {
  const colors = useColors();
  const s = Math.max(12, Math.round(size * 0.4));
  return (
    <View
      style={{
        position: 'absolute', right: -2, bottom: -2, width: s, height: s, borderRadius: s / 2,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent,
        borderWidth: 2, borderColor: colors.background,
      }}
    >
      <Image source="sf:sparkle" style={{ width: s * 0.5, height: s * 0.5 }} contentFit="contain" tintColor={colors.onAccent} />
    </View>
  );
}

export function RowboatFace({ size = 40 }: { size?: number }) {
  const colors = useColors();
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:sparkles" style={{ width: size * 0.45, height: size * 0.45 }} contentFit="contain" tintColor={colors.accent} />
      </View>
      <AgentMark size={size} />
    </View>
  );
}
