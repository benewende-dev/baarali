// BAARALI(13/10/2026): Work belongs to paid plan categories from the
// authoritative billing catalog, never to a client-maintained list of ids.
export function canUseWork(info: {
  subscriptionPlanId: string | null;
  subscriptionStatus: string | null;
  trialExpiresAt?: string | null;
  catalog: { plans: Array<{ id: string; category: string }> };
} | null, now = Date.now()): boolean {
  if (!info?.subscriptionPlanId) return false;
  const category = info.catalog.plans.find(plan => plan.id === info.subscriptionPlanId)?.category;
  if (category !== 'starter' && category !== 'pro') return false;
  if (info.subscriptionStatus === 'active') return true;
  return info.subscriptionStatus === 'trialing' && Boolean(info.trialExpiresAt) && Date.parse(info.trialExpiresAt!) > now;
}

export const WORK_ROUTES = ['/more', '/projects', '/apps', '/tasks', '/routines', '/baarasseurs', '/notes', '/studio'] as const;
export function isWorkRoute(path: string): boolean {
  const clean = path.replace('/(tabs)', '').split('?')[0];
  return WORK_ROUTES.some(route => clean === route || clean.startsWith(`${route}/`));
}
