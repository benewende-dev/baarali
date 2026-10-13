import type { ReactNode, Ref } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColors } from '@/theme/colors';
import type { ComposerAttachment } from '@/lib/composer-attachments';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

export function ComposerButton({ icon, label, onPress, disabled, active = false, primary = false }: {
  icon: string; label: string; onPress: () => void; disabled?: boolean; active?: boolean; primary?: boolean;
}) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={translate(label)} accessibilityState={{ disabled, selected: active }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: primary || active ? colors.accent : colors.secondaryBackground, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
    <Image source={icon} style={{ width: 18, height: 18 }} tintColor={primary || active ? colors.onAccent : colors.label} />
  </Pressable>;
}

export function AttachmentChips({ files, onRemove, disabled }: { files: ComposerAttachment[]; onRemove: (id: string) => void; disabled?: boolean }) {
  const colors = useColors();
  if (!files.length) return null;
  return <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
    {files.map(file => <View key={file.id} style={{ maxWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, backgroundColor: colors.secondaryBackground }}>
      <Image source={file.mime.startsWith('image/') ? file.uri : 'sf:doc'} contentFit="cover" style={{ width: 30, height: 30, borderRadius: 6 }} tintColor={file.mime.startsWith('image/') ? undefined : colors.secondaryLabel} />
      <View style={{ flexShrink: 1 }}><Text numberOfLines={1} style={{ fontSize: 12, color: colors.label }}>{file.name}</Text>
        <Text style={{ fontSize: 10, color: colors.secondaryLabel }}>{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${translate('Remove attachment')}: ${file.name}`} disabled={disabled} onPress={() => onRemove(file.id)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Image source="sf:xmark" style={{ width: 11, height: 11 }} tintColor={colors.secondaryLabel} />
      </Pressable>
    </View>)}
  </ScrollView>;
}

// BAARALI(12/10/2026): the same compact card lets home, agents and spaces
// expose useful actions without crowding the input or enlarging the model.
export function ChatComposer({ draft, onChange, placeholder, files, onRemove, onAttach, picking, busy, onSend, onStop, onVoice, voiceLabel, voiceActive, leading, extra, inputRef, embedded = false }: {
  draft: string; onChange: (text: string) => void; placeholder: string; files: ComposerAttachment[];
  onRemove: (id: string) => void; onAttach: () => void; picking?: boolean; busy?: boolean;
  onSend: () => void; onStop?: () => void; onVoice?: () => void; voiceLabel?: string; voiceActive?: boolean;
  leading?: ReactNode; extra?: ReactNode; inputRef?: Ref<TextInput>; embedded?: boolean;
}) {
  const colors = useColors();
  return <View style={{ padding: embedded ? 0 : 12, gap: 8, borderRadius: 22, borderCurve: 'continuous', borderWidth: embedded ? 0 : 0.5, borderColor: colors.separator, backgroundColor: colors.background }}>
    <AttachmentChips files={files} onRemove={onRemove} disabled={busy} />
    <TextInput ref={inputRef} value={draft} onChangeText={onChange} editable={!busy} multiline accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={colors.tertiaryLabel}
      style={{ fontSize: 16, color: colors.label, minHeight: 36, maxHeight: 120, paddingHorizontal: 2, paddingVertical: 4 }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ComposerButton icon="sf:plus" label="Add files" onPress={onAttach} disabled={busy || picking} />
      {leading}
      <View style={{ flex: 1 }} />
      {onVoice && <ComposerButton icon={voiceActive ? 'sf:stop.fill' : 'sf:mic'} label={voiceLabel ?? 'Dictate a message'} onPress={onVoice} disabled={busy} active={voiceActive} />}
      {busy && onStop ? <ComposerButton icon="sf:stop.fill" label="Stop" onPress={onStop} primary />
        : <ComposerButton icon="sf:arrow.up" label={busy ? 'Sending…' : 'Send'} onPress={onSend} disabled={busy || picking || voiceActive || (!draft.trim() && !files.length)} primary />}
    </View>
    {extra}
  </View>;
}
