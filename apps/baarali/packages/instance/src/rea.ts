import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { BoundedReaTransport, type ReaTransport } from './rea-transport.js';

// BAARALI(15/10/2026): REA owns a separate Node/dependency tree so its
// releases cannot upgrade Baarali's Zod, SDK or runtime underneath a user.
export const REA_VERSION = '6.5.0';
export const REA_SERVER_NAME = 'baarali-rea';
export const REA_ROOT = '/opt/baarali-rea';
export const REA_NODE = `${REA_ROOT}/bin/node`;
export const REA_TOOL_TIMEOUT_MS = 600_000;

export interface ReaServer {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function reaEnvironment(source: NodeJS.ProcessEnv, workDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && (/^(REA_|GHIDRA_|HOPPER_)/.test(key) ||
      ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'JAVA_HOME', 'DISPLAY', 'XDG_RUNTIME_DIR'].includes(key))) {
      result[key] = value;
    }
  }
  // These are per-process heap budgets, not promises about total resident RAM.
  result.GHIDRA_HEADLESS_MAXMEM = '512M';
  result.REA_JADX_HEAP_MIB = '512';
  result.REA_JADX_ACTIVE_PROCESSOR_COUNT = '1';
  result.ROWBOAT_WORKDIR = workDir;
  result.BAARALI_REA_ROOT = source.BAARALI_REA_ROOT ?? REA_ROOT;
  result.REA_MCP_INPUT_SCHEMA_PROFILE = 'compact';
  result.REA_LOG_LEVEL = 'warn';
  return result;
}

export function reaServer(source: NodeJS.ProcessEnv, workDir: string, launcher: string): ReaServer | null {
  if (source.BAARALI_REA_ENABLED === '0') return null;
  return {
    command: source.BAARALI_REA_NODE ?? REA_NODE,
    args: ['--max-old-space-size=384', launcher],
    env: reaEnvironment(source, workDir),
  };
}

export async function startRea(environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  const root = environment.BAARALI_REA_ROOT ?? REA_ROOT;
  if (!path.isAbsolute(root)) throw new Error('REA runtime path must be absolute');
  const pkg = path.join(root, 'node_modules', 'rea-agents');
  const metadata = JSON.parse(await fs.readFile(path.join(pkg, 'package.json'), 'utf8'));
  if (metadata.name !== 'rea-agents' || metadata.version !== REA_VERSION) {
    throw new Error(`REA runtime must match the validated version ${REA_VERSION}`);
  }
  const workDir = environment.ROWBOAT_WORKDIR;
  if (!workDir || !path.isAbsolute(workDir)) throw new Error('REA needs an absolute workspace path');
  await fs.mkdir(workDir, { recursive: true });
  process.chdir(workDir);
  const selected = reaEnvironment(environment, workDir);
  // The native bridges inherit REA's environment. Never forward Fly, billing,
  // model-provider credentials, NODE_OPTIONS or injection hooks to them.
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, selected);
  const { run } = await import(pathToFileURL(path.join(pkg, 'dist', 'main.js')).href);
  const require = createRequire(path.join(root, 'package.json'));
  const { serveStdio } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/server/stdio')).href);
  return run({
    env: selected,
    writeStderr: (text: string) => process.stderr.write(text),
    setExitCode: (code: number) => { process.exitCode = code; },
    registerShutdown: (handler: () => void) => {
      process.once('SIGINT', handler);
      process.once('SIGTERM', handler);
      process.stdin.once('end', handler);
      process.stdin.once('close', handler);
      return () => {
        process.off('SIGINT', handler);
        process.off('SIGTERM', handler);
        process.stdin.off('end', handler);
        process.stdin.off('close', handler);
      };
    },
    serve: (factory: () => { connect(transport: ReaTransport): unknown }, options: unknown) => serveStdio(() => {
      const server = factory();
      const connect = server.connect.bind(server);
      server.connect = transport => connect(new BoundedReaTransport(transport));
      return server;
    }, options),
  });
}
