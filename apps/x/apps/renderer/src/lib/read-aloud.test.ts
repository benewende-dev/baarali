import { describe, expect, it } from 'vitest'
import { speakableOpening } from './read-aloud'

describe('speakableOpening', () => {
  it('reads plain text, without markup, code or links', () => {
    const reply = '## Résumé\n\n**Trois** clients attendent : voir [Sahel BTP](https://x.test).\n\n```js\nconsole.log(1)\n```\n- Awa\n- Kaboré'
    expect(speakableOpening(reply)).toBe('Résumé Trois clients attendent : voir Sahel BTP. Awa Kaboré')
  })

  it('cuts a long reply after a sentence', () => {
    const reply = 'Première phrase assez longue pour compter. '.repeat(20)
    const opening = speakableOpening(reply, 120)
    expect(opening.length).toBeLessThanOrEqual(120)
    expect(opening.endsWith('.')).toBe(true)
  })

  it('leaves out a <voice> summary and says nothing of an empty reply', () => {
    expect(speakableOpening('<voice>déjà lu</voice>Suite.')).toBe('Suite.')
    expect(speakableOpening('```\ncode\n```')).toBe('')
  })
})
