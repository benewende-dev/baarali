import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { cadEditorPage } from '@/lib/cad-editor-page';
import { cadEditorRequest, loadCadEditor, type CadEditorState } from '@/lib/cad-editor-client';

export function StudioCadEditor({ project = '', onProject }: { project?: string; onProject: (project: string) => void }) {
  const { rpc } = useConnection(); const colors = useColors();
  const [available,setAvailable] = useState(!project), [open,setOpen] = useState(false);
  const [state,setState] = useState<CadEditorState | null>(null), [error,setError] = useState(false);
  const [busy,setBusy] = useState(false); const lock = useRef(false), web = useRef<WebView>(null);
  const page = useMemo(() => cadEditorPage(translate), [open]);
  useEffect(() => {
    if (open) web.current?.injectJavaScript(`window.__cadEditor?.theme(${JSON.stringify(colors.background === '#000000' ? 'dark' : 'light')});true;`);
  }, [open, state, colors.background]);
  useEffect(() => {
    let alive = true; setAvailable(!project);
    if (rpc && project) void rpc.call('workspace:readFile', { path: `${project}/cad.json`, encoding: 'utf8' }).then(r => { if (alive) setAvailable(typeof JSON.parse(r.data)?.version === 'string'); }).catch(() => {});
    return () => { alive = false; };
  }, [rpc,project]);
  useEffect(() => {
    if (!open || !rpc) return;
    let alive = true; setError(false); setState(null);
    void loadCadEditor(project, async path => (await rpc.call('workspace:readFile', { path, encoding: 'utf8' })).data).then(s => { if (alive) setState(s); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [open,rpc,project]);
  const inject = (script: string) => web.current?.injectJavaScript(`${script};true;`);
  const init = () => { if (state) inject(`window.__cadEditor?.init(${JSON.stringify(state).replace(/</g,'\\u003c')});window.__cadEditor?.theme(${JSON.stringify(colors.background === '#000000' ? 'dark' : 'light')})`); };
  if (!available || !rpc) return null;
  return <>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ minHeight: 44, borderRadius: 15, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}><Text style={{ color: colors.label, fontWeight: '600' }}>{translate(project ? 'Edit 3D model' : 'New 3D model')}</Text></Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => { if (!lock.current) setOpen(false); }}>
      <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {state ? <WebView ref={web} source={{ html: page }} originWhitelist={['about:blank']} scrollEnabled onLoadEnd={init} style={{ flex: 1, backgroundColor: colors.background }}
          onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith('data:text/html')}
          onMessage={async event => {
            let m: { type?: string; action?: string }; try { m = JSON.parse(event.nativeEvent.data); } catch { return; }
            if (m.type !== 'baarali-cad') return;
            if (m.action === 'ready') { init(); return; }
            if (m.action === 'close' && !lock.current) { setOpen(false); return; }
            if (m.action !== 'apply' || lock.current) return;
            const request = cadEditorRequest(m,project), fail = () => inject('window.__cadEditor?.error()');
            if (!request) { fail(); return; } lock.current = true; setBusy(true);
            try {
              const { result } = await rpc.call('mcp:executeTool', { serverName: 'baarali-motion', toolName: request.tool, input: request.input });
              const answer = result as { isError?: boolean; structuredContent?: { cad?: { project?: string } } } | null;
              const next = answer?.structuredContent?.cad?.project;
              if (!answer?.isError && next && /^motion\/[a-zA-Z0-9_-]+$/.test(next)) { setOpen(false); onProject(next); } else fail();
            } catch { fail(); } finally { lock.current = false; setBusy(false); }
          }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}><Text style={{ color: colors.label }}>{translate(error ? 'Could not open the model' : 'Loading…')}</Text><Pressable disabled={busy} onPress={() => setOpen(false)}><Text style={{ color: colors.accent }}>{translate('Close')}</Text></Pressable></View>}
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}
