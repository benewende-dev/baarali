import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { ROOT, corePlan } from '../scripts/brand.mjs';

// BAARALI(13/10/2026): reproduce the Docker branding stage, where the
// full desktop package is absent, to catch missing build inputs before release.
it('applies core branding with only the desktop inputs copied by the instance Dockerfile', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baarali-instance-context-'));
  try {
    for (const file of new Set(corePlan().edits.map((edit: { file: string }) => edit.file))) {
      const dest = path.join(root, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), dest);
    }
    const docker = fs.readFileSync(path.join(ROOT, 'apps/baarali/packages/instance/Dockerfile'), 'utf8');
    const stage = docker.split('RUN node apps/baarali/packages/desktop/scripts/brand.mjs')[0];
    for (const line of stage.split('\n')) {
      const match = /^COPY (apps\/baarali\/packages\/desktop\/\S+) (\S+)$/.exec(line);
      if (!match) continue;
      fs.mkdirSync(path.dirname(path.join(root, match[2])), { recursive: true });
      fs.copyFileSync(path.join(ROOT, match[1]), path.join(root, match[2]));
    }
    const script = path.join(root, 'apps/baarali/packages/desktop/scripts/brand.mjs');
    const { apply } = await import(/* @vite-ignore */ pathToFileURL(script).href);
    expect(() => apply({ root, only: 'core', write: true })).not.toThrow();
    expect(fs.readFileSync(path.join(root, 'apps/x/packages/core/src/baarali/work-runtime.ts'), 'utf8')).toContain('WorkDir');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
