import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CAD_WORKER } from './cad-worker.js';
import { cadComposition, type CadMesh } from './cad-viewer.js';
import { FORMATS, type BrandKit } from './motion-templates.js';
import type { ToolDef, ToolResult } from './media-mcp.js';

export const CAD_COMMIT = '62d2e72fd2285102b029d35391f2bf37bb44658d';
export interface CadReport { ok: boolean; code?: string; message?: string; version?: string; triangles?: number }
export type CadRunner = (folder: string, health: boolean) => Promise<CadReport>;
export interface CadOptions { python?: string; runner?: CadRunner }

const execute = promisify(execFile);
export function pythonCadRunner(python: string): CadRunner {
  return async (folder, health) => {
    try {
      const { stdout } = await execute(python, ['-I', '-c', CAD_WORKER, folder, ...(health ? ['health'] : [])], {
        cwd: folder, timeout: health ? 15_000 : 45_000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
      });
      // OCCT can print native export diagnostics outside Python's redirect.
      const report = stdout.split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'));
      return JSON.parse(report ?? '') as CadReport;
    } catch (error) {
      const e = error as { code?: string; killed?: boolean };
      return { ok: false, code: e.code === 'ENOENT' ? 'cadquery_unavailable' : 'cadquery_process_failed', message: e.killed ? 'The CAD model exceeded its time or output limit. Simplify it.' : 'The CAD engine could not run. Check the instance runtime.' };
    }
  };
}

export const CAD_TOOLS: ToolDef[] = [
  { name: 'cad_status', description: 'Check whether the instance has the CadQuery engine before creating a parametric 3D model.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cad_project', description: 'Build a parametric CadQuery model from a workspace Python script and create a new Motion project with an animated 360 degree preview. The script assigns a Workplane, Shape or Assembly to result; parameters is the provided JSON object. Produces STEP, STL, GLB and SVG in exports/. Edit the source and call again for a variant; never claim success when the engine is unavailable. Uses paid Work; video exports use the usual Motion minutes.', inputSchema: {
    type: 'object', required: ['script', 'title'], properties: {
      script: { type: 'string', description: 'Workspace path to a Python file, with result = cq.Workplane(...), a Shape or an Assembly.' },
      title: { type: 'string', description: 'Exact title to show, in the user’s language.' },
      caption: { type: 'string', description: 'Optional exact caption to show.' },
      parameters: { type: 'object', description: 'Dimensions in mm and other parameters, available to the script as parameters.' },
      format: { type: 'string', enum: ['9:16', '1:1', '4:5', '16:9'] },
      duration: { type: 'number', description: 'Preview seconds, from 4 to 60; default 8. The final pose holds for 2 seconds.' },
    },
  } },
];

export function validCadMesh(value: unknown): value is CadMesh {
  const mesh = value as CadMesh | null;
  return !!mesh && Array.isArray(mesh.vertices) && mesh.vertices.length >= 3 && mesh.vertices.length <= 100_000
    && mesh.vertices.every(v => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9))
    && Array.isArray(mesh.triangles) && mesh.triangles.length > 0 && mesh.triangles.length <= 20_000
    && mesh.triangles.every(t => Array.isArray(t) && t.length === 3 && t.every(n => Number.isInteger(n) && n >= 0 && n < mesh.vertices.length));
}

export function createCadTools(deps: CadOptions & { workDir: string; readBrand: () => Promise<BrandKit> }) {
  const runner = deps.runner ?? pythonCadRunner(deps.python ?? 'python3');
  let busy = false;
  const reply = (message: string, data: Record<string, unknown>, error = false): ToolResult => ({ content: [{ type: 'text', text: message }], structuredContent: data, ...(error ? { isError: true } : {}) });
  const refuse = (code: string, message: string) => reply(message, { refused: { code, message } }, true);
  const relative = (file: string) => path.relative(deps.workDir, file).split(path.sep).join('/');
  async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (name === 'cad_status') {
      const state = await runner(deps.workDir, true);
      return state.ok ? reply(`CadQuery ${state.version} is ready.`, { cad: { ready: true, version: state.version, source: `benewende-dev/cadquery@${CAD_COMMIT}` } }) : refuse(state.code ?? 'cadquery_unavailable', state.message ?? 'CadQuery is unavailable on this instance.');
    }
    if (name !== 'cad_project') return refuse('unknown_tool', 'Unknown CAD tool.');
    if (busy) return refuse('cadquery_busy', 'A CAD model is already being built on this instance. Try again when it finishes.');
    if (typeof args.script !== 'string' || !/\.py$/i.test(args.script) || typeof args.title !== 'string' || !args.title.trim()) return refuse('invalid_input', 'Give the Python script path and the exact project title.');
    const duration = args.duration ?? 8;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 4 || duration > 60) return refuse('invalid_input', 'The CAD preview duration must be from 4 to 60 seconds.');
    const format = args.format ?? '9:16';
    if (!['9:16', '1:1', '4:5', '16:9'].includes(String(format))) return refuse('invalid_input', 'Use 9:16, 1:1, 4:5 or 16:9.');
    const parameters = args.parameters ?? {};
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) || JSON.stringify(parameters).length > 8192) return refuse('invalid_input', 'Parameters must be a JSON object under 8 KB.');
    busy = true;
    let staging: string | undefined;
    try {
      const root = await fs.realpath(deps.workDir);
      const script = await fs.realpath(path.resolve(root, args.script));
      if (!script.startsWith(root + path.sep)) return refuse('invalid_script', 'The Python script must be inside the workspace.');
      const stat = await fs.stat(script);
      if (!stat.isFile() || stat.size > 64 * 1024) return refuse('invalid_script', 'The Python script must be a file under 64 KB.');
      const source = await fs.readFile(script, 'utf8');
      const motion = path.join(root, 'motion');
      await fs.mkdir(motion, { recursive: true });
      const realMotion = await fs.realpath(motion);
      if (!realMotion.startsWith(root + path.sep)) return refuse('invalid_project', 'The Motion directory must be inside the workspace.');
      staging = await fs.mkdtemp(path.join(realMotion, '.cad-job-'));
      const brand = await deps.readBrand();
      const accent = /^#[a-f0-9]{6}$/i.test(brand.colors.accent) ? brand.colors.accent : '#2b7cff';
      const color = [1, 3, 5].map(start => parseInt(accent.slice(start, start + 2), 16) / 255);
      await fs.writeFile(path.join(staging, 'job.json'), JSON.stringify({ source, parameters, color }));
      const state = await runner(staging, false);
      if (!state.ok) return refuse(state.code ?? 'cadquery_model_failed', state.message ?? 'The CAD model could not be built.');
      const meshFile = path.join(staging, 'mesh.json');
      if ((await fs.stat(meshFile)).size > 16 * 1024 * 1024) return refuse('invalid_mesh', 'The CAD preview is too large. Simplify the model.');
      const mesh: unknown = JSON.parse(await fs.readFile(meshFile, 'utf8'));
      if (!validCadMesh(mesh)) return refuse('invalid_mesh', 'The CAD preview mesh is invalid or too complex.');
      const exports = path.join(staging, 'exports');
      await fs.mkdir(exports);
      for (const extension of ['step', 'stl', 'glb', 'svg']) {
        const file = path.join(staging, `model.${extension}`);
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.size === 0 || stat.size > 32 * 1024 * 1024) return refuse('invalid_export', 'A CAD export is missing or too large. Simplify the model.');
        await fs.rename(file, path.join(exports, `model.${extension}`));
      }
      const title = args.title.trim().slice(0, 120);
      const caption = typeof args.caption === 'string' ? args.caption.slice(0, 240) : '';
      const { width, height } = FORMATS[format as keyof typeof FORMATS];
      await fs.writeFile(path.join(staging, 'index.html'), cadComposition({ mesh, title, caption, width, height, duration, brand }));
      await fs.writeFile(path.join(staging, 'model.py'), source);
      await fs.writeFile(path.join(staging, 'parameters.json'), JSON.stringify(parameters, null, 2));
      await fs.writeFile(path.join(staging, 'cad.json'), JSON.stringify({ version: state.version, source: `benewende-dev/cadquery@${CAD_COMMIT}`, title, format, duration, triangles: mesh.triangles.length }, null, 2));
      await fs.rm(path.join(staging, 'job.json'));
      await fs.rm(meshFile);
      // Immutable variants keep the previous model and open preview intact.
      const slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'model';
      const destination = path.join(realMotion, `${slug}-3d-${path.basename(staging).slice('.cad-job-'.length)}`);
      await fs.rename(staging, destination);
      staging = undefined;
      const project = relative(destination);
      const files = ['step', 'stl', 'glb', 'svg'].map(extension => `${project}/exports/model.${extension}`);
      return reply(`CAD model ready: ${project}/index.html\nFiles: ${files.join(', ')}. Preview and video exports use the usual Motion tools.`, { cad: { project, file: `${project}/index.html`, files, version: state.version, triangles: mesh.triangles.length } });
    } catch {
      return refuse('cadquery_model_failed', 'The CAD source or output could not be read. Check the script and try again.');
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      busy = false;
    }
  }
  return { tools: CAD_TOOLS, run };
}
