import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

// BAARALI(13/10/2026): test the Linux runtime image itself, not a mock
// engine. No account, control-plane request or paid generation is needed.
const dist = process.env.BAARALI_INSTANCE_DIST ?? '/app/instance/dist';
const { createCadTools } = await import(pathToFileURL(path.join(dist, 'cad-mcp.js')));
const { DEFAULT_BRAND } = await import(pathToFileURL(path.join(dist, 'motion-templates.js')));
const { defaultCadPart } = await import(pathToFileURL(path.join(dist, 'cad-scene.js')));
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-cad-runtime-'));
try {
  await fs.writeFile(path.join(folder, 'model.py'), 'result = cq.Workplane("XY").box(parameters["width"], 12, 8)');
  const tools = createCadTools({ workDir: folder, readBrand: async () => DEFAULT_BRAND, python: process.env.BAARALI_CAD_PYTHON });
  const result = await tools.run('cad_project', { script: 'model.py', title: 'CAD runtime check', parameters: { width: 24 } });
  if (result.isError) throw Error(JSON.stringify(result));
  const cad = result.structuredContent.cad;
  const step = path.join(folder, cad.project, 'exports/model.step');
  const glb = await fs.readFile(path.join(folder, cad.project, 'exports/model.glb'));
  if (glb.subarray(0,4).toString() !== 'glTF') throw Error('Invalid GLB');
  const { stdout } = await promisify(execFile)(process.env.BAARALI_CAD_PYTHON ?? 'python3', ['-I', '-c', 'import cadquery as cq,sys; s=cq.importers.importStep(sys.argv[1]).val(); b=s.BoundingBox(); assert abs(b.xlen-24)<1e-6 and abs(b.ylen-12)<1e-6 and abs(b.zlen-8)<1e-6; assert abs(s.Volume()-2304)<1e-6; print("STEP dimensions and volume validated")', step], { timeout: 15000 });
  for (const file of cad.files) if (!(await fs.stat(path.join(folder, file))).size) throw Error('Empty CAD export');
  console.log(stdout.trim());
  console.log(`CadQuery ${cad.version}: STEP, STL, GLB and SVG validated.`);
  const scene = { version: 1, parts: [
    { ...defaultCadPart(), width: 24, depth: 12, height: 8 },
    { ...defaultCadPart('cut'), operation: 'cut', width: 8, depth: 4, height: 10 },
  ] };
  const edited = await tools.run('cad_scene', { title: 'Interactive CAD runtime check', scene });
  if (edited.isError) throw Error(JSON.stringify(edited));
  const project = edited.structuredContent.cad.project;
  if (!project.startsWith('motion/')) throw Error('Invalid project path');
  await promisify(execFile)(process.env.BAARALI_CAD_PYTHON ?? 'python3', ['-I','-c','import cadquery as cq,sys;s=cq.importers.importStep(sys.argv[1]).val();assert abs(s.Volume()-2048)<1e-6',path.join(folder,project,'exports/model.step')], { timeout:15000 });
  const variant = await tools.run('cad_parameters', { project: cad.project, parameters: { width: 30 } });
  if (variant.isError || variant.structuredContent.cad.project === cad.project) throw Error('Parameter variant failed');
  console.log('Interactive cut and parameter variants validated.');
} finally { await fs.rm(folder, { recursive: true, force: true }); }
