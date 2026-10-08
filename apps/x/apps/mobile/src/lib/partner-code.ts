import { billing as billingShared } from '@x/shared';

// BAARALI(08/10/2026): a creator's partner code on the phone (mockup v2): the
// card on the More tab, its own screen, and the offered days in Settings.

export type PartnerState = billingShared.PartnerCodeState;
export type PartnerCheck = billingShared.PartnerCodeCheck;

const DAY_MS = 86_400_000;

/** What the field holds, as the control plane reads a code. */
export const cleanCode = (raw: string) => raw.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const dayWords = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

/** Whole days left to type a code; at least one while it can be. */
export const daysLeft = (until: string, now = Date.now()) => Math.max(1, Math.ceil((Date.parse(until) - now) / DAY_MS));

/** Which day of the offered plan this is, out of how many. */
export function giftProgress(running: NonNullable<PartnerState['running']>, now = Date.now()) {
  const total = Math.max(1, Math.round((Date.parse(running.endsAt) - Date.parse(running.startsAt)) / DAY_MS));
  const today = Math.min(total, Math.max(1, Math.floor((now - Date.parse(running.startsAt)) / DAY_MS) + 1));
  return { today, total };
}
