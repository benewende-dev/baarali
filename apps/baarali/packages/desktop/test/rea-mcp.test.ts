import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, corePlan } from '../scripts/brand.mjs';

// BAARALI(15/10/2026): exercise the branded MCP client with the real SDK
// and separate stdio peers; two chats must never share their active target.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baarali-rea-mcp-'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(ROOT, 'apps/x/packages/core/node_modules'), path.join(dir, 'node_modules'));
const emit = (name: string, source: string) => fs.writeFileSync(path.join(dir, name + '.js'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
let source = fs.readFileSync(path.join(ROOT, 'apps/x/packages/core/src/mcp/mcp.ts'), 'utf8');
for (const edit of corePlan().edits.filter((edit: { file: string }) => edit.file.endsWith('/mcp/mcp.ts'))) source = source.replace(edit.from, () => edit.to);
source = source.replace('"../di/container.js"', '"./container.js"').replace('"../spaces/orgs.js"', '"./orgs.js"').replace('"../spaces/baarasseur-members.js"', '"./members.js"').replaceAll('"../baarali/', '"./');
emit('mcp', source + '\nexport { withReaScope } from "./rea-scope.js";\n');
for (const name of ['rea-config', 'rea-scope']) emit(name, fs.readFileSync(new URL(`../assets/${name}.ts`, import.meta.url), 'utf8'));
fs.writeFileSync(path.join(dir, 'orgs.js'), 'export async function spacesMcpServers(){return {}}');
fs.writeFileSync(path.join(dir, 'members.js'), 'export function baarasseurMcpServers(){return {}}');
fs.writeFileSync(path.join(dir, 'container.js'), 'import fs from "node:fs"; export default {resolve(){return {getConfig:async()=>JSON.parse(fs.readFileSync(new URL("./config.json",import.meta.url),"utf8"))}}};');
fs.writeFileSync(path.join(dir, 'work-runtime.js'), 'import fs from "node:fs";export const freeMediaServer=s=>s==="baarali-media";export async function requireWork(){if(fs.readFileSync(new URL("./plan",import.meta.url),"utf8")==="free")throw Error("paid only")}');
fs.writeFileSync(path.join(dir, 'peer.cjs'), `
const lines=require('node:readline').createInterface({input:process.stdin});
lines.on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;
const result=q.method==='initialize'?{protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:
q.method==='tools/list'?{tools:[{name:'probe',description:'Read the fixture',inputSchema:{type:'object',properties:{}},outputSchema:{type:'object',properties:{pid:{type:'number'}}}}]}:
{content:[{type:'text',text:'fixture'}],structuredContent:{pid:process.pid,name:q.params.name}};
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});
lines.on('close',()=>process.exit(0));
`);
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mcpServers: { 'baarali-rea': { command: process.execPath, args: [path.join(dir, 'peer.cjs')] }, other: { command: process.execPath, args: [path.join(dir, 'peer.cjs')] } } }));
const plan = (value: string) => fs.writeFileSync(path.join(dir, 'plan'), value);
plan('paid');
const load = (name: string) => import(/* @vite-ignore */ pathToFileURL(path.join(dir, name + '.js')).href);
const mcp = await load('mcp');
const { withReaScope } = mcp;
const call = (sessionId: string, tool = 'probe', input = {}) => withReaScope({ sessionId, runId: 'turn' }, () => mcp.executeTool('baarali-rea', tool, input));
afterAll(async () => { await mcp.cleanup(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('branded REA MCP lifecycle', () => {
  it('keeps REA names, descriptions and callable inputs without flooding discovery with output validators', async () => {
    const result = await withReaScope({ sessionId: 'catalog', runId: 'turn' }, () => mcp.listTools('baarali-rea'));
    expect(result.tools).toEqual([{ name: 'probe', description: 'Read the fixture', inputSchema: { type: 'object', properties: {} } }]);
    expect((await mcp.listTools('other')).tools[0].outputSchema).toBeDefined();
    await call('catalog', 'close_binary');
  });

  it('separates chats, deduplicates opens and releases a slot after cleanup', async () => {
    const [a, sameA, b] = await Promise.all([call('a'), call('a'), call('b')]);
    expect(a.structuredContent.pid).toBe(sameA.structuredContent.pid);
    expect(a.structuredContent.pid).not.toBe(b.structuredContent.pid);
    await expect(call('c')).rejects.toThrow('already open');
    await call('a', 'close_binary');
    const c = await call('c');
    expect(c.structuredContent.pid).not.toBe(a.structuredContent.pid);
    await call('b', 'close_binary');
    await call('c', 'close_binary');
  });
  it('preserves paid execution while allowing resource cleanup after a downgrade', async () => {
    await call('paid');
    plan('free');
    try {
      await expect(call('paid')).rejects.toThrow('paid only');
      await expect(call('paid', 'close_binary', { snapshot_path: '/data/config' })).rejects.toThrow('paid only');
      await expect(call('paid', 'close_binary')).resolves.toBeDefined();
    } finally { plan('paid'); }
  });
});
