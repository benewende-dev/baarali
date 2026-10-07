import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Announcement } from '@x/shared/dist/billing.js'

// BAARALI(07/10/2026): the admin console's banner at the top of the Chat.

const openPlans = vi.fn()
vi.mock('@/lib/plans-window', () => ({ openPlans: () => openPlans() }))
const toggle = vi.fn()
vi.mock('@/lib/voice-conversation', () => ({ canToggleConversation: () => true, toggleConversation: (o: string) => toggle(o) }))

let served: Announcement | null = null
const events: Array<{ id: string; kind: string }> = []
;(window as unknown as { ipc: unknown }).ipc = {
  on: () => () => undefined,
  invoke: async (channel: string, args: { id: string; kind: string }) => {
    if (channel === 'billing:getAnnouncement') return served
    if (channel === 'billing:announcementEvent') { events.push(args); return true }
    return null
  },
}

import { AnnouncementBanner } from './announcement-banner'
import { __resetAnnouncementForTests, OPEN_USAGE_EVENT } from '@/lib/announcement'

const banner = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'ann_1', text: 'Nouveau : parle à Baarali.', button: 'Essayer', target: 'voice', link: null, tone: 'info',
  endsAt: new Date(Date.now() + 86_400_000).toISOString(), ...over,
})

beforeEach(() => { __resetAnnouncementForTests(); events.length = 0; openPlans.mockReset(); toggle.mockReset() })
afterEach(() => cleanup())

describe('AnnouncementBanner', () => {
  it('shows nothing when there is no banner', async () => {
    served = null
    const { container } = render(<AnnouncementBanner />)
    await act(async () => {})
    expect(container.textContent).toBe('')
  })

  it('shows the words, counts a view once, and the button leads where it says', async () => {
    served = banner()
    render(<AnnouncementBanner />)
    await waitFor(() => expect(screen.getByText('Nouveau : parle à Baarali.')).toBeTruthy())
    fireEvent.click(screen.getByText('Essayer'))
    expect(toggle).toHaveBeenCalledWith('chat')
    await waitFor(() => expect(events).toEqual([{ id: 'ann_1', kind: 'view' }, { id: 'ann_1', kind: 'click' }]))
  })

  it('opens the plans, or the usage page', async () => {
    served = banner({ target: 'plans', button: 'Voir' })
    render(<AnnouncementBanner />)
    await waitFor(() => screen.getByText('Voir'))
    fireEvent.click(screen.getByText('Voir'))
    expect(openPlans).toHaveBeenCalled()

    cleanup(); __resetAnnouncementForTests()
    served = banner({ id: 'ann_2', target: 'usage', button: 'Mon usage' })
    const usage = vi.fn()
    window.addEventListener(OPEN_USAGE_EVENT, usage)
    render(<AnnouncementBanner />)
    await waitFor(() => screen.getByText('Mon usage'))
    fireEvent.click(screen.getByText('Mon usage'))
    expect(usage).toHaveBeenCalled()
    window.removeEventListener(OPEN_USAGE_EVENT, usage)
  })

  it('closes for good on every pane', async () => {
    served = banner({ target: 'none', button: null })
    render(<><AnnouncementBanner /><AnnouncementBanner /></>)
    await waitFor(() => expect(screen.getAllByText('Nouveau : parle à Baarali.')).toHaveLength(2))
    expect(screen.queryByText('Essayer')).toBeNull()
    fireEvent.click(screen.getAllByLabelText('Close')[0])
    expect(screen.queryByText('Nouveau : parle à Baarali.')).toBeNull()
    expect(events).toContainEqual({ id: 'ann_1', kind: 'dismiss' })
  })

  it('leaves once its end has passed', async () => {
    served = banner({ endsAt: new Date(Date.now() - 1000).toISOString() })
    const { container } = render(<AnnouncementBanner />)
    await act(async () => {})
    expect(container.textContent).toBe('')
  })
})
