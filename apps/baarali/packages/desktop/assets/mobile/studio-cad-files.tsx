import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useConnection } from '@/lib/connection';
import { shareFile, useWorkspaceFiles } from '@/lib/motion';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(13/10/2026): CAD files live beside the Motion exports, so the
// phone can use the same real STEP/STL/GLB/SVG files as the Mac.
export function StudioCadFiles({ project }: { project: string }) {
  const { rpc } = useConnection();
  const { url, headers } = useWorkspaceFiles();
  const colors = useColors();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setAvailable(false);
    if (rpc) void rpc.call('workspace:readFile', { path: `${project}/cad.json`, encoding: 'utf8' }).then(result => {
      const meta = JSON.parse(result.data);
      if (alive) setAvailable(typeof meta?.version === 'string');
    }).catch(() => {});
    return () => { alive = false; };
  }, [rpc, project]);
  if (!available) return null;
  const share = async (extension: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const file = `${project}/exports/model.${extension}`;
      await shareFile(url(file), headers, `model.${extension}`);
    } catch { Alert.alert(translate('Unable to share the file'), translate('Please try again in a moment.')); }
    finally { setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ flex: 1, height: 40, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2c2c2e' }}>
      <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>{translate('3D files')}</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 24, gap: 14 }}>
        <Text style={{ color: colors.label, fontSize: 22, fontWeight: '600' }}>{translate('3D files')}</Text>
        <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>{translate('Choose a format to share or save.')}</Text>
        {['step', 'stl', 'glb', 'svg'].map(extension => <Pressable key={extension} accessibilityRole="button" disabled={busy} onPress={() => void share(extension)} style={{ padding: 18, backgroundColor: colors.secondaryBackground, borderRadius: 14, opacity: busy ? .5 : 1 }}>
          <Text style={{ color: colors.label, fontSize: 17, fontWeight: '600' }}>{extension.toUpperCase()}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setOpen(false)} style={{ padding: 18, alignItems: 'center' }}><Text style={{ color: colors.label, fontSize: 16 }}>{translate('Close')}</Text></Pressable>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}
