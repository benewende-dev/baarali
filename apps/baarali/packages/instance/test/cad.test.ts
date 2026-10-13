import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createCadTools, pythonCadRunner, validCadMesh, type CadRunner } from '../src/cad-mcp.js';
import { CAD_VIEWER_JS } from '../src/cad-viewer.js';
import { defaultCadPart, validCadScene } from '../src/cad-scene.js';
import { createMotionTools, checkComposition } from '../src/motion-mcp.js';
import { DEFAULT_BRAND } from '../src/motion-templates.js';

const folders: string[] = [];
const mesh = { vertices: [[-2,-1,0], [2,0,0], [0,2,3]], triangles: [[0,1,2]] };
async function setup(runner?: CadRunner) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-cad-test-')); folders.push(workDir);
  await fs.writeFile(path.join(workDir, 'model.py'), 'result = cq.Workplane("XY").box(parameters["width"], 12, 8)');
  return { workDir, cad: createCadTools({ workDir, readBrand: async () => DEFAULT_BRAND, runner }) };
}
const fixture: CadRunner = async (folder, health) => {
  if (!health) {
    await fs.writeFile(path.join(folder, 'mesh.json'), JSON.stringify(mesh));
    for (const extension of ['step','stl','glb','svg']) await fs.writeFile(path.join(folder, `model.${extension}`), 'fixture geometry');
  }
  return { ok: true, version: 'fixture' };
};
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => fs.rm(folder, { recursive: true, force: true }))); });
describe('CadQuery Motion integration', () => {
  it('validates declarative operations before starting the CAD engine', async () => {
    const { cad, workDir } = await setup(fixture);
    const part = defaultCadPart();
    expect(validCadScene({ version: 1, parts: [part] })).toBe(true);
    for (const parts of [[{ ...part, operation: 'cut' }], [{ ...part, width: 0 }], [{ ...part, fillet: 11 }], [part,part], [{ ...part, rz: NaN }]]) {
      expect((await cad.run('cad_scene', { title: 'Pièce', scene: { version: 1, parts } })).structuredContent).toMatchObject({ refused: { code: 'invalid_scene' } });
    }
    const result = await cad.run('cad_scene', { title: 'Pièce', scene: { version: 1, parts: [part] } });
    const data = result.structuredContent!.cad as { project: string };
    expect(JSON.parse(await fs.readFile(path.join(workDir,data.project,'scene.json'),'utf8'))).toEqual({ version: 1, parts: [part] });
    expect(data.project).toMatch(/^motion\/piece-3d-/);
  });
  it('publishes a complete variant only after the engine validates and exports it', async () => {
    const { workDir, cad } = await setup(fixture);
    const call = () => cad.run('cad_project', { script: 'model.py', title: 'Mon produit', parameters: { width: 20 }, format: '16:9' });
    const first = await call();
    expect(first.isError).toBeUndefined();
    const data = first.structuredContent!.cad as { project: string; file: string; files: string[] };
    const html = await fs.readFile(path.join(workDir, data.file), 'utf8');
    expect(html).toContain('data-width="1920"'); expect(html).toContain('data-height="1080"');
    expect(html).toContain('window.__timelines = {main:timeline}');
    expect(data.files).toHaveLength(4);
    for (const file of data.files) expect((await fs.stat(path.join(workDir, file))).size).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(workDir, data.project, 'parameters.json'), 'utf8')).toContain('20');
    expect((await call()).structuredContent!.cad).not.toMatchObject({ project: data.project });
    expect(await fs.readdir(path.join(workDir, 'motion'))).not.toContainEqual(expect.stringMatching(/^\.cad-job/));
  });
  it('keeps failures unpublished and reports an unavailable engine explicitly', async () => {
    const { workDir, cad } = await setup(async () => ({ ok: false, code: 'cadquery_unavailable', message: 'Engine unavailable' }));
    expect((await cad.run('cad_status', {})).structuredContent).toMatchObject({ refused: { code: 'cadquery_unavailable' } });
    expect((await cad.run('cad_project', { script: 'model.py', title: 'Produit' })).isError).toBe(true);
    expect(await fs.readdir(path.join(workDir, 'motion'))).toEqual([]);
  });
  it('rejects scripts outside the workspace including symlink targets', async () => {
    const { workDir, cad } = await setup(fixture);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-cad-')); folders.push(outside);
    await fs.writeFile(path.join(outside, 'outside.py'), 'result = None');
    await fs.symlink(path.join(outside, 'outside.py'), path.join(workDir, 'link.py'));
    for (const script of [path.join(outside, 'outside.py'), 'link.py']) expect((await cad.run('cad_project', { script, title: 'Produit' })).structuredContent).toMatchObject({ refused: { code: 'invalid_script' } });
  });
  it('validates dimensions, mesh indices and preview complexity', async () => {
    const { cad } = await setup(fixture);
    for (const duration of [0, 3, 61, NaN]) expect((await cad.run('cad_project', { script: 'model.py', title: 'Produit', duration })).isError).toBe(true);
    expect(validCadMesh(mesh)).toBe(true);
    expect(validCadMesh({ ...mesh, triangles: [[0,1,99]] })).toBe(false);
    expect(validCadMesh({ ...mesh, vertices: [[NaN,0,0], ...mesh.vertices] })).toBe(false);
  });
  it('is exposed through the existing Motion MCP protocol', async () => {
    const { workDir } = await setup(fixture);
    const motion = createMotionTools({ workDir, now: Date.now, cad: { runner: fixture } });
    expect(motion.tools.map(tool => tool.name)).toContain('cad_project');
    expect((await motion.run('cad_status', {})).structuredContent).toMatchObject({ cad: { ready: true } });
  });
  it('seeks the real 3D geometry deterministically and returns to its start after 360 degrees', () => {
    const angles: number[] = [];
    const buffers: Float32Array[] = [];
    const context = new Proxy({
      getShaderParameter: () => true, getProgramParameter: () => true,
      getUniformLocation: (_: unknown,name: string) => name,
      uniform1f: (_: unknown,angle: number) => angles.push(angle),
      bufferData: (_: unknown, data: Float32Array) => buffers.push(data),
    }, { get: (target, key) => (target as Record<string | symbol, unknown>)[key] ?? (() => {}) });
    const animations = [{ pause: () => {}, currentTime: 0 }];
    const win: Record<string, any> = {};
    vm.runInNewContext(CAD_VIEWER_JS, { window: win, document: { getElementById: (id: string) => id === 'cad-stage' ? { width: 900, height: 900, getContext: () => context } : { textContent: JSON.stringify(mesh) }, querySelector: () => ({ getAttribute: (name: string) => name === 'data-duration' ? '8' : '2b7cff' }), getAnimations: () => animations }, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
    expect(buffers[0]).toHaveLength(9);
    const start = angles.at(-1)!;
    const timeline = win.__timelines.main;
    timeline.seek(1.5); expect(angles.at(-1)).not.toBe(start); expect(animations[0].currentTime).toBe(1500);
    timeline.seek(0); expect(angles.at(-1)).toBe(start);
    timeline.seek(6); expect(angles.at(-1)).toBeCloseTo(Math.PI * 2, 7);
    expect(timeline.time()).toBe(6); expect(timeline.duration()).toBe(8);
  });
});

// BAARALI(13/10/2026): opt-in real engine check, separate from the portable
// contract tests; run in release validation with the same pinned Python fork.
describe.skipIf(!process.env.BAARALI_TEST_CAD_PYTHON)('real CadQuery engine', () => {
  it('rebuilds a scene with a real cut and preserves its previous variant', async () => {
    const { workDir } = await setup();
    const cad = createCadTools({ workDir, readBrand: async () => DEFAULT_BRAND, python: process.env.BAARALI_TEST_CAD_PYTHON });
    const base = { ...defaultCadPart(), width: 24, depth: 12, height: 8 };
    const hole = { ...defaultCadPart('hole'), operation: 'cut' as const, width: 8, depth: 4, height: 10 };
    const first = await cad.run('cad_scene', { title: 'Pièce découpée', scene: { version: 1, parts: [base,hole] }, duration: 6 });
    expect(first.isError,JSON.stringify(first)).toBeUndefined();
    const original = (first.structuredContent!.cad as { project: string }).project;
    expect(JSON.parse(await fs.readFile(path.join(workDir,original,'scene.json'),'utf8')).parts).toHaveLength(2);
    const second = await cad.run('cad_scene', { title: 'Pièce découpée', scene: { version: 1, parts: [{ ...base, width: 30 },hole] }, duration: 6 });
    expect(second.isError,JSON.stringify(second)).toBeUndefined();
    const next = (second.structuredContent!.cad as { project: string }).project;
    expect(next).not.toBe(original);
    for (const [folder,width,volume] of [[original,24,2048],[next,30,2624]] as const) {
      const { stdout } = await promisify(execFile)(process.env.BAARALI_TEST_CAD_PYTHON!, ['-I','-c','import cadquery as cq,sys,json;s=cq.importers.importStep(sys.argv[1]).val();print(json.dumps({"width":s.BoundingBox().xlen,"volume":s.Volume()}))',path.join(workDir,folder,'exports/model.step')], { timeout: 15_000 });
      expect(JSON.parse(stdout).width).toBeCloseTo(width,5);expect(JSON.parse(stdout).volume).toBeCloseTo(volume,4);
    }
  }, 55_000);
  it('builds and reimports a dimensional model, exports CAD formats and passes Motion checks', async () => {
    const { workDir } = await setup();
    const cad = createCadTools({ workDir, readBrand: async () => DEFAULT_BRAND, python: process.env.BAARALI_TEST_CAD_PYTHON });
    const result = await cad.run('cad_project', { script: 'model.py', title: 'Boîtier Baarali', parameters: { width: 24 } });
    expect(result.isError, JSON.stringify(result)).toBeUndefined();
    const data = result.structuredContent!.cad as { file: string; project: string; files: string[] };
    const html = await fs.readFile(path.join(workDir, data.file), 'utf8');
    expect((await checkComposition(html, path.join(workDir, data.project))).filter(f => f.severity === 'error')).toEqual([]);
    expect(await fs.readFile(path.join(workDir, data.project, 'exports/model.step'), 'utf8')).toContain('ISO-10303-21');
    const glb = await fs.readFile(path.join(workDir, data.project, 'exports/model.glb'));
    expect(glb.subarray(0,4).toString()).toBe('glTF');
    const { stdout } = await promisify(execFile)(process.env.BAARALI_TEST_CAD_PYTHON!, ['-I', '-c', 'import cadquery as cq,sys,json; s=cq.importers.importStep(sys.argv[1]).val(); b=s.BoundingBox(); print(json.dumps({"width":b.xlen,"depth":b.ylen,"height":b.zlen,"volume":s.Volume()}))', path.join(workDir, data.project, 'exports/model.step')], { timeout: 15_000 });
    expect(JSON.parse(stdout)).toMatchObject({ width: 24, depth: 12, height: 8 });
    expect(JSON.parse(stdout).volume).toBeCloseTo(2304, 4);
    const updated = await cad.run('cad_parameters', { project: data.project, parameters: { width: 30 } });
    expect(updated.isError,JSON.stringify(updated)).toBeUndefined();
    expect((updated.structuredContent!.cad as { project: string }).project).not.toBe(data.project);
    const health = await pythonCadRunner(process.env.BAARALI_TEST_CAD_PYTHON!)(workDir, true);
    expect(health.ok).toBe(true);
  }, 55_000);
});
