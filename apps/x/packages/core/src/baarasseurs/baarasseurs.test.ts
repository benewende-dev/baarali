import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
const { workDir } = vi.hoisted(() => ({ workDir: `/tmp/baarasseurs-test-${process.pid}` }));
vi.mock('../config/config.js', () => ({ WorkDir: workDir }));
vi.mock('../runtime/assembly/copilot/agent.js', () => ({
    buildCopilotAgent: async () => ({
        name: 'rowboatx',
        instructions: 'COPILOT',
        tools: { 'web-search': { type: 'builtin', name: 'web-search' } },
    }),
}));
import { loadAgent } from '../runtime/assembly/registry.js';
import { carriesSkillsForward, hasWorkspaceContext } from '../runtime/assembly/traits.js';
import { rememberFor } from './repo.js';
import { personaInstructions, scheduleCron, parseBaarasseurs, type Baarasseur } from '@x/shared/dist/baarasseur.js';

const mariama: Baarasseur = {
    id: 'mariama', name: 'Mariama', role: 'Commerciale', mission: 'Relance mes prospects.', color: 'clay',
    tools: ['Gmail', 'WhatsApp'], model: 'deepseek/deepseek-v4', provider: 'rowboat',
    schedule: { every: 'week', day: 1, hour: 8 }, memory: [], createdAt: '2026-10-06T10:00:00Z',
};

async function write(list: unknown[]) {
    await fs.mkdir(path.join(workDir, 'config'), { recursive: true });
    await fs.writeFile(path.join(workDir, 'config', 'baarasseurs.json'), JSON.stringify({ baarasseurs: list }));
}

describe('the baarasseurs (06/10/2026)', () => {
    beforeEach(() => write([mariama]));
    afterAll(() => fs.rm(workDir, { recursive: true, force: true }));

    it('loads one as the copilot with its persona, its memory tool and its model', async () => {
        const agent = await loadAgent('baarasseur-mariama');
        expect(agent.instructions.startsWith('COPILOT\n\n# You are Mariama, Commerciale')).toBe(true);
        expect(agent.instructions).toContain('<mission>\nRelance mes prospects.\n</mission>');
        expect(agent.instructions).toContain('every Monday at 8:00');
        expect(Object.keys(agent.tools ?? {})).toEqual(['web-search', 'baarasseur-remember']);
        expect(agent).toMatchObject({ name: 'baarasseur-mariama', model: 'deepseek/deepseek-v4', provider: 'rowboat' });
    });

    it('has the copilot traits, so it keeps the workspace and its skills', () => {
        expect(hasWorkspaceContext('baarasseur-mariama')).toBe(true);
        expect(carriesSkillsForward('baarasseur-mariama')).toBe(true);
    });

    it('hands a removed baarasseur\'s old conversations to the assistant', async () => {
        const agent = await loadAgent('baarasseur-kofi');
        expect(agent).toMatchObject({ name: 'baarasseur-kofi', instructions: 'COPILOT' });
        expect(Object.keys(agent.tools ?? {})).toEqual(['web-search']);
    });

    it('remembers a rule once, keeps the rest of the file, and shows it in the next prompt', async () => {
        await write([mariama, { id: 'ibrahim', name: 'Ibrahim', createdAt: 'x', extra: 1 }]);
        expect(await rememberFor('mariama', '  Livraison offerte   au-delà de 50 sacs ')).toEqual(['Livraison offerte au-delà de 50 sacs']);
        expect(await rememberFor('mariama', 'Livraison offerte au-delà de 50 sacs')).toHaveLength(1);
        expect(await rememberFor('nobody', 'x')).toBeNull();
        const raw = JSON.parse(await fs.readFile(path.join(workDir, 'config', 'baarasseurs.json'), 'utf8'));
        expect(raw.baarasseurs[1]).toEqual({ id: 'ibrahim', name: 'Ibrahim', createdAt: 'x', extra: 1 });
        const agent = await loadAgent('baarasseur-mariama');
        expect(agent.instructions).toContain('- Livraison offerte au-delà de 50 sacs');
    });

    it('turns hours into cron, and forbids sending during a scheduled run', () => {
        expect(scheduleCron({ every: 'day', hour: 7 })).toBe('0 7 * * *');
        expect(scheduleCron({ every: 'weekday', hour: 9 })).toBe('0 9 * * 1-5');
        expect(scheduleCron({ every: 'month', day: 5, hour: 8 })).toBe('0 8 5 * *');
        expect(personaInstructions(mariama)).toContain('never send, publish, post, pay or delete');
        expect(personaInstructions({ ...mariama, schedule: null })).not.toContain('Your hours');
    });

    it('drops a broken entry, not the whole team', () => {
        expect(parseBaarasseurs(JSON.stringify({ baarasseurs: [mariama, { id: 'BAD ID' }] })).map((b) => b.id)).toEqual(['mariama']);
        expect(parseBaarasseurs('not json')).toEqual([]);
    });
});
