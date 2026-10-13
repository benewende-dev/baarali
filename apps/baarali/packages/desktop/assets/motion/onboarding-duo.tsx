import { BaaraliMark } from '@/components/baarali-mark';

// BAARALI(11/10/2026): the approved calm loading loop accompanies onboarding;
// the existing short guidance and its live announcement remain available.
export function Duo({ first, second }: { first: string; second: string | null; motion: 'bob' | 'hop' }) {
  return <div className="relative flex h-[214px] flex-col items-center justify-between">
    <div className="max-w-full rounded-xl rounded-bl border bg-popover px-3 py-2 text-center text-[13px] text-popover-foreground" aria-live="polite">
      {second || first}
    </div>
    <BaaraliMark motion="loading" size={160} className="text-foreground" />
  </div>;
}
