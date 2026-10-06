import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the few pieces the phone's screens share, as the
// validated mobile mockup draws them: the segmented control, a list row, an
// empty state and a round icon button.

export function Segmented<T extends string>({ items, value, onChange }: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.secondaryBackground, borderRadius: 10, padding: 3, gap: 2, marginHorizontal: 16, marginBottom: 8 }}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
              onChange(it.value);
            }}
            style={{ flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.background : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: on ? '600' : '400', color: on ? colors.label : colors.secondaryLabel }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ title, subtitle, right, leading, onPress, onLongPress, bold }: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  leading?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  bold?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, minHeight: 52,
        backgroundColor: pressed && onPress ? colors.secondaryBackground : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: bold ? '700' : '500', color: colors.label }}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, color: colors.secondaryLabel }}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Separator({ inset = 16 }: { inset?: number }) {
  const colors = useColors();
  return <View style={{ height: 0.5, marginLeft: inset, backgroundColor: colors.separator }} />;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32, marginTop: 48 }}>
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.label, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ fontSize: 15, textAlign: 'center', lineHeight: 20, color: colors.tertiaryLabel }}>{text}</Text> : null}
    </View>
  );
}

export function IconButton({ icon, label, onPress, filled }: { icon: string; label: string; onPress: () => void; filled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? colors.accent : 'transparent' }}>
      <Image source={icon} style={{ width: 20, height: 20 }} tintColor={filled ? colors.onAccent : colors.accent} />
    </Pressable>
  );
}

/** « 09:12 » today, « 5 oct. » before. */
export function when(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** « Awa Traoré <awa@…> » → « Awa Traoré ». */
export function senderName(from: string | undefined): string {
  if (!from) return '';
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(from);
  return (m ? m[1] : from).trim();
}
