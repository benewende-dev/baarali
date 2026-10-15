import { startRea } from './rea.js';

try {
  process.exitCode = await startRea();
} catch {
  // BAARALI(15/10/2026): a missing/broken optional engine must fail its MCP
  // connection only, never prevent rowboat-server or the account from booting.
  process.stderr.write('Baarali REA runtime is unavailable; verify its pinned installation and workspace.\n');
  process.exitCode = 1;
}
