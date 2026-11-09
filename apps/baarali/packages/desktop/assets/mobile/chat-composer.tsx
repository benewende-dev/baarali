import { useState, type ReactNode, type Ref } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColors } from '@/theme/colors';
import type { ComposerAttachment } from '@/lib/composer-attachments';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { useWebScreen } from '@/components/baarali-web-pages';

export function ComposerButton({ icon, label, onPress, disabled, active = false, primary = false }: {
  icon: string; label: string; onPress: () => void; disabled?: boolean; active?: boolean; primary?: boolean;
}) {
  const colors = useColors();
  // BAARALI(09/11/2026): in the browser, as the desktop's composer: quiet round buttons that light up under the pointer, the send one filled.
  const web = useWebScreen();
  const [hover, setHover] = useState(false);
  const size = web ? 34 : 38;
  const quiet = web && !primary && !active;
  return <Pressable accessibilityRole="button" accessibilityLabel={translate(label)} accessibilityState={{ disabled, selected: active }} onPress={onPress} disabled={disabled}
    onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} {...(web ? ({ title: translate(label) } as object) : {})}
    style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: quiet ? (hover ? colors.secondaryBackground : 'transparent') : primary || active ? colors.accent : colors.secondaryBackground, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
    <Image source={icon} style={{ width: web ? 17 : 18, height: web ? 17 : 18 }} tintColor={primary || active ? colors.onAccent : quiet ? colors.secondaryLabel : colors.label} />
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
// BAARALI(07/11/2026): `onTalk` puts « Talk » where « Send » is while nothing
// is written, as Grok's « Speak »: one tap from the home to a conversation.
export function ChatComposer({ draft, onChange, placeholder, files, onRemove, onAttach, picking, busy, onSend, onStop, onVoice, voiceLabel, voiceActive, onTalk, leading, extra, inputRef, embedded = false, menu, chips }: {
  draft: string; onChange: (text: string) => void; placeholder: string; files: ComposerAttachment[];
  onRemove: (id: string) => void; onAttach: () => void; picking?: boolean; busy?: boolean;
  onSend: () => void; onStop?: () => void; onVoice?: () => void; voiceLabel?: string; voiceActive?: boolean; onTalk?: () => void;
  leading?: ReactNode; extra?: ReactNode; inputRef?: Ref<TextInput>; embedded?: boolean;
  /** In the browser, what the « + » opens after « Add files », as the desktop's menu. */
  menu?: ComposerMenuItem[];
  /** In the browser, what is switched on (web search), each with its ×. */
  chips?: Array<{ icon: string; label: string; onClear: () => void }>;
}) {
  const colors = useColors();
  const web = useWebScreen() && !!menu;
  const [menuOpen, setMenuOpen] = useState(false);
  return <View style={{ padding: embedded ? 0 : 12, gap: 8, borderRadius: 22, borderCurve: 'continuous', borderWidth: embedded ? 0 : 0.5, borderColor: colors.separator, backgroundColor: colors.background }}>
    <AttachmentChips files={files} onRemove={onRemove} disabled={busy} />
    <TextInput ref={inputRef} value={draft} onChangeText={onChange} editable={!busy} multiline accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={colors.tertiaryLabel}
      // BAARALI(08/11/2026): in the browser, Enter sends and Shift+Enter starts a new line, as on claude.ai.
      onKeyPress={Platform.OS === 'web' ? (e) => {
        const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
        if (key.key !== 'Enter' || key.shiftKey || key.isComposing) return;
        e.preventDefault();
        if (!busy && !picking && !voiceActive && (draft.trim() || files.length)) onSend();
      } : undefined}
      style={[{ fontSize: 16, color: colors.label, minHeight: 36, maxHeight: 120, paddingHorizontal: 2, paddingVertical: 4 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ComposerButton icon="sf:plus" label={web ? 'Add files and more' : 'Add files'} onPress={web ? () => setMenuOpen((v) => !v) : onAttach} disabled={busy || picking} active={web && menuOpen} />
      {web ? (chips ?? []).map((c) => <Chip key={c.label} {...c} />) : leading}
      <View style={{ flex: 1 }} />
      {web ? leading : null}
      {onVoice && <ComposerButton icon={voiceActive ? 'sf:stop.fill' : 'sf:mic'} label={voiceLabel ?? 'Dictate a message'} onPress={onVoice} disabled={busy} active={voiceActive} />}
      {onTalk && !busy && !voiceActive && !draft.trim() && !files.length ? <Pressable accessibilityRole="button" accessibilityLabel={translate('Talk with Baarali')} onPress={onTalk}
          style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.label, opacity: pressed ? 0.7 : 1 })}>
          <Image source="sf:waveform" style={{ width: 16, height: 16 }} tintColor={colors.background} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.background }}>{translate('Talk')}</Text>
        </Pressable>
      : busy && onStop ? <ComposerButton icon="sf:stop.fill" label="Stop" onPress={onStop} primary />
        : <ComposerButton icon="sf:arrow.up" label={busy ? 'Sending…' : 'Send'} onPress={onSend} disabled={busy || picking || voiceActive || (!draft.trim() && !files.length)} primary />}
    </View>
    {extra}
    {web && menuOpen ? <ComposerMenu onClose={() => setMenuOpen(false)} items={[{ icon: 'sf:paperclip', label: 'Add files', onPress: onAttach }, ...(menu ?? [])]} /> : null}
  </View>;
}

export type ComposerMenuItem = { icon: string; label: string; onPress: () => void; active?: boolean };

/** The « + » menu in the browser: files first, then the switches with their tick. */
function ComposerMenu({ items, onClose }: { items: ComposerMenuItem[]; onClose: () => void }) {
  const colors = useColors();
  return <View style={{ position: 'absolute', left: 0, bottom: '100%', marginBottom: 8, zIndex: 30, minWidth: 240, padding: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, ...({ boxShadow: '0 8px 28px rgba(0,0,0,0.18)' } as object) }}>
    {items.map((item) => <MenuRow key={item.label} item={item} onDone={onClose} />)}
  </View>;
}

function MenuRow({ item, onDone }: { item: ComposerMenuItem; onDone: () => void }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return <Pressable accessibilityRole="menuitem" accessibilityState={{ checked: item.active }} onPress={() => { item.onPress(); onDone(); }} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 10, borderRadius: 9, backgroundColor: hover ? colors.secondaryBackground : 'transparent' }}>
    <Image source={item.icon} style={{ width: 16, height: 16 }} tintColor={colors.label} />
    <Text style={{ flex: 1, fontSize: 14, color: colors.label }}>{translate(item.label)}</Text>
    {item.active ? <Image source="sf:checkmark" style={{ width: 14, height: 14 }} tintColor={colors.label} /> : null}
  </Pressable>;
}

/** A switch that is on, as the desktop's « Web search » pill: its icon, its name, a × to turn it off. */
function Chip({ icon, label, onClear }: { icon: string; label: string; onClear: () => void }) {
  const colors = useColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 10, paddingRight: 4, borderRadius: 14, backgroundColor: colors.secondaryBackground }}>
    <Image source={icon} style={{ width: 13, height: 13 }} tintColor={colors.label} />
    <Text style={{ fontSize: 12.5, fontWeight: '500', color: colors.label }}>{translate(label)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${translate('Turn off')} ${translate(label)}`} onPress={onClear} hitSlop={4} style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Image source="sf:xmark" style={{ width: 10, height: 10 }} tintColor={colors.secondaryLabel} />
    </Pressable>
  </View>;
}
