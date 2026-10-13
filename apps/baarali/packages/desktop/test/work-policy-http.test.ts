import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { ROOT, corePlan } from '../scripts/brand.mjs';

// BAARALI(13/10/2026): exercise the branded HTTP router with real request
// validation, before invoking a mutation. Only the billing reader is a fixture.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baarali-work-http-'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(ROOT, 'apps/x/apps/server/node_modules'), path.join(dir, 'node_modules'));
const emit = (name: string, source: string) => fs.writeFileSync(path.join(dir, name + '.js'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const routerPath = 'apps/x/apps/server/src/router.ts';
let source = fs.readFileSync(path.join(ROOT, routerPath), 'utf8');
for (const edit of corePlan().edits.filter((edit: { file: string }) => edit.file === routerPath)) source = source.replace(edit.from, () => edit.to);
source = source.replace("'@x/core/dist/baarali/work-runtime.js'", "'./work-runtime.js'");
emit('router', source);
emit('channels', fs.readFileSync(path.join(ROOT, 'apps/x/apps/server/src/channels.ts'), 'utf8'));
emit('work-policy', fs.readFileSync(new URL('../assets/mobile/work-policy.ts', import.meta.url), 'utf8'));
emit('work-access', fs.readFileSync(new URL('../assets/mobile/work-access.ts', import.meta.url), 'utf8'));
fs.writeFileSync(path.join(dir, 'work-runtime.js'), `
import { createWorkGuard, workChannel } from './work-policy.js';
export { WorkAccessError, WorkCheckError } from './work-policy.js';
import fs from 'node:fs';
const check = createWorkGuard(async () => { const { info, failure } = JSON.parse(fs.readFileSync(new URL('./billing.json', import.meta.url), 'utf8')); if (failure) throw Error('offline'); return info; }, async () => 'fixture');
export async function requireWorkChannel(channel, args) { if (workChannel(channel, args)) await check(); }
`);
const load = async (name: string) => import(/* @vite-ignore */ pathToFileURL(path.join(dir, name + '.js')).href);
const { createRpcRoutes } = await load('router');
const setBilling = (info: unknown, failure = false) => fs.writeFileSync(path.join(dir, 'billing.json'), JSON.stringify({ info, failure }));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const billing = (category: string) => ({ subscriptionPlanId: 'p', subscriptionStatus: 'active', catalog: { plans: [{ id: 'p', category }] } });
const call = (app: ReturnType<typeof createRpcRoutes>, channel: string, body: unknown) => app.request('/rpc/' + channel, { method: 'POST', body: JSON.stringify(body) });
describe('branded Work HTTP gate', () => {
  it('returns 403 before a free caller can create a project chat', async () => {
    setBilling(billing('free'));
    let called = false;
    const app = createRpcRoutes({ 'projects:createChat': async () => { called = true; return { sessionId: 'x' }; } });
    const response = await call(app, 'projects:createChat', { projectId: 'project' });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('work_plan_required');
    expect(called).toBe(false);
  });
  it('allows the same validated request for a paid account', async () => {
    setBilling(billing('starter'));
    const app = createRpcRoutes({ 'projects:createChat': async () => ({ sessionId: 'x' }) });
    const response = await call(app, 'projects:createChat', { projectId: 'project' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessionId: 'x' });
  });
  it('returns 503 without invoking Work when verification is unavailable', async () => {
    setBilling(null, true);
    let called = false;
    const app = createRpcRoutes({ 'projects:createChat': async () => { called = true; return { sessionId: 'x' }; } });
    const response = await call(app, 'projects:createChat', { projectId: 'project' });
    expect(response.status).toBe(503);
    expect(called).toBe(false);
  });
  it('keeps ordinary Chat creation open without a Work entitlement', async () => {
    setBilling(billing('free'));
    const app = createRpcRoutes({ 'sessions:create': async () => ({ sessionId: 'chat' }) });
    expect((await call(app, 'sessions:create', { title: 'Question' })).status).toBe(200);
  });
  it('allows a free Chat document with a nested apps directory but refuses the real Work apps root', async () => {
    setBilling(billing('free'));
    const written: string[] = [];
    const app = createRpcRoutes({ 'workspace:writeFile': async ({ path }: { path: string }) => { written.push(path); return { path, etag: 'fixture', stat: { kind: 'file', size: 4, mtimeMs: 0, ctimeMs: 0 } }; } });
    expect((await call(app, 'workspace:writeFile', { path: 'Documents/apps/notes.md', data: 'Note' })).status).toBe(200);
    expect((await call(app, 'workspace:writeFile', { path: 'apps/demo/index.html', data: 'App' })).status).toBe(403);
    expect(written).toEqual(['Documents/apps/notes.md']);
  });
});
