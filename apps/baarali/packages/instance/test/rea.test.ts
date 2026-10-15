import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reaEnvironment, reaServer, REA_VERSION } from '../src/rea.js';
import { REA_SKILL } from '../src/rea-skill.js';
import { seedWorkdir } from '../src/seed.js';

const directories: string[] = [];
const temporary = async () => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'baarali-rea-test-')); directories.push(dir); return dir; };
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

describe('isolated REA runtime', () => {
  it('does not pass instance, model, Fly credentials or Node injection options to analysis tools', () => {
    const env = reaEnvironment({
      PATH: '/bin', HOME: '/data/home', JAVA_HOME: '/java', GHIDRA_INSTALL_DIR: '/ghidra', REA_JEB_MCP_URL: 'http://127.0.0.1:9999',
      BAARALI_INSTANCE_TOKEN: 'secret', FLY_API_TOKEN: 'secret', OPENROUTER_API_KEY: 'secret', API_URL: 'secret',
      NODE_OPTIONS: '--import=/tmp/inject.js', LD_PRELOAD: '/tmp/inject.so',
    }, '/data');
    expect(Object.values(env)).not.toContain('secret');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
    expect(env).not.toHaveProperty('LD_PRELOAD');
    expect(env).toMatchObject({ JAVA_HOME: '/java', GHIDRA_INSTALL_DIR: '/ghidra', REA_JEB_MCP_URL: 'http://127.0.0.1:9999', GHIDRA_HEADLESS_MAXMEM: '512M', REA_JADX_ACTIVE_PROCESSOR_COUNT: '1' });
  });

  it('uses an exact engine version, a distinct executable, and no runtime package runner', async () => {
    const manifest = JSON.parse(await fs.readFile(new URL('../../../engines/rea/package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await fs.readFile(new URL('../../../engines/rea/package-lock.json', import.meta.url), 'utf8'));
    expect(manifest.dependencies['rea-agents']).toBe(REA_VERSION);
    expect(lock.packages['node_modules/rea-agents'].version).toBe(REA_VERSION);
    expect(lock.packages['node_modules/rea-agents'].integrity).toMatch(/^sha512-/);
    expect(reaServer({}, '/data', '/app/rea-main.js')).toMatchObject({ command: '/opt/baarali-rea/bin/node', args: ['--max-old-space-size=384', '/app/rea-main.js'] });
    expect(reaServer({ BAARALI_REA_ENABLED: '0' }, '/data', '/app/rea-main.js')).toBeNull();
  });

  it('seeds the full catalog workflow and can disable only the managed integration', async () => {
    const workDir = await temporary();
    await fs.mkdir(path.join(workDir, 'config'));
    const file = path.join(workDir, 'config/mcp.json');
    const mine = { command: 'my-tool', args: [], env: {} };
    await fs.writeFile(file, JSON.stringify({ extra: true, mcpServers: { mine } }));
    const options = { workDir, instanceToken: 'never-copy-this', assistantModel: 'model' };
    const server = reaServer({}, workDir, '/app/rea-main.js');
    await seedWorkdir({ ...options, reaServer: server });
    let config = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(config).toEqual({ extra: true, mcpServers: { mine, 'baarali-rea': { type: 'stdio', ...server } } });
    expect(await fs.readFile(path.join(workDir, 'skills/baarali-rea/SKILL.md'), 'utf8')).toBe(REA_SKILL);
    expect(JSON.stringify(config)).not.toContain(options.instanceToken);
    await seedWorkdir({ ...options, reaServer: null });
    config = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(config).toEqual({ extra: true, mcpServers: { mine } });
    await expect(fs.access(path.join(workDir, 'skills/baarali-rea/SKILL.md'))).rejects.toThrow();
    await seedWorkdir({ ...options, reaServer: server });
    expect(JSON.parse(await fs.readFile(file, 'utf8')).mcpServers['baarali-rea']).toBeDefined();
  });
});
