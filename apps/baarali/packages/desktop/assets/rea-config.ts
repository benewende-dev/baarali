export const REA_SERVER_NAME = 'baarali-rea';

export const isReaCleanup = (server: string, tool: string, input: Record<string, unknown>): boolean =>
  server === REA_SERVER_NAME && tool === 'close_binary' && Object.keys(input).length === 0;

export interface ReaAcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

// BAARALI(15/10/2026): only the managed analysis server crosses into Code;
// unrelated MCP connections and account credentials stay with their owner.
export function selectReaServers(servers: Record<string, unknown>): ReaAcpServer[] {
  const value = servers[REA_SERVER_NAME];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const server = value as Record<string, unknown>;
  if (typeof server.command !== 'string' || !server.command ||
    server.type !== undefined && server.type !== 'stdio' ||
    server.args !== undefined && (!Array.isArray(server.args) || !server.args.every(a => typeof a === 'string')) ||
    server.env !== undefined && (!server.env || typeof server.env !== 'object' || Array.isArray(server.env) || !Object.values(server.env).every(v => typeof v === 'string'))) return [];
  return [{
    name: REA_SERVER_NAME,
    command: server.command,
    args: [...(server.args as string[] | undefined ?? [])],
    env: Object.entries(server.env ?? {}).map(([name, value]) => ({ name, value: value as string })),
  }];
}
