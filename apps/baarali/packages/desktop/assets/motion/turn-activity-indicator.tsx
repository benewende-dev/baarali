import { BaaraliMark } from '@/components/baarali-mark';

// BAARALI(07/11/2026): before the first step, what the work block shows.
// BAARALI(08/11/2026): its status line, as Claude Code (components/work-steps.tsx):
// the B at work, what it is doing, from the moment the message leaves.
export function TurnActivityIndicator({ isReasoning }: { isReasoning: boolean }) {
  return <div role="status" className="baarali-work is-active flex min-w-0 items-center gap-2.5 text-sm">
    <span className="flex size-6 shrink-0 items-center justify-center">
      <BaaraliMark motion="loading" size={22} className="text-foreground" />
    </span>
    <span className="baarali-shimmer shrink-0 font-medium text-foreground">{isReasoning ? 'Thinking...' : 'Working...'}</span>
    {!isReasoning && <span className="min-w-0 truncate text-muted-foreground">Getting ready</span>}
  </div>;
}
