import { useEffect, useRef } from 'react';
import { DURATION, OVALS, markPose, type MarkMotion } from '@/lib/baarali-oval-motion';

export function BaaraliMark({ motion = 'static', size = 40, className }: {
  motion?: MarkMotion; size?: number; className?: string;
}) {
  const stage = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = stage.current;
    if (!svg) return;
    const parts = Array.from(svg.querySelectorAll('ellipse'));
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const draw = (phase: number) => parts.forEach((part, i) => {
      const p = markPose(media?.matches ? 'static' : motion, phase, i);
      part.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.a * 180 / Math.PI}) scale(${p.sx} ${p.sy})`);
    });
    let visible = true, frame = 0, elapsed = 0, previous = 0;
    const tick = (now: number) => {
      if (previous) elapsed += Math.min(80, now - previous);
      previous = now;
      draw((elapsed % DURATION[motion]) / DURATION[motion]);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (media?.matches || motion === 'static') { draw(0); return; }
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    draw(0);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer?.observe(svg);
    media?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      media?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [motion]);
  return <svg ref={stage} viewBox="-240 -240 480 480" width={size} height={size}
    className={className} aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    {OVALS.map((p, i) => <ellipse key={i} rx={p.rx} ry={p.ry} fill="currentColor"
      transform={`translate(${p.x} ${p.y}) rotate(${p.a * 180 / Math.PI})`} />)}
  </svg>;
}
