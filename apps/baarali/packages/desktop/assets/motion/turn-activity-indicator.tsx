import { BaaraliMark } from '@/components/baarali-mark';

// BAARALI(07/11/2026): before the first step, the same card as the work
// block (components/work-steps.tsx): the B at work, a line that moves.
export function TurnActivityIndicator({ isReasoning }: { isReasoning: boolean }) {
  return <div role="status" className="baarali-work is-active flex w-full max-w-md flex-col">
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-3 text-sm">
      <BaaraliMark motion="loading" size={34} className="shrink-0 text-foreground" />
      <span className="font-medium text-foreground">{isReasoning ? 'Thinking...' : 'Working...'}</span>
    </div>
    <div className="baarali-work-bar mx-4" aria-hidden="true" />
  </div>;
}
