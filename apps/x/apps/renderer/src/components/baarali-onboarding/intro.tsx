import { useEffect, useState } from 'react'
import { B_BODY, B_BOX, B_EYES, B_EYE_R, EYES, SHAPES, SHAPE_FILL, type ShapeId } from '@/lib/baarali-b-mark'

// BAARALI(12/11/2026): the animated onboarding, the same on the phone, the
// computer and the web (the founder's mockup). On the computer it opens the
// first launch, full window: the steps on the left, a stage on the right
// where the shapes float around the person's Baarali. The B wakes up; the
// promise, shown working; the person's Baarali (a shape, a colour); their
// first name, which their Baarali asks for; « Nice to meet you ». Then the
// usual onboarding (index.tsx) signs them in, their name already in it.

/** Played once on this computer. */
export const INTRO_KEY = 'baarali.intro.v1'
/** The person's Baarali, as the phone keeps it (agent-shape.tsx `baarali.look.v1`). */
export const LOOK_KEY = 'baarali.look.v1'

export function introDone(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1' } catch { return true }
}

const INK = '#0A0A0A'
/** The eyes' motions, the B's and a shape's (CSS above). */
const EYE_CLASS = ['bi-eyeB', 'bi-eyeS'] as const
const SHAPE_IDS: ShapeId[] = ['b', 'round', 'pebble', 'dome', 'drop', 'pill', 'square', 'arch', 'bean', 'cloud', 'leaf', 'kite']
const COLORS = ['white', 'brown', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'rose', 'gray']
const STAGE: Array<{ shape: ShapeId; color: string; left: string; top: string; size: number }> = [
  { shape: 'cloud', color: 'violet', left: '10%', top: '14%', size: 64 }, { shape: 'pebble', color: 'orange', left: '78%', top: '12%', size: 54 },
  { shape: 'drop', color: 'blue', left: '14%', top: '70%', size: 58 }, { shape: 'kite', color: 'green', left: '80%', top: '66%', size: 50 },
  { shape: 'dome', color: 'rose', left: '46%', top: '84%', size: 44 }, { shape: 'leaf', color: 'teal', left: '52%', top: '6%', size: 40 },
]
type Step = 'hello' | 'promise' | 'look' | 'name' | 'ready'
const STEPS: Step[] = ['hello', 'promise', 'look', 'name', 'ready']

/** For text built here, which the French layer does not see in pieces (desktop i18n/index.ts). */
const say = (text: string) => (window as { __baaraliText?: (t: string) => string }).__baaraliText?.(text) ?? text

const CSS = `
@keyframes bi-pop{0%{opacity:0;transform:scale(.4) translateY(18px)}70%{opacity:1;transform:scale(1.08) translateY(-4px)}100%{opacity:1;transform:none}}
@keyframes bi-rise{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}
@keyframes bi-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes bi-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(10px,-14px)}}
@keyframes bi-hop{0%,100%{transform:translateY(0)}30%{transform:translateY(-30px)}55%{transform:translateY(0)}70%{transform:translateY(-9px)}}
@keyframes bi-lookB{0%,16%{transform:translate(0,0) scaleY(1)}22%,38%{transform:translate(-13px,3px)}44%,60%{transform:translate(13px,-2px)}66%{transform:translate(0,0) scaleY(1)}69%{transform:scaleY(.12)}72%,100%{transform:translate(0,0) scaleY(1)}}
@keyframes bi-lookS{0%,16%{transform:translate(0,0) scaleY(1)}22%,38%{transform:translate(-3px,1px)}44%,60%{transform:translate(3px,-1px)}66%{transform:translate(0,0) scaleY(1)}69%{transform:scaleY(.12)}72%,100%{transform:translate(0,0) scaleY(1)}}
@keyframes bi-fill{0%{width:0%}100%{width:100%}}
@keyframes bi-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.45)}50%{box-shadow:0 0 0 8px rgba(255,255,255,0)}}
@keyframes bi-dash{0%,100%{opacity:.25}50%{opacity:1}}
.bi-pop{animation:bi-pop .7s cubic-bezier(.2,.9,.3,1.2) both}
.bi-rise{animation:bi-rise .6s ease-out both}
.bi-bob{animation:bi-bob 3s ease-in-out infinite}
.bi-drift{animation:bi-drift 7s ease-in-out infinite}
.bi-hop{animation:bi-hop 1.6s ease-in-out infinite}
.bi-eyeB{animation:bi-lookB 6s infinite;transform-box:fill-box;transform-origin:center}
.bi-eyeS{animation:bi-lookS 5s infinite;transform-box:fill-box;transform-origin:center}
.bi-bar{animation:bi-fill 2.6s ease-in-out infinite}
.bi-pulse{animation:bi-pulse 1.8s ease-out infinite}
.bi-dot{animation:bi-dash 1.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.bi-root *{animation:none !important}}
`

/** A Baarali shape whose eyes glance and blink, as on the phone. */
function Shape({ shape, color, size }: { shape: ShapeId; color: string; size: number }) {
  const fill = SHAPE_FILL[color] ?? SHAPE_FILL.clay
  const b = shape === 'b'
  const box = b ? `${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}` : '0 0 100 100'
  const e = b ? null : (SHAPES[shape as Exclude<ShapeId, 'b'>].eyes ?? EYES)
  const eyes: Array<[number, number]> = b ? B_EYES.map(p => [p.cx, p.cy] as [number, number]) : [[e![0], e![1]], [e![2], e![3]]]
  return (
    <svg width={size} height={size} viewBox={box} aria-hidden="true">
      <path d={b ? B_BODY : SHAPES[shape as Exclude<ShapeId, 'b'>].d} fill={fill} />
      {eyes.map(([cx, cy], i) => <circle key={i} className={EYE_CLASS[b ? 0 : 1]} cx={cx} cy={cy} r={b ? B_EYE_R : 5.2} fill={fill === INK ? '#FFFFFF' : INK} />)}
    </svg>
  )
}

/** Words that come one letter after the other. */
function Typed({ text }: { text: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setCount(text.length); return }
    setCount(0)
    let timer = 0
    const start = window.setTimeout(() => { timer = window.setInterval(() => setCount(n => (n >= text.length ? n : n + 1)), 28) }, 500)
    return () => { window.clearTimeout(start); window.clearInterval(timer) }
  }, [text])
  return <p data-no-translate aria-label={text} className="m-0 text-base leading-relaxed text-white">{text.slice(0, count)}<span className="opacity-0">{text.slice(count)}</span></p>
}

const button = 'h-12 rounded-xl bg-white px-6 text-[15px] font-semibold text-[#0A0A0A] transition-opacity hover:opacity-90 disabled:opacity-50'
const ghost = 'h-12 rounded-xl border border-[#3A3A3C] px-5 text-[15px] font-medium text-white hover:bg-white/5'

export function BaaraliIntro({ onDone }: { onDone: (result: { name: string }) => void }) {
  const [step, setStep] = useState<Step>('hello')
  const [shape, setShape] = useState<ShapeId>('b')
  const [color, setColor] = useState('white')
  const [name, setName] = useState('')
  const [pick, setPick] = useState(0)
  const index = STEPS.indexOf(step)
  const go = (n: number) => setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, n))])

  const finish = () => {
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify({ shape, color }))
      localStorage.setItem(INTRO_KEY, '1')
    } catch { /* a private window: the intro plays again */ }
    onDone({ name: name.trim() })
  }

  const nav = (label: string, next: () => void) => (
    <div className="mt-2 flex gap-2.5">
      {index > 0 && <button type="button" className={ghost} onClick={() => go(index - 1)}>Back</button>}
      <button type="button" className={button} onClick={next}>{label}</button>
    </div>
  )

  return (
    <div className="bi-root fixed inset-0 z-[60] flex flex-col bg-[#111111] font-sans text-white" role="dialog" aria-modal="true" aria-label="Welcome to Baarali">
      <style>{CSS}</style>
      <div className="flex min-h-0 flex-1 flex-wrap">
        {/* The step */}
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6 px-14 py-10">
          <div className="flex items-center gap-2.5">
            <Shape shape="b" color="white" size={26} />
            <span className="text-[17px] font-bold">Baarali</span>
            <span className="flex-1" />
            <span className="text-[12.5px] text-[#8E8E93]" data-no-translate>{say(`Step ${index + 1} of ${STEPS.length}`)}</span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => <div key={s} className={`h-[3px] flex-1 rounded ${i <= index ? 'bg-white' : 'bg-[#2C2C2E]'}`} />)}
          </div>

          {step === 'hello' && (
            <div key="hello" className="flex flex-1 flex-col justify-center gap-5">
              <h1 className="bi-rise m-0 font-serif text-[44px] font-medium leading-[50px]">Welcome to Baarali</h1>
              <p className="bi-rise m-0 max-w-[440px] text-[17px] leading-[26px] text-[#B5B5B5]" style={{ animationDelay: '150ms' }}>Agents that work for you, on your computer and everywhere else. You stay in control.</p>
              <div className="bi-rise mt-2.5" style={{ animationDelay: '300ms' }}>{nav('Get started', () => go(1))}</div>
            </div>
          )}

          {step === 'promise' && (
            <div key="promise" className="flex flex-1 flex-col justify-center gap-5">
              <h2 className="bi-rise m-0 font-serif text-[38px] font-medium leading-[44px]">They work.<br />You decide.</h2>
              <ol className="bi-rise m-0 flex list-none flex-col gap-3 p-0" style={{ animationDelay: '150ms' }}>
                {['Your agents do the work: quotes, follow-ups, books, meetings.', 'Nothing goes out without your approval.', 'The same conversation on your computer, your phone and the web.'].map((t, i) => (
                  <li key={t} className="flex items-start gap-3"><span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#0A0A0A]">{i + 1}</span><span className="text-[15.5px] leading-[22px] text-[#D6D6D6]">{t}</span></li>
                ))}
              </ol>
              {nav('Continue', () => go(2))}
            </div>
          )}

          {step === 'look' && (
            <div key="look" className="flex flex-1 flex-col justify-center gap-4">
              <h2 className="bi-rise m-0 text-[30px] font-semibold">Choose your Baarali</h2>
              <p className="bi-rise m-0 text-[15px] text-[#B5B5B5]" style={{ animationDelay: '120ms' }}>Its face in the app. You can change it later.</p>
              <div role="radiogroup" aria-label="Shape" className="grid max-w-[420px] grid-cols-6 gap-1.5">
                {SHAPE_IDS.map(id => (
                  <button key={id} type="button" role="radio" aria-checked={shape === id} aria-label={id} onClick={() => { setShape(id); setPick(p => p + 1) }}
                    className={`flex h-14 items-center justify-center rounded-[14px] border-2 bg-[#1C1C1E] ${shape === id ? 'border-white' : 'border-transparent'}`}>
                    <Shape shape={id} color={color} size={34} />
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label="Colour" className="flex max-w-[420px] flex-wrap gap-1.5">
                {COLORS.map(c => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => { setColor(c); setPick(p => p + 1) }}
                    className={`flex size-[38px] items-center justify-center rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}>
                    <span className="size-7 rounded-full" style={{ background: SHAPE_FILL[c] }} />
                  </button>
                ))}
              </div>
              {nav('Continue', () => go(3))}
            </div>
          )}

          {step === 'name' && (
            <div key="name" className="flex max-w-[440px] flex-1 flex-col justify-center gap-3.5">
              <h2 className="bi-rise m-0 text-[30px] font-semibold">What should we call you?</h2>
              <p className="bi-rise m-0 text-[15px] text-[#B5B5B5]" style={{ animationDelay: '120ms' }}>Your Baarali will remember it in all your conversations.</p>
              <label htmlFor="baarali-intro-name" className="mt-2 text-[13px] text-[#8E8E93]">Your first name</label>
              <input id="baarali-intro-name" autoFocus value={name} onChange={e => setName(e.target.value.slice(0, 40))} onKeyDown={e => { if (e.key === 'Enter') go(4) }}
                autoComplete="given-name" placeholder="Your first name"
                className="-mt-1.5 h-[50px] rounded-xl border border-[#3A3A3C] bg-[#1C1C1E] px-3.5 text-[17px] font-medium text-white outline-none focus:border-[#8E8E93]" />
              {nav('Continue', () => go(4))}
            </div>
          )}

          {step === 'ready' && (
            <div key="ready" className="flex flex-1 flex-col justify-center gap-4">
              <h2 className="bi-rise m-0 font-serif text-[40px] font-medium" data-no-translate>{name.trim() ? say('Nice to meet you, $1.').replace('$1', name.trim()) : say('Nice to meet you.')}</h2>
              <p className="bi-rise m-0 max-w-[420px] text-base leading-6 text-[#B5B5B5]" style={{ animationDelay: '150ms' }}>Your Baarali is ready. Let’s keep your account, then tell it what to do.</p>
              <div className="bi-rise" style={{ animationDelay: '300ms' }}>{nav('Create my account', finish)}</div>
            </div>
          )}
        </div>

        {/* The stage */}
        <div className="relative flex min-h-[520px] min-w-0 flex-[999_1_480px] items-center justify-center overflow-hidden border-l border-[#1E1E1E] bg-[#0A0A0A]" aria-hidden="true">
          {STAGE.map((s, i) => (
            <div key={s.shape} className="bi-drift absolute opacity-90" style={{ left: s.left, top: s.top, animationDelay: `${i * 900}ms` }}>
              <div className="bi-pop" style={{ animationDelay: `${500 + i * 160}ms` }}><Shape shape={s.shape} color={s.color} size={s.size} /></div>
            </div>
          ))}

          {step === 'hello' && <div className="bi-pop" style={{ animationDelay: '150ms' }}><div className="bi-bob"><Shape shape="b" color="white" size={190} /></div></div>}

          {step === 'promise' && (
            <div className="relative flex w-[380px] flex-col gap-3.5">
              <div className="bi-rise flex flex-col gap-3 rounded-[18px] bg-[#1C1C1E] p-4" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-2.5">
                  <div className="bi-bob"><Shape shape="pebble" color="orange" size={36} /></div>
                  <div className="flex-1"><div className="text-[15px] font-semibold">Mariama</div><div className="text-[13px] text-[#B5B5B5]">Preparing this week's quotes</div></div>
                  <span className="text-xs text-[#B5B5B5]">At work</span>
                </div>
                <div className="h-1 overflow-hidden rounded bg-[#2C2C2E]"><div className="bi-bar h-1 bg-white" /></div>
              </div>
              <div className="bi-rise ml-10 flex flex-col gap-3 rounded-[18px] bg-[#1C1C1E] p-4" style={{ animationDelay: '650ms' }}>
                <div className="flex items-center gap-2 text-[13px] text-[#FFA31A]"><span className="bi-dot size-2 rounded-full bg-[#FFA31A]" />Waiting for your approval</div>
                <div className="text-[15px]">Send the 3 follow-ups to clients?</div>
                <div className="flex gap-2"><span className="flex h-9 flex-1 items-center justify-center rounded-[10px] border border-[#3A3A3C] text-sm">Decline</span><span className="bi-pulse flex h-9 flex-1 items-center justify-center rounded-[10px] bg-white text-sm font-semibold text-[#0A0A0A]">Accept</span></div>
              </div>
              <div className="bi-rise flex items-center gap-2.5 rounded-[18px] bg-[#1C1C1E] px-4 py-3.5" style={{ animationDelay: '1100ms' }}>
                <span className="bi-dot size-1.5 rounded-full bg-white" /><span className="bi-dot size-1.5 rounded-full bg-white" style={{ animationDelay: '300ms' }} /><span className="bi-dot size-1.5 rounded-full bg-white" style={{ animationDelay: '600ms' }} />
                <span className="text-[13.5px] text-[#B5B5B5]">Synced everywhere</span>
              </div>
            </div>
          )}

          {(step === 'look' || step === 'name' || step === 'ready') && (
            <div className="relative flex flex-col items-center gap-6">
              {step === 'name' && (
                <div className="bi-rise max-w-[340px] rounded-[20px] rounded-bl-md bg-[#1C1C1E] px-[18px] py-3.5" style={{ animationDelay: '300ms' }}>
                  <Typed text={say("Hi, I'm your Baarali. What should I call you?")} />
                </div>
              )}
              <div key={`${shape}-${color}-${pick}`} className="bi-pop"><div className={step === 'ready' ? 'bi-hop' : 'bi-bob'}><Shape shape={shape} color={color} size={200} /></div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
