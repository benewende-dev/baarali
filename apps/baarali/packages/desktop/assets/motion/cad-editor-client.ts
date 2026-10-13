import { defaultCadPart, validCadScene, type CadScene } from './cad-scene.js';

export interface CadEditorState {
  mode: 'scene' | 'parameters'; project: string; title: string; caption: string;
  format: string; duration: number; scene?: CadScene; parameters?: Record<string, unknown>;
  mesh?: { vertices: number[][]; triangles: number[][] };
}
type Read = (path: string) => Promise<string>;
export async function loadCadEditor(project: string, read: Read): Promise<CadEditorState> {
  const fresh: CadEditorState = { mode: 'scene', project: '', title: '', caption: '', format: '1:1', duration: 8, scene: { version: 1, parts: [defaultCadPart()] } };
  if (!project) return fresh;
  if (!/^motion\/[a-zA-Z0-9_-]+$/.test(project)) throw new Error('Invalid CAD project');
  const meta = JSON.parse(await read(`${project}/cad.json`));
  const parameters = JSON.parse(await read(`${project}/parameters.json`));
  const state: CadEditorState = { ...fresh, mode: 'parameters', project, title: meta.title ?? '', caption: meta.caption ?? '', format: meta.format ?? '1:1', duration: meta.duration ?? 8, parameters };
  if (meta.editor === 'scene') {
    const scene: unknown = JSON.parse(await read(`${project}/scene.json`));
    if (!validCadScene(scene)) throw new Error('Invalid CAD scene');
    state.mode = 'scene'; state.scene = scene;
  }
  // 13/10/2026: pre-editor CAD variants still open using their embedded mesh.
  try { state.mesh = JSON.parse(await read(`${project}/cad-preview.json`)); }
  catch {
    const html = await read(`${project}/index.html`);
    const mesh = /<script id="cad-mesh" type="application\/json">([^<]+)<\/script>/.exec(html)?.[1];
    if (mesh) state.mesh = JSON.parse(mesh);
  }
  return state;
}

// The host binds the project itself. A bridge request cannot nominate a
// different workspace script or project, even if it imitates the editor.
export function cadEditorRequest(value: unknown, project: string): { tool: string; input: Record<string, unknown> } | null {
  const m = value as Record<string, unknown> | null;
  if (!m || m.type !== 'baarali-cad' || m.action !== 'apply') return null;
  if (m.mode === 'scene' && validCadScene(m.scene) && typeof m.title === 'string' && m.title.trim()
    && typeof m.duration === 'number' && Number.isFinite(m.duration) && m.duration >= 4 && m.duration <= 60
    && ['9:16','1:1','4:5','16:9'].includes(String(m.format))) {
    return { tool: 'cad_scene', input: { scene: m.scene, title: m.title.slice(0,120), caption: typeof m.caption === 'string' ? m.caption.slice(0,240) : '', duration: m.duration, format: m.format } };
  }
  if (m.mode === 'parameters' && /^motion\/[a-zA-Z0-9_-]+$/.test(project) && m.parameters && typeof m.parameters === 'object' && !Array.isArray(m.parameters) && JSON.stringify(m.parameters).length <= 8192) {
    return { tool: 'cad_parameters', input: { project, parameters: m.parameters } };
  }
  return null;
}
