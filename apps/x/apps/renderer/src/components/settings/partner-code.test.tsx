import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PartnerCodeState, PlanOffer } from '@x/shared/dist/billing.js'

// BAARALI(08/10/2026): a creator's partner code in Settings › Account.

const DAY = 86_400_000
let state: PartnerCodeState | null = null
let applied = false
const calls: Array<{ channel: string; args: unknown }> = []
;(window as unknown as { ipc: unknown }).ipc = {
  on: () => () => undefined,
  invoke: async (channel: string, args: unknown) => {
    calls.push({ channel, args })
    if (channel === 'billing:getPartnerCode') return applied
      ? { partner: 'Awa Tech', canRedeem: false, until: null, gift: null, running: { plan: 'Essentiel', startsAt: new Date(Date.now() - DAY / 2).toISOString(), endsAt: new Date(Date.now() + 6.5 * DAY).toISOString() } }
      : state
    if (channel === 'billing:checkPartnerCode') {
      const { code } = args as { code: string }
      return code === 'AWATECH' ? { ok: true, name: 'Awa Tech', network: 'TikTok', city: 'Ouagadougou' } : { ok: false, message: 'Ce code n’existe pas. Vérifiez l’orthographe.' }
    }
    if (channel === 'billing:redeemPartnerCode') {
      applied = true
      return { ok: true, partner: 'Awa Tech', gift: { plan: 'Essentiel', endsAt: new Date(Date.now() + 7 * DAY).toISOString() } }
    }
    return null
  },
}

import { PartnerCode } from './partner-code'

const offers = [{ id: 'essentiel', name: 'Essentiel', tag: '', for: '', plus: '', points: ['Les meilleurs modèles', 'Images et voix', 'Plus d’usage'], featured: true, free: false, levels: [{ id: 'essentiel' }] }] as unknown as PlanOffer[]
const open = (): PartnerCodeState => ({ partner: null, canRedeem: true, until: new Date(Date.now() + 5.5 * DAY).toISOString(), gift: { plan: 'Essentiel', planId: 'essentiel', days: 7 }, running: null })

beforeEach(() => { calls.length = 0; applied = false; state = open() })
afterEach(() => cleanup())

describe('PartnerCode', () => {
  it('says what the code brings, and how long is left to type it', async () => {
    render(<PartnerCode enabled offers={offers} currentPlanName="Découverte" />)
    await screen.findByText('6 days left')
    expect(screen.getByText('Les meilleurs modèles')).toBeTruthy()
    expect(screen.getByText('Then back to Découverte. No card, nothing to pay.')).toBeTruthy()
    expect((screen.getByText('Apply').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows whose code it is as it is typed, then the offered days once applied', async () => {
    render(<PartnerCode enabled offers={offers} currentPlanName="Découverte" />)
    fireEvent.change(await screen.findByLabelText('Partner code'), { target: { value: 'nope' } })
    await screen.findByText('Ce code n’existe pas. Vérifiez l’orthographe.')
    fireEvent.change(screen.getByLabelText('Partner code'), { target: { value: 'awa-tech' } })
    await screen.findByText('TikTok · Ouagadougou')
    fireEvent.click(screen.getByText('Apply'))
    await screen.findByText('Day 1 of 7')
    expect(calls).toContainEqual({ channel: 'billing:redeemPartnerCode', args: { code: 'AWATECH' } })
    expect(screen.getByText('Recommended by Awa Tech')).toBeTruthy()
  })

  it('stays hidden past the days, with nobody linked', async () => {
    state = { ...open(), canRedeem: false, until: null }
    const { container } = render(<PartnerCode enabled offers={offers} currentPlanName={null} />)
    await waitFor(() => expect(calls.length).toBe(1))
    expect(container.textContent).toBe('')
  })
})
