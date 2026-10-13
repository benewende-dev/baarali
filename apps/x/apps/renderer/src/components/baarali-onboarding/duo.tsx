import { useEffect, useRef, useState } from 'react'
import mascot from '@/assets/brand/mascot-furry.png'

// BAARALI(11/10/2026): the approved furry guide replaces the B duo; the B
// remains an agent avatar. Motion pauses off screen and in the background.
const CSS = `
.bd-stage{position:relative;height:214px}
.bd-duo{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:150px;height:150px}
.bd-body{display:block;width:100%;height:100%;object-fit:contain;transform-origin:50% 90%;animation:bd-bob 3.6s ease-in-out infinite}
.bd-hop .bd-body{animation:bd-hop 1.1s ease both}
.bd-stage[data-paused="true"] .bd-body,.bd-stage[data-paused="true"] .bd-dots i{animation-play-state:paused}
@keyframes bd-bob{50%{transform:translateY(-3px) rotate(1deg) scaleY(1.01)}}
@keyframes bd-hop{15%{transform:translateY(3px) scaleY(.93)}38%{transform:translateY(-16px) rotate(5deg)}60%{transform:rotate(-3deg) scaleY(.97)}80%{transform:translateY(-7px) rotate(3deg)}}
.bd-bubble{position:absolute;left:0;right:0;top:0;margin:0 auto;width:max-content;max-width:100%;font-size:13px;line-height:1.35;padding:8px 12px;border-radius:12px;border-bottom-left-radius:4px;text-align:center}
.bd-dots{display:inline-flex;gap:3px;padding:3px 0}
.bd-dots i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.4;animation:bd-dot 1s infinite}
.bd-dots i:nth-child(2){animation-delay:.15s}.bd-dots i:nth-child(3){animation-delay:.3s}
@keyframes bd-dot{40%{opacity:1;transform:translateY(-2px)}}
@media(prefers-reduced-motion:reduce){.bd-body,.bd-dots i{animation:none!important}}
`

export function Duo({ first, second, motion }: { first: string; second: string | null; motion: 'bob' | 'hop' }) {
  const stage=useRef<HTMLDivElement>(null)
  const [typing,setTyping]=useState(false)
  useEffect(()=>{
    if(matchMedia('(prefers-reduced-motion:reduce)').matches)return
    setTyping(true)
    const timer=setTimeout(()=>setTyping(false),480)
    return ()=>clearTimeout(timer)
  },[first,second])
  useEffect(()=>{
    const el=stage.current
    if(!el)return
    let visible=true
    const pause=()=>{el.dataset.paused=String(!visible||document.hidden)}
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;pause()})
    observer.observe(el);document.addEventListener('visibilitychange',pause)
    return ()=>{observer.disconnect();document.removeEventListener('visibilitychange',pause)}
  },[])
  return (
    <div className="bd-stage" ref={stage}>
      <style>{CSS}</style>
      <div className="bd-bubble border bg-popover text-popover-foreground" aria-live="polite">
        {typing ? <span className="bd-dots" aria-label="…"><i /><i /><i /></span> : second || first}
      </div>
      <div className={`bd-duo bd-${motion}`}><img className="bd-body" src={mascot} alt="" aria-hidden="true" /></div>
    </div>
  )
}
