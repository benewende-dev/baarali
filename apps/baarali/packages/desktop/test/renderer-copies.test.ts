// BAARALI(08/11/2026): Baarali's own renderer files kept in apps/x (work-steps.tsx,
// baarasseurs-view.tsx) draw the B and the agents' shapes, so apps/x keeps a copy
// of those three modules: its unbranded build (the Electron smoke test) needs
// them. scripts/brand.mjs still copies the sources over them; this keeps the
// copies the same as their sources.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('the renderer copies of the B', () => {
  it.each([
    ['apps/baarali/packages/desktop/assets/motion/baarali-mark.tsx', 'apps/x/apps/renderer/src/components/baarali-mark.tsx'],
    ['apps/baarali/packages/desktop/assets/desktop/agent-shape.tsx', 'apps/x/apps/renderer/src/components/baarali-agent-shape.tsx'],
    ['apps/baarali/packages/control/src/b-mark.ts', 'apps/x/apps/renderer/src/lib/baarali-b-mark.ts'],
  ])('%s is copied as is', (source, copy) => {
    expect(read(copy)).toBe(read(source));
  });
});
