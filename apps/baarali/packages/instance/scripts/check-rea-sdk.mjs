import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// BAARALI(15/10/2026): test the actual Baarali SDK and shared schema against
// REA's independent SDK. A raw JSON-RPC smoke test cannot catch that mismatch.
const require = createRequire(new URL('../../../../x/packages/core/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const { ListToolsResponse } = await import(pathToFileURL(require.resolve('@x/shared/dist/mcp.js')).href);
const { REA_VERSION } = await import(new URL('../dist/rea.js', import.meta.url));
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-rea-sdk-'));
const source = path.join(workDir, 'reference');
await fs.mkdir(source);
await fs.mkdir(path.join(workDir, 'home'));
await fs.writeFile(path.join(source, 'index.js'), 'export function sum(a,b) { return a + b; }');
const client = new Client({ name: 'baarali-rea-sdk-check', version: '1' });
const transport = new StdioClientTransport({
  command: process.env.BAARALI_REA_NODE ?? process.execPath,
  args: ['--max-old-space-size=384', fileURLToPath(new URL('../dist/rea-main.js', import.meta.url))],
  env: {
    PATH: process.env.PATH ?? '', HOME: path.join(workDir, 'home'), ROWBOAT_WORKDIR: workDir,
    BAARALI_REA_ROOT: process.env.BAARALI_REA_ROOT ?? fileURLToPath(new URL('../../../engines/rea/', import.meta.url)),
  },
});
try {
  await client.connect(transport);
  assert.equal(client.getServerVersion().version, REA_VERSION);
  const listed = [];
  let cursor;
  do {
    const page = ListToolsResponse.parse(await client.listTools({ cursor }));
    listed.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  assert.ok(listed.some(tool => tool.name === 'analyze_javascript_application'));
  const result = await client.callTool({ name: 'analyze_javascript_application', arguments: { input_path: source } }, undefined, { timeout: 600_000, maxTotalTimeout: 600_000 });
  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.match(result.structuredContent.evidence_id, /^ev_/);
  assert.equal(result.structuredContent.parameters.max_heap_mb, 256);
  await client.callTool({ name: 'close_binary', arguments: {} });
  console.log(`Baarali SDK and shared schemas → REA ${REA_VERSION}: ${listed.length} tools and real analysis validated`);
} finally {
  await client.close();
  await fs.rm(workDir, { recursive: true, force: true });
}
