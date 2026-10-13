import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { baarasseurs, type workspace } from '@x/shared';
import type { z } from 'zod';
import { BaaraliMark } from './baarali-mark';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

type Entry = z.infer<typeof workspace.DirEntry>;
const ROOTS = [
  { path: 'knowledge', label: 'Library' },
  { path: 'Attachments', label: 'Attachments' },
  { path: 'Projects', label: 'Projects' },
  { path: 'baarasseurs', label: 'Agent documents' },
];

// BAARALI(12/10/2026): mobile agents can reference existing workspace files
// in the same documents field as desktop. Removing a reference never deletes
// a shared file; only the agent profile changes when the user saves it.
export function AgentDocuments({ documents, onChange }: { documents: string[]; onChange: (paths: string[]) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rpc } = useConnection();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open || !folder) { setLoading(false); setError(false); return; }
    if (!rpc) { setLoading(false); setError(true); return; }
    let alive = true;
    setLoading(true); setEntries([]); setError(false);
    void rpc.call('workspace:exists', { path: folder })
      .then(result => result.exists ? rpc.call('workspace:readdir', { path: folder, opts: { recursive: false } }) : [])
      .then(items => { if (alive) setEntries([...items].sort((a, b) => a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'dir' ? -1 : 1)); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, folder, rpc, retry]);

  const choose = (entry: Entry) => {
    if (entry.kind === 'dir') { setFolder(entry.path); return; }
    if (documents.includes(entry.path)) onChange(documents.filter(path => path !== entry.path));
    else if (documents.length < baarasseurs.DOCUMENTS_LIMIT) onChange([...documents, entry.path]);
  };

  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>Its documents</Text>
      <Pressable accessibilityRole="button" disabled={!rpc} onPress={() => { setFolder(null); setOpen(true); }} style={{ minHeight: 36, justifyContent: 'center', opacity: rpc ? 1 : 0.5 }}>
        <Text style={{ fontSize: 14, color: colors.accent }}>Add documents</Text>
      </Pressable>
    </View>
    {documents.map(path => <View key={path} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, backgroundColor: colors.background }}>
      <Image source="sf:doc.text" style={{ width: 18, height: 18 }} tintColor={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: colors.label }}>{path.split('/').pop()}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.secondaryLabel }}>{path}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${path.split('/').pop()}`} onPress={() => onChange(documents.filter(item => item !== path))} style={{ minHeight: 44, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Image source="sf:xmark" style={{ width: 13, height: 13 }} tintColor={colors.secondaryLabel} />
      </Pressable>
    </View>)}
    <Text style={{ fontSize: 12, lineHeight: 17, color: colors.secondaryLabel }}>Choose files already in your workspace. They remain shared with your desktop.</Text>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {folder && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setFolder(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : null)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Image source="sf:chevron.left" style={{ width: 16, height: 16 }} tintColor={colors.accent} />
          </Pressable>}
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.label }}>Agent documents</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 16, color: colors.accent }}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 8 }}>
          {folder ? <Text style={{ fontSize: 12, color: colors.secondaryLabel, marginBottom: 8 }}>{folder}</Text> : null}
          {loading ? <View style={{ alignItems: 'center', padding: 24 }} accessible accessibilityLabel="Loading…"><BaaraliMark size={40} motion="loading" /></View> : error ? <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 14, color: colors.secondaryLabel }}>Could not load files. Try again.</Text>
            <Pressable accessibilityRole="button" onPress={() => setRetry(retry + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Retry</Text></Pressable>
          </View> : !folder ? ROOTS.map(item => <Pressable key={item.path} accessibilityRole="button" onPress={() => setFolder(item.path)} style={{ minHeight: 54, padding: 12, borderRadius: 13, backgroundColor: colors.secondaryBackground, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source="sf:folder" style={{ width: 20, height: 20 }} tintColor={colors.accent} /><Text style={{ flex: 1, fontSize: 16, color: colors.label }}>{item.label}</Text>
          </Pressable>) : entries.length === 0 ? <Text style={{ color: colors.secondaryLabel, paddingVertical: 20 }}>No files in this folder.</Text> : entries.map(entry => {
            const selected = documents.includes(entry.path);
            const full = entry.kind !== 'dir' && !selected && documents.length >= baarasseurs.DOCUMENTS_LIMIT;
            return <Pressable key={entry.path} accessibilityRole={entry.kind === 'dir' ? 'button' : 'checkbox'} accessibilityState={entry.kind === 'dir' ? undefined : { checked: selected, disabled: full }} disabled={full} onPress={() => choose(entry)}
              style={{ minHeight: 54, padding: 12, borderRadius: 13, backgroundColor: colors.secondaryBackground, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: full ? 0.4 : 1 }}>
              <Image source={entry.kind === 'dir' ? 'sf:folder' : 'sf:doc.text'} style={{ width: 18, height: 18 }} tintColor={colors.accent} />
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, color: colors.label }}>{entry.path.split('/').pop()}</Text>
              {selected && <Image source="sf:checkmark" style={{ width: 17, height: 17 }} tintColor={colors.accent} />}
            </Pressable>;
          })}
          <Text style={{ fontSize: 12, color: colors.secondaryLabel, marginTop: 12 }}>{documents.length} / {baarasseurs.DOCUMENTS_LIMIT}</Text>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}
