import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ASSUMPTIONS, OFFERS } from '../src/catalog.js';
import { plansFrom } from '../src/pricing.js';
import { MemoryStore } from '../src/store.js';

// BAARALI(08/11/2026): Baarali in the browser (chat.baarali.com) calls the
// control plane from another origin; only the origins configured may.
const plans = plansFrom(OFFERS, ASSUMPTIONS);
const make = (webOrigins?: string[]) => createApp({
  store: new MemoryStore(new Map(), plans), openRouterKey: 'or', publicUrl: 'https://app.baarali.test', appName: 'Baarali',
  mediaPacks: [], webOrigins, fetch: (async () => new Response('{}')) as typeof fetch, now: Date.now,
});
const WEB = 'https://chat.baarali.test';

describe('Baarali in the browser', () => {
  it('answers the preflight of the configured origin, for sign-in, the API and the gateway', async () => {
    const app = make([WEB]);
    for (const path of ['/auth/v1/email-otp/send-verification-otp', '/v1/devices', '/instance/rpc']) {
      const res = await app.request(path, { method: 'OPTIONS', headers: { origin: WEB, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
      expect(res.status, path).toBe(204);
      expect(res.headers.get('access-control-allow-origin'), path).toBe(WEB);
      expect(res.headers.get('access-control-allow-headers'), path).toMatch(/authorization/);
      expect(res.headers.get('access-control-allow-credentials'), path).toBeNull();
    }
  });

  it('lets the page read the session token a sign-in sends back', async () => {
    const res = await make([WEB]).request('/v1/config', { headers: { origin: WEB } });
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(res.headers.get('access-control-expose-headers')).toMatch(/set-auth-token/);
  });

  it('opens to no other origin, and to none when unset', async () => {
    const other = await make([WEB]).request('/v1/config', { headers: { origin: 'https://evil.test' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const unset = await make().request('/v1/config', { headers: { origin: WEB } });
    expect(unset.headers.get('access-control-allow-origin')).toBeNull();
  });
});
