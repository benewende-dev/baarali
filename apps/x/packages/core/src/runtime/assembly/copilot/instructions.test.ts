import { describe, expect, it } from 'vitest';
import { buildStaticInstructions } from './instructions.js';

describe('copilot instructions, Studio Motion', () => {
  it('sends animated videos to the motion skill where it is installed', () => {
    const catalog = '## Motion design\n- **Skill file:** `/data/skills/baarali-motion/SKILL.md`\n';
    const text = buildStaticInstructions(false, catalog);
    expect(text).toContain("your FIRST action MUST be `loadSkill('baarali-motion')`");
    expect(text).toContain('NEVER make such a video yourself');
  });

  it('says nothing of it elsewhere', () => {
    expect(buildStaticInstructions(false, '## Images\n')).not.toContain('baarali-motion');
  });
});
