// BAARALI(13/10/2026): the mobile meters use the desktop's 5-hour session
// and weekly semantics. An expired session is not presented as consumed.
export function usedPercent(bucket: { sanctionedCredits: number; usedCredits: number }): number {
  return bucket.sanctionedCredits > 0 ? Math.min(100, Math.max(0, Math.round(bucket.usedCredits / bucket.sanctionedCredits * 100))) : 0;
}
export function usageMetrics(info: { daily: { sanctionedCredits: number; usedCredits: number; resetsAt?: string }; monthly: { sanctionedCredits: number; usedCredits: number } }, now: number) {
  const sessionOpen = Boolean(info.daily.resetsAt && Date.parse(info.daily.resetsAt) > now);
  return { sessionOpen, session: sessionOpen ? usedPercent(info.daily) : 0, week: usedPercent(info.monthly) };
}
