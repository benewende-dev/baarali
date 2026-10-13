import { describe, expect, it } from 'vitest';
import { parseBaarasseurs, saveTeam, upsertChange, type Baarasseur } from './baarasseur.js';

// BAARALI(11/10/2026): avatar edits must survive the shared workspace save
// without losing a rule learned by an agent while its profile was open.
const legacy: Baarasseur = {
    id: 'mariama', name: 'Mariama', color: 'clay', role: '', mission: '',
    tools: [], memory: ['Keep drafts'], createdAt: '2026-10-11T00:00:00Z',
};

describe('agent avatar compatibility', () => {
    it('reads older and future profiles without discarding their agents', () => {
        const team = parseBaarasseurs(JSON.stringify({ baarasseurs: [legacy, { ...legacy, id: 'future', avatar: 'future-avatar' }] }));
        expect(team.map((b) => b.id)).toEqual(['mariama', 'future']);
        expect(team.every((b) => b.avatar === undefined)).toBe(true);
    });

    it('keeps the chosen avatar and new memory across a save and reload, and can restore initials', async () => {
        let file = JSON.stringify({ baarasseurs: [{ ...legacy, memory: ['Keep drafts', 'New client price'] }] });
        const invoke = async (channel: string, args: unknown) => {
            if (channel === 'workspace:readFile') return { data: file };
            if (channel === 'workspace:writeFile') file = (args as { data: string }).data;
            return {};
        };
        await saveTeam(invoke, upsertChange({ ...legacy, avatar: 'street' }), { id: legacy.id }, 'fr');
        const saved = parseBaarasseurs(file)[0];
        expect(saved.avatar).toBe('street');
        expect(saved.memory).toEqual(['Keep drafts', 'New client price']);
        await saveTeam(invoke, upsertChange({ ...saved, avatar: undefined }), { id: legacy.id }, 'fr');
        expect(parseBaarasseurs(file)[0].avatar).toBeUndefined();
    });
});
