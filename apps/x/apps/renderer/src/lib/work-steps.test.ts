import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/lib/chat-conversation'
import { hasActiveWork, segmentTurns, stepTitle } from '@/lib/work-steps'

let t = 0
const user = (content: string): ConversationItem => ({ id: `u${++t}`, role: 'user', content, timestamp: t * 1000 })
const say = (content: string, streaming = false): ConversationItem => ({ id: `a${++t}`, role: 'assistant', content, timestamp: t * 1000, streaming })
const tool = (name: string, status: 'completed' | 'error' | 'running' = 'completed'): ConversationItem => ({ id: `t${++t}`, name, input: {}, status, timestamp: t * 1000 })
const think = (content: string): ConversationItem => ({ id: `r${++t}`, kind: 'reasoning', content, timestamp: t * 1000 })
const done = (): ConversationItem => ({ id: `d${++t}`, kind: 'turn-usage', usage: { inputTokens: 1, outputTokens: 1 } as never, modelCallCount: 1, timestamp: t * 1000 })

describe('stepTitle', () => {
  it('keeps the first sentence, without markdown', () => {
    expect(stepTitle('**Template posé.** Je le réécris à la main.')).toEqual({ title: 'Template posé.', cut: true })
    expect(stepTitle('Contrôle OK')).toEqual({ title: 'Contrôle OK', cut: false })
    expect(stepTitle('a '.repeat(80)).title.endsWith('…')).toBe(true)
  })
})

describe('segmentTurns', () => {
  // BAARALI(07/11/2026): the usage line lands after the first model call.
  it('keeps a turn waiting for an approval at work, usage line or not', () => {
    const items = [user('Crée un portefeuille'), say('Pas de bibliothèque Solana installée.'), tool('executeCommand', 'running'), done()]
    const work = segmentTurns(items, true).find((s) => s.kind === 'work')
    expect(work).toMatchObject({ kind: 'work', active: true })
    expect(hasActiveWork(items, true)).toBe(true)
    expect(segmentTurns(items, false).find((s) => s.kind === 'work')).toMatchObject({ active: false })
  })
  it('folds the work of a finished turn into steps, the answer in the open', () => {
    const items = [
      user('Une annonce animée'),
      think('je cherche le kit'), tool('executeMcpTool'),
      say('Template posé. Je le réécris.'), tool('file-editText'), tool('file-editText'),
      say('Contrôle OK, j’exporte.'), tool('executeMcpTool', 'error'), tool('executeMcpTool'),
      say('C’est exporté : voici votre vidéo.'), done(),
    ]
    const segs = segmentTurns(items, false)
    expect(segs.map((s) => s.kind)).toEqual(['item', 'work', 'item', 'item'])
    const work = segs[1]
    if (work.kind !== 'work') throw new Error()
    expect(work.active).toBe(false)
    expect(work.steps.map((s) => [s.title, s.items.length, s.failed])).toEqual([
      ['Running MCP tool', 2, false],
      ['Template posé.', 2, false],
      ['Contrôle OK, j’exporte.', 2, true],
    ])
    expect(work.steps[1].said).toBe('Template posé. Je le réécris.')
    expect(segs[2]).toMatchObject({ kind: 'item', item: { content: 'C’est exporté : voici votre vidéo.' } })
  })

  it('shows the turn running: no answer yet, the block live', () => {
    const items = [user('Vas-y'), say('Je pose le modèle.'), tool('executeMcpTool', 'running')]
    const segs = segmentTurns(items, true)
    expect(segs[1]).toMatchObject({ kind: 'work', active: true })
    expect(hasActiveWork(items, true)).toBe(true)
    expect(hasActiveWork(items, false)).toBe(false)
  })

  // BAARALI(08/11/2026): words streaming mid-work no longer fold it (it flickered at each sentence).
  it('lets the answer stream in the open, the work live until the turn ends', () => {
    const items = [user('Vas-y'), tool('executeMcpTool'), say('Voici', true)]
    const segs = segmentTurns(items, true)
    expect(segs.map((s) => s.kind)).toEqual(['item', 'work', 'item'])
    expect(segs[1]).toMatchObject({ active: true })
    expect(segmentTurns(items, false)[1]).toMatchObject({ active: false })
  })

  it('leaves a plain exchange as it is', () => {
    const items = [user('Bonjour'), say('Bonjour ! Que puis-je faire ?'), done(), user('Merci'), say('Avec plaisir.')]
    expect(segmentTurns(items, false).map((s) => s.kind)).toEqual(['item', 'item', 'item', 'item', 'item'])
  })
})
