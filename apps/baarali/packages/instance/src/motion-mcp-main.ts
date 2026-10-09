import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createMcpHandler, serveStdio } from './media-mcp.js';
import { createMotionTools } from './motion-mcp.js';

// Entry point rowboat-server spawns for the `baarali-motion` MCP server
// (seed.ts registers it, 08/10/2026). Exports go through the control plane
// with the instance's session, read from oauth.json as baarali-media does.
// stdout is the protocol: anything else goes to stderr.

const workDir = process.env.ROWBOAT_WORKDIR ?? '/data';
const controlUrl = (process.env.API_URL ?? '').replace(/\/+$/, '');

async function instanceToken(): Promise<string | null> {
  try {
    const oauth = JSON.parse(await fs.readFile(path.join(workDir, 'config', 'oauth.json'), 'utf8')) as {
      providers?: { rowboat?: { tokens?: { access_token?: unknown } } };
    };
    const token = oauth.providers?.rowboat?.tokens?.access_token;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

// Without a session the templates still work; only `render` says it cannot export.
const token = controlUrl ? await instanceToken() : null;
serveStdio(
  createMcpHandler(
    createMotionTools({
      workDir,
      now: Date.now,
      control: token ? { url: controlUrl, token, fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) } : undefined,
    }),
    { name: 'baarali-motion', version: '0.0.4' },
  ),
);
