import { describe, expect, it } from 'vitest';
import { usedPercent, usageMetrics } from '../assets/mobile/usage-metrics.js';
describe('mobile quota windows', () => {
  it('bounds consumption and handles a plan without an allowance', () => {
    expect(usedPercent({ sanctionedCredits: 100, usedCredits: 150 })).toBe(100);
    expect(usedPercent({ sanctionedCredits: 100, usedCredits: -5 })).toBe(0);
    expect(usedPercent({ sanctionedCredits: 0, usedCredits: 10 })).toBe(0);
  });
  it('clears an expired session while preserving weekly use', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    const info = { daily: { sanctionedCredits: 100, usedCredits: 80, resetsAt: '2026-10-13T12:00:00Z' }, monthly: { sanctionedCredits: 100, usedCredits: 8 } };
    expect(usageMetrics(info, now)).toEqual({ sessionOpen: false, session: 0, week: 8 });
    expect(usageMetrics(info, now - 1)).toEqual({ sessionOpen: true, session: 80, week: 8 });
    expect(usageMetrics({ ...info, daily: { ...info.daily, resetsAt: 'invalid' } }, now).sessionOpen).toBe(false);
  });
});
