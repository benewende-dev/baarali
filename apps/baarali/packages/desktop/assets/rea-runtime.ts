import container from '../di/container.js';
import type { IMcpConfigRepo } from '../mcp/repo.js';
import { requireWork } from './work-runtime.js';
import { selectReaServers, type ReaAcpServer } from './rea-config.js';
import fs from 'node:fs/promises';

export async function codeReaServers(): Promise<ReaAcpServer[]> {
  const config = await container.resolve<IMcpConfigRepo>('mcpConfigRepo').getConfig();
  const servers = selectReaServers(config.mcpServers);
  if (servers.length) {
    await requireWork();
    try { await fs.access(servers[0].command); }
    catch {
      // BAARALI(15/10/2026): a missing optional analysis executable must
      // not prevent the user's ordinary coding session from opening.
      console.warn('[baarali-rea] Runtime unavailable; Code continues without REA.');
      return [];
    }
  }
  return servers;
}
