import { B_BODY, B_BOX, B_EYES, B_EYE_R, EYES, SHAPES, SHAPE_FILL, type ShapeId } from '@/lib/baarali-b-mark'

// BAARALI(07/11/2026): an agent on the computer as on the phone
// (assets/mobile/agent-shape.tsx): a shape and a colour of the B's family,
// with its two round eyes, which glance and blink now and then. White follows
// the theme (ink on a light page), as the B does.

const INK = '#0A0A0A'

export function AgentShape({ shape, color, size, className }: { shape: ShapeId; color: string; size: number; className?: string }) {
  const white = color === 'white'
  const fill = white ? 'var(--foreground)' : (SHAPE_FILL[color] ?? SHAPE_FILL.clay)
  const eye = white ? 'var(--background)' : fill === INK ? '#FFFFFF' : INK
  const b = shape === 'b'
  const box = b ? `${B_BOX.x} ${B_BOX.y} ${B_BOX.size} ${B_BOX.size}` : '0 0 100 100'
  const d = b ? B_BODY : SHAPES[shape].d
  const e = SHAPES[shape as Exclude<ShapeId, 'b'>]?.eyes ?? EYES
  const eyes: Array<[number, number]> = b ? B_EYES.map(p => [p.cx, p.cy] as [number, number]) : [[e[0], e[1]], [e[2], e[3]]]
  const r = b ? B_EYE_R : 5.2
  return (
    <svg width={size} height={size} viewBox={box} aria-hidden="true" className={className} style={{ overflow: 'visible' }}>
      <path d={d} fill={fill} />
      <g className="baarali-agent-eyes">
        {eyes.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={eye} />)}
      </g>
    </svg>
  )
}

/** The same shape for the same name, every time (as the phone does). */
export function shapeFor(name: string, ids: readonly ShapeId[]): ShapeId {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ids[h % ids.length]
}
