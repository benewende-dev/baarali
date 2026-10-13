import { describe, expect, it } from 'vitest';
import { canUseWork, isWorkRoute } from '../assets/mobile/work-access.js';

const plans = [{ id: 'decouverte', category: 'free' }, { id: 'semaine', category: 'starter' }, { id: 'essentiel', category: 'starter' }, { id: 'pro-100', category: 'pro' }, { id: 'future-paid', category: 'starter' }];
const info = (id: string | null, status: string | null = 'active', expires: string | null = null) => ({ catalog: { plans }, subscriptionPlanId: id, subscriptionStatus: status, trialExpiresAt: expires });

describe('paid Work access', () => {
  it.each(['semaine', 'essentiel', 'pro-100', 'future-paid'])('accepts active paid catalog plan %s', id => expect(canUseWork(info(id))).toBe(true));
  it.each(['decouverte', 'unknown', null])('refuses free, unknown or missing plan %s', id => expect(canUseWork(info(id))).toBe(false));
  it.each(['canceled', 'past_due', 'unpaid', null])('refuses inactive paid plan %s', status => expect(canUseWork(info('essentiel', status))).toBe(false));
  it('refuses unavailable billing', () => expect(canUseWork(null)).toBe(false));
  it('limits a paid-tier trial to its valid expiry', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(canUseWork(info('essentiel', 'trialing', '2026-10-14T12:00:00Z'), now)).toBe(true);
    expect(canUseWork(info('essentiel', 'trialing', '2026-10-12T12:00:00Z'), now)).toBe(false);
    expect(canUseWork(info('essentiel', 'trialing', 'invalid'), now)).toBe(false);
    expect(canUseWork(info('essentiel', 'trialing'), now)).toBe(false);
  });
  it('identifies all Work routes including direct and nested links', () => {
    for (const route of ['/more', '/(tabs)/more', '/projects', '/apps', '/tasks', '/routines', '/baarasseurs/recruit', '/notes/view?path=x', '/studio']) expect(isWorkRoute(route)).toBe(true);
    for (const route of ['/home', '/(tabs)/spaces', '/settings', '/projects-other']) expect(isWorkRoute(route)).toBe(false);
  });
});
