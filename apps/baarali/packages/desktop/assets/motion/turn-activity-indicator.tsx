import { BaaraliMark } from '@/components/baarali-mark';

export function TurnActivityIndicator({ isReasoning }: { isReasoning: boolean }) {
  return <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
    <BaaraliMark motion="loading" size={32} className="text-foreground" />
    <span>{isReasoning ? 'Thinking...' : 'Working...'}</span>
  </div>;
}
