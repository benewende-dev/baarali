import { describe, expect, it } from 'vitest';
import type { Notice } from '@x/shared/dist/billing.js';
import { freshNotices } from './fresh-notices.js';

const T = Date.UTC(2026, 9, 7, 18, 0, 0);
const n = (id: string, at: number, read = false): Notice => ({
    id, title: id, body: '', button: null, target: 'none', link: null, sentAt: new Date(at).toISOString(), read,
});

describe('freshNotices', () => {
    it('shows only the unread sent since, oldest first, three at most', () => {
        const list = [n('old', T - 1), n('read', T + 1, true), n('a', T + 2), n('b', T + 3), n('c', T + 4), n('d', T + 5)];
        expect(freshNotices(list, T).map((x) => x.id)).toEqual(['b', 'c', 'd']);
        expect(freshNotices(list, T + 5)).toEqual([]);
    });
});
