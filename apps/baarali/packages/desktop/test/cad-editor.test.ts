import { describe, expect, it } from 'vitest';
import { cadEditorRequest, loadCadEditor } from '../assets/motion/cad-editor-client.js';
import { cadEditorPage } from '../assets/motion/cad-editor-page.js';

describe('interactive CAD host', () => {
  it('binds a parameter request to the opened project rather than the iframe path', () => {
    const message = { type: 'baarali-cad', action: 'apply', mode: 'parameters', project: '../private', parameters: { width: 30 } };
    expect(cadEditorRequest(message,'motion/model-3d-abc')).toEqual({ tool: 'cad_parameters',input: { project: 'motion/model-3d-abc',parameters: { width: 30 } } });
    expect(cadEditorRequest(message,'../private')).toBeNull();
  });
  it('opens old CAD projects with their actual embedded mesh and parameters', async () => {
    const files: Record<string,string> = { 'cad.json': JSON.stringify({ version:'2.9',title:'Pièce',format:'16:9',duration:8 }), 'parameters.json':'{"width":24}', 'index.html':'<script id="cad-mesh" type="application/json">{"vertices":[[0,0,0]],"triangles":[]}</script>' };
    const state = await loadCadEditor('motion/old-model',async p => { const value=files[p.split('/').pop()!];if(value===undefined)throw Error('missing');return value; });
    expect(state.mode).toBe('parameters');expect(state.parameters).toEqual({width:24});expect(state.mesh?.vertices).toEqual([[0,0,0]]);
    const fresh = await loadCadEditor('',async () => {throw Error('unexpected read');});
    expect(fresh.scene?.parts).toHaveLength(1);
  });
  it('bundles its localized interface without network or workspace scripts', () => {
    const html=cadEditorPage(s=>s==='Create a variant'?'Créer une variante':s);
    expect(html).toContain('Créer une variante');expect(html).not.toMatch(/<script\s+src=/);expect(html).toContain("canvas.onpointermove");
  });
});
