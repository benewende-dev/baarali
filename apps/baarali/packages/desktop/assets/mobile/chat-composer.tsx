import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColors } from '@/theme/colors';
import { DOCUMENT_TYPES, type ComposerAttachment } from '@/lib/composer-attachments';
import { useConnection } from '@/lib/connection';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { useWebScreen } from '@/components/baarali-web-pages';

/** The browser's field: one line, up to about ten before it scrolls. */
const WEB_MIN = 24;
const WEB_MAX = 240;

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
export function ChatComposer({ draft, onChange, placeholder, files, onRemove, onAttach, picking, busy, onSend, onStop, onVoice, voiceLabel, voiceActive, onTalk, leading, extra, inputRef, embedded = false, menu, chips, onAttachType, onInsert, onFiles, menuBelow = false }: {
  draft: string; onChange: (text: string) => void; placeholder: string; files: ComposerAttachment[];
  onRemove: (id: string) => void; onAttach: () => void; picking?: boolean; busy?: boolean;
  onSend: () => void; onStop?: () => void; onVoice?: () => void; voiceLabel?: string; voiceActive?: boolean; onTalk?: () => void;
  leading?: ReactNode; extra?: ReactNode; inputRef?: Ref<TextInput>; embedded?: boolean;
  /** In the browser, what the « + » opens after « Add files », as the desktop's menu. */
  menu?: ComposerMenuItem[];
  /** In the browser, what is switched on (web search), each with its ×. */
  chips?: Array<{ icon: string; label: string; onClear: () => void }>;
  /** In the browser: a kind of file to pick (images, documents, any). */
  onAttachType?: (type: string | string[]) => void;
  /** In the browser: words put into the field, a note cited (« @knowledge/… »). */
  onInsert?: (text: string) => void;
  /** In the browser: files dropped on the composer or pasted into it. */
  onFiles?: (files: Array<Blob & { name?: string }>) => void;
  /** The « + » menu opens under the composer (high on its page, as on Code). */
  menuBelow?: boolean;
}) {
  const colors = useColors();
  const web = useWebScreen() && !!menu;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const box = useRef<View>(null);
  // BAARALI(09/11/2026): in the browser, as on the desktop, a file dropped on the composer or pasted into it is attached.
  useEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (!web || !onFiles || !el?.addEventListener) return;
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => { if (has(e)) { e.preventDefault(); setDragging(true); } };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); setDragging(false); onFiles(Array.from(e.dataTransfer?.files ?? [])); };
    const paste = (e: ClipboardEvent) => { const list = Array.from(e.clipboardData?.files ?? []); if (list.length) { e.preventDefault(); onFiles(list); } };
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop); el.addEventListener('paste', paste);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); el.removeEventListener('paste', paste); };
  }, [web, onFiles]);
  // The menu closes on a click elsewhere or on Escape, as the desktop's.
  useEffect(() => {
    if (!web || !menuOpen || typeof document === 'undefined') return;
    const el = box.current as unknown as HTMLElement | null;
    const away = (e: MouseEvent) => { if (el && !el.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [web, menuOpen]);
  // BAARALI(09/11/2026): in the browser the field grows with the text, as Claude Code's: one line to start, up to about ten, then it scrolls.
  const field = useRef<TextInput | null>(null);
  const [height, setHeight] = useState(WEB_MIN);
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = field.current as unknown as HTMLTextAreaElement | null;
    if (!el || typeof el.scrollHeight !== 'number') return;
    const was = el.style.height;
    el.style.height = '0px';
    const next = Math.min(WEB_MAX, Math.max(WEB_MIN, el.scrollHeight));
    el.style.height = was;
    setHeight(next);
  }, [draft]);
  const setRefs = (node: TextInput | null) => {
    field.current = node;
    if (typeof inputRef === 'function') inputRef(node);
    else if (inputRef && typeof inputRef === 'object') (inputRef as { current: TextInput | null }).current = node;
  };
  const pickKind = (type: string | string[]) => (onAttachType ? onAttachType(type) : onAttach());
  return <View ref={box} style={{ padding: embedded ? 0 : 12, gap: web ? 6 : 8, borderRadius: 22, borderCurve: 'continuous', borderWidth: embedded ? 0 : 0.5, borderColor: colors.separator, backgroundColor: colors.background, ...(dragging ? ({ outlineStyle: 'dashed', outlineWidth: 2, outlineColor: colors.secondaryLabel, outlineOffset: 6 } as object) : {}) }}>
    <AttachmentChips files={files} onRemove={onRemove} disabled={busy} />
    <TextInput ref={setRefs} value={draft} onChangeText={onChange} editable={!busy} multiline accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={colors.tertiaryLabel}
      // BAARALI(08/11/2026): in the browser, Enter sends and Shift+Enter starts a new line, as on claude.ai.
      onKeyPress={Platform.OS === 'web' ? (e) => {
        const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
        if (key.key !== 'Enter' || key.shiftKey || key.isComposing) return;
        e.preventDefault();
        if (!busy && !picking && !voiceActive && (draft.trim() || files.length)) onSend();
      } : undefined}
      style={[{ fontSize: 16, color: colors.label, minHeight: 36, maxHeight: 120, paddingHorizontal: 2, paddingVertical: 4 }, Platform.OS === 'web' ? ({ outlineStyle: 'none', minHeight: WEB_MIN, maxHeight: WEB_MAX, height, fontSize: 15, lineHeight: 22, paddingVertical: 1, resize: 'none', overflowY: height >= WEB_MAX ? 'auto' : 'hidden' } as object) : null]} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ComposerButton icon="sf:plus" label={web ? 'Add files and more' : 'Add files'} onPress={web ? () => setMenuOpen((v) => !v) : onAttach} disabled={busy || picking} active={web && menuOpen} />
      {web ? (chips ?? []).map((c) => <Chip key={c.label} {...c} />) : leading}
      <View style={{ flex: 1 }} />
      {web ? leading : null}
      {onVoice && <ComposerButton icon={voiceActive ? 'sf:stop.fill' : 'sf:mic'} label={voiceLabel ?? 'Dictate a message'} onPress={onVoice} disabled={busy} active={voiceActive} />}
      {onTalk && web && !busy && !voiceActive && !draft.trim() && !files.length ? <ComposerButton icon="sf:waveform" label="Talk with Baarali" onPress={onTalk} primary />
      : onTalk && !busy && !voiceActive && !draft.trim() && !files.length ? <Pressable accessibilityRole="button" accessibilityLabel={translate('Talk with Baarali')} onPress={onTalk}
          style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.label, opacity: pressed ? 0.7 : 1 })}>
          <Image source="sf:waveform" style={{ width: 16, height: 16 }} tintColor={colors.background} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.background }}>{translate('Talk')}</Text>
        </Pressable>
      : busy && onStop ? <ComposerButton icon="sf:stop.fill" label="Stop" onPress={onStop} primary />
        : <ComposerButton icon="sf:arrow.up" label={busy ? 'Sending…' : 'Send'} onPress={onSend} disabled={busy || picking || voiceActive || (!draft.trim() && !files.length)} primary />}
    </View>
    {extra}
    {web && menuOpen ? <ComposerMenu below={menuBelow} onClose={() => setMenuOpen(false)} onInsert={onInsert} groups={[
      [{ icon: 'sf:photo', label: 'Images', onPress: () => pickKind('image/*') },
        { icon: 'sf:doc.text', label: 'Documents', onPress: () => pickKind(DOCUMENT_TYPES) },
        { icon: 'sf:paperclip', label: 'Files', onPress: () => pickKind('*/*') }],
      [{ icon: 'sf:link', label: 'Connectors', onPress: () => router.push('/connect') }],
      menu ?? [],
    ]} /> : null}
  </View>;
}

export type ComposerMenuItem = { icon: string; label: string; onPress: () => void; active?: boolean; more?: boolean; detail?: string; raw?: boolean };

/** The « + » menu in the browser, as the desktop's: images, documents, files and a note to cite; the connectors; then the switches with their tick. */
function ComposerMenu({ groups, onClose, onInsert, below }: { groups: ComposerMenuItem[][]; onClose: () => void; onInsert?: (text: string) => void; below?: boolean }) {
  const colors = useColors();
  const [notes, setNotes] = useState(false);
  const shown = groups.filter((g) => g.length);
  return <View style={{ position: 'absolute', left: 0, ...(below ? { top: '100%', marginTop: 8 } : { bottom: '100%', marginBottom: 8 }), zIndex: 30, width: notes ? 340 : 260, padding: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.background, ...({ boxShadow: '0 8px 28px rgba(0,0,0,0.18)' } as object) }}>
    {notes && onInsert ? <NotePicker onBack={() => setNotes(false)} onPick={(path) => { onInsert(`@${path} `); onClose(); }} /> : shown.map((group, i) => <View key={i}>
      {i > 0 ? <View style={{ height: 1, marginVertical: 4, marginHorizontal: 6, backgroundColor: colors.separator }} /> : null}
      {group.map((item) => <MenuRow key={item.label} item={item} onDone={onClose} />)}
      {i === 0 && onInsert ? <MenuRow item={{ icon: 'sf:books.vertical', label: 'Notes', onPress: () => setNotes(true), more: true }} onDone={() => {}} /> : null}
    </View>)}
  </View>;
}

/** Cite a note of the Library: the agent reads it with the message. */
function NotePicker({ onBack, onPick }: { onBack: () => void; onPick: (path: string) => void }) {
  const colors = useColors();
  const { rpc } = useConnection();
  const [all, setAll] = useState<Array<{ name: string; path: string }> | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!rpc) return;
    rpc.call('workspace:readdir', { path: 'knowledge', opts: { recursive: true } })
      .then((list) => setAll(list.filter((e) => e.kind === 'file' && e.name.endsWith('.md')).map((e) => ({ name: e.name.replace(/\.md$/, ''), path: e.path }))))
      .catch(() => setAll([]));
  }, [rpc]);
  const found = useMemo(() => (all ?? []).filter((n) => !q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase()) || n.path.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40), [all, q]);
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, height: 34 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={translate('Back')} onPress={onBack} hitSlop={6} style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
        <Image source="sf:chevron.left" style={{ width: 13, height: 13 }} tintColor={colors.secondaryLabel} />
      </Pressable>
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder={translate('Search notes')} placeholderTextColor={colors.tertiaryLabel}
        style={{ flex: 1, fontSize: 14, color: colors.label, ...({ outlineStyle: 'none' } as object) }} />
    </View>
    <View style={{ height: 1, backgroundColor: colors.separator }} />
    <ScrollView style={{ maxHeight: 280 }}>
      {all === null ? <Text style={{ padding: 10, fontSize: 13, color: colors.secondaryLabel }}>{translate('Loading…')}</Text>
        : found.length === 0 ? <Text style={{ padding: 10, fontSize: 13, color: colors.secondaryLabel }}>{translate('No notes found.')}</Text>
          : found.map((n) => <MenuRow key={n.path} item={{ icon: 'sf:doc.text', label: n.name, detail: n.path.replace(/^knowledge\//, '').replace(/\/[^/]*$/, ''), onPress: () => onPick(n.path), raw: true }} onDone={() => {}} />)}
    </ScrollView>
  </View>;
}

function MenuRow({ item, onDone }: { item: ComposerMenuItem; onDone: () => void }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return <Pressable accessibilityRole="menuitem" accessibilityState={{ checked: item.active }} onPress={() => { item.onPress(); onDone(); }} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 9, backgroundColor: hover ? colors.secondaryBackground : 'transparent' }}>
    <Image source={item.icon} style={{ width: 16, height: 16 }} tintColor={colors.label} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 14, color: colors.label }}>{item.raw ? item.label : translate(item.label)}</Text>
      {item.detail ? <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.tertiaryLabel }}>{item.detail}</Text> : null}
    </View>
    {item.active ? <Image source="sf:checkmark" style={{ width: 14, height: 14 }} tintColor={colors.label} /> : null}
    {item.more ? <Image source="sf:chevron.right" style={{ width: 12, height: 12 }} tintColor={colors.tertiaryLabel} /> : null}
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
