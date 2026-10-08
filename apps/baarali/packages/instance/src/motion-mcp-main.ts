import process from 'node:process';
import { createMcpHandler, serveStdio } from './media-mcp.js';
import { createMotionTools } from './motion-mcp.js';

// Entry point rowboat-server spawns for the `baarali-motion` MCP server
// (seed.ts registers it, 08/10/2026). stdout is the protocol: anything else
// goes to stderr.

const workDir = process.env.ROWBOAT_WORKDIR ?? '/data';
serveStdio(createMcpHandler(createMotionTools({ workDir, now: Date.now }), { name: 'baarali-motion', version: '0.0.1' }));
