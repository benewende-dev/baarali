import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

// BAARALI(15/10/2026): exercise the installed engine and evidence lifecycle,
// including native decompilation in the Linux image, without model/API calls.
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-rea-check-'));
await fs.mkdir(path.join(workDir, 'home'));
const node = process.env.BAARALI_REA_NODE ?? '/opt/baarali-rea/bin/node';
const launcher = process.env.BAARALI_REA_LAUNCHER ?? fileURLToPath(new URL('../dist/rea-main.js', import.meta.url));
const child = spawn(node, ['--max-old-space-size=384', launcher], {
  env: { ...process.env, HOME: path.join(workDir, 'home'), ROWBOAT_WORKDIR: workDir },
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});
const pending = new Map();
let sequence = 0;
let diagnostics = '';
child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  try {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  } catch (error) {
    for (const waiter of pending.values()) waiter.reject(error);
  }
});
const fail = reason => {
  for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(reason + '\n' + diagnostics)); }
  pending.clear();
};
child.on('error', error => fail(error.message));
child.on('exit', code => fail(`REA exited (${code})`));
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`REA timed out: ${method}\n${diagnostics}`)); }, 600_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function tool(name, args) {
  const result = await request('tools/call', { name, arguments: args });
  assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`);
  assert.ok(result.structuredContent, `${name} must return structured evidence`);
  return result.structuredContent;
}
async function shutdown() {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.stdin.end();
  let timer;
  const clean = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 10_000); })]);
  clearTimeout(timer);
  if (!clean) {
    try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {}
    await exited;
    throw new Error('REA did not release its processes on disconnect');
  }
  assert.equal(child.exitCode, 0, diagnostics);
}

try {
  const init = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'baarali-runtime-check', version: '1' } });
  assert.equal(init.serverInfo.version, '6.5.0');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tools = [];
  let cursor;
  do {
    const page = await request('tools/list', { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  for (const name of ['binary_session', 'analyze_javascript_application', 'trace_application_feature', 'compare_application_versions', 'open_binary', 'analyze_function', 'close_binary', 'export_evidence_bundle']) {
    assert.ok(tools.some(tool => tool.name === name), `missing ${name}`);
  }
  console.log(`REA ${init.serverInfo.version}: ${tools.length} tools discovered`);

  const source = path.join(workDir, 'reference');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'notes-reference', version: '1', main: 'main.cjs' }));
  await fs.writeFile(path.join(source, 'main.cjs'), "const {ipcMain}=require('electron'); ipcMain.handle('export-csv', (_event, rows) => rows.join('\\n'));\n");
  await fs.writeFile(path.join(source, 'preload.cjs'), "const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('notes',{exportRows:rows=>ipcRenderer.invoke('export-csv',rows)});\n");
  const rejected = await request('tools/call', { name: 'analyze_javascript_application', arguments: { input_path: source, max_heap_mb: 16_384 } });
  assert.equal(rejected.isError, true);
  assert.match(JSON.stringify(rejected), /baarali_resource_constraint/);
  const application = await tool('analyze_javascript_application', { input_path: source });
  assert.match(application.evidence_id, /^ev_/);
  assert.match(JSON.stringify(application.normalized_result), /export-csv/);
  assert.equal(application.parameters.max_heap_mb, 256);
  const trace = await tool('trace_application_feature', { application, seed: { kind: 'channel', value: 'export-csv' }, direction: 'both' });
  assert.ok(trace.normalized_result.summary.matched_seeds > 0);
  console.log('JavaScript/Electron feature traced with retained evidence; worker limits verified');

  if (process.env.REA_BROWSER_EXECUTABLE) {
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><html lang="en"><title>Reference</title><button id="calculate" onclick="document.getElementById(\'result\').textContent=\'Result verified: 42\'">Calculate</button><p id="result">Ready</p></html>');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const web = await tool('capture_browser_scenario', {
        browser: { mode: 'launch', executable_path: process.env.REA_BROWSER_EXECUTABLE, headless: true },
        start_url: { url: `http://127.0.0.1:${server.address().port}/` },
        actions: [{ step_id: 'calculate', action: 'click', locator: { kind: 'css', selector: '#calculate' }, timeout_ms: 10_000 }],
        capture: { at_end: ['dom', 'screenshot'] },
      });
      assert.match(JSON.stringify(web.normalized_result), /Result verified: 42/);
      assert.match(JSON.stringify(web.normalized_result), /screenshot/);
      console.log('Website interaction, DOM evidence and screenshot verified with owned Chromium');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }

  if (process.env.BAARALI_REA_NATIVE_TARGET) {
    await tool('open_binary', { path: process.env.BAARALI_REA_NATIVE_TARGET, provider_id: 'ghidra' });
    const native = await tool('analyze_function', { procedure: 'baarali_fixture' });
    assert.match(JSON.stringify(native.normalized_result), /baarali_fixture/);
    assert.ok(native.normalized_result.pseudocode || native.normalized_result.assembly, 'native instructions or pseudocode missing');
    console.log('Native function analyzed by real Ghidra');
  }
  const output = path.join(workDir, 'evidence.json');
  await tool('export_evidence_bundle', { path: output });
  const exported = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.match(JSON.stringify(exported), new RegExp(application.evidence_id));
  await tool('close_binary', {});
  console.log('Evidence export and session cleanup verified');
  try { console.log('Linux analysis peak memory bytes:', (await fs.readFile('/sys/fs/cgroup/memory.peak', 'utf8')).trim()); } catch {}
} finally {
  try { await shutdown(); }
  finally { lines.close(); await fs.rm(workDir, { recursive: true, force: true }); }
}
