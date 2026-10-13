import { getBillingInfo } from '../billing/billing.js';
import { getAccessToken } from '../auth/tokens.js';
import { WorkDir } from '../config/config.js';
import { createWorkGuard, workChannel, reservedWorkPath as reservedPath } from './work-policy.js';
export { WorkAccessError, WorkCheckError, freeMediaServer } from './work-policy.js';
export const reservedWorkPath = (value: unknown): boolean => reservedPath(value, WorkDir);
export const requireWork = createWorkGuard(getBillingInfo, getAccessToken);
export async function requireWorkChannel(channel: string, args: unknown): Promise<void> {
  if (workChannel(channel, args, WorkDir)) await requireWork();
}
