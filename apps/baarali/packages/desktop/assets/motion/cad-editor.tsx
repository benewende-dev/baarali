import { useEffect, useMemo, useRef, useState } from 'react';
import { useFileViewerSource } from './file-viewer-source';
import { useTheme } from '@/contexts/theme-context';
import { cadEditorPage } from './cad-editor-page';
import { cadEditorRequest, loadCadEditor, type CadEditorState } from './cad-editor-client';

export function CadEditor({ project = '', onProject }: { project?: string; onProject: (project: string) => void }) {
  const source = useFileViewerSource();
  const { resolvedTheme } = useTheme();
  const [available, setAvailable] = useState(!project);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CadEditorState | null>(null);
  const [error, setError] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const busy = useRef(false);
  const navigate = useRef(onProject); navigate.current = onProject;
  const page = useMemo(() => cadEditorPage(key => (window as { __baaraliText?: (s: string) => string }).__baaraliText?.(key) ?? key, document.documentElement.classList.contains('dark') ? 'dark' : 'light'), [open]);
  useEffect(() => {
    if (open) frame.current?.contentWindow?.postMessage({ type: 'baarali-cad-theme', scheme: resolvedTheme }, '*');
  }, [open, state, resolvedTheme]);
  useEffect(() => {
    let alive = true; setAvailable(!project);
    if (project) void source.read({ path: `${project}/cad.json`, encoding: 'utf8' }).then(r => {
      if (alive) setAvailable(typeof JSON.parse(r.data)?.version === 'string');
    }).catch(() => {});
    return () => { alive = false; };
  }, [project, source]);
  useEffect(() => {
    if (!open) return;
    let alive = true; setState(null); setError(false);
    void loadCadEditor(project, async path => (await source.read({ path, encoding: 'utf8' })).data).then(state => { if (alive) setState(state); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [open, project, source]);
  useEffect(() => {
    if (!open || !state) return;
    let alive = true;
    const init = () => frame.current?.contentWindow?.postMessage({ type: 'baarali-cad-init', data: state }, '*');
    const handle = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'baarali-cad') return;
      if (event.data.action === 'ready') { init(); return; }
      if (event.data.action === 'close' && !busy.current) { setOpen(false); return; }
      if (event.data.action !== 'apply' || busy.current || source.readOnly || !source.workspace) return;
      const request = cadEditorRequest(event.data, project);
      const fail = () => frame.current?.contentWindow?.postMessage({ type: 'baarali-cad-error' }, '*');
      if (!request) { fail(); return; }
      busy.current = true;
      try {
        const { result } = await window.ipc.invoke('mcp:executeTool', { serverName: 'baarali-motion', toolName: request.tool, input: request.input });
        const answer = result as { isError?: boolean; structuredContent?: { cad?: { project?: string } } } | null;
        const next = answer?.structuredContent?.cad?.project;
        if (!answer?.isError && next && /^motion\/[a-zA-Z0-9_-]+$/.test(next)) {
          if (alive) { setOpen(false); navigate.current(next); }
        } else if (alive) fail();
      } catch { if (alive) fail(); }
      finally { busy.current = false; }
    };
    window.addEventListener('message', handle); init();
    return () => { alive = false; window.removeEventListener('message', handle); };
  }, [open, state, project, source]);
  if (!available || source.readOnly || !source.workspace) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-accent">{project ? 'Edit 3D model' : 'New 3D model'}</button>
    {open && <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="3D modeler">
      {state ? <iframe ref={frame} srcDoc={page} sandbox="allow-scripts" title="3D modeler" className="h-full w-full border-0" /> : <div className="m-auto flex flex-col items-center gap-3"><p>{error ? 'Could not open the model' : 'Loading…'}</p><button type="button" onClick={() => setOpen(false)}>Close</button></div>}
    </div>}
  </>;
}
