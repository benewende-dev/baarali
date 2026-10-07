import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notice } from '@x/shared/dist/billing.js'

// BAARALI(07/10/2026): the bell of the admin console's messages.

const openPlans = vi.fn()
vi.mock('@/lib/plans-window', () => ({ openPlans: () => openPlans() }))

let served: { data: Notice[]; unread: number } | null = null
const calls: Array<{ channel: string; args: unknown }> = []
;(window as unknown as { ipc: unknown }).ipc = {
  on: () => () => undefined,
  invoke: async (channel: string, args: unknown) => {
    calls.push({ channel, args })
    if (channel === 'billing:getNotifications') return served
    if (channel === 'billing:notificationEvent') return true
    if (channel === 'billing:readAllNotifications') return 1
    return null
  },
}

import { NotificationBell } from './notification-bell'
import { __resetNotificationsForTests, OPEN_NOTIFICATIONS_EVENT } from '@/lib/notifications'

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'ntf_1', title: 'La voix arrive', body: 'Parle à Baarali.', button: null, target: 'none', link: null,
  sentAt: new Date().toISOString(), read: false, ...over,
})

beforeEach(() => { __resetNotificationsForTests(); calls.length = 0; openPlans.mockReset() })
afterEach(() => cleanup())

describe('NotificationBell', () => {
  it('counts the unread, and lists the messages when opened', async () => {
    served = { data: [notice(), notice({ id: 'ntf_0', title: 'Ancien', read: true })], unread: 1 }
    render(<NotificationBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Notifications'))
    await waitFor(() => expect(screen.getByText('La voix arrive')).toBeTruthy())
    expect(screen.getByText('Ancien')).toBeTruthy()
  })

  it('marks a message read when tapped, and all of them at once', async () => {
    served = { data: [notice(), notice({ id: 'ntf_2', title: 'Deux' })], unread: 2 }
    render(<NotificationBell />)
    await waitFor(() => screen.getByText('2'))
    fireEvent.click(screen.getByLabelText('Notifications'))
    fireEvent.click(await screen.findByText('La voix arrive'))
    expect(calls).toContainEqual({ channel: 'billing:notificationEvent', args: { id: 'ntf_1', kind: 'read' } })
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy())
    fireEvent.click(screen.getByText('Mark all as read'))
    expect(calls.some((c) => c.channel === 'billing:readAllNotifications')).toBe(true)
    await waitFor(() => expect(screen.queryByText('Mark all as read')).toBeNull())
  })

  it('follows the button where it leads', async () => {
    served = { data: [notice({ button: 'Voir', target: 'plans' })], unread: 1 }
    const onOpenChat = vi.fn()
    render(<NotificationBell onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    fireEvent.click(await screen.findByText('Voir'))
    expect(openPlans).toHaveBeenCalled()
    expect(calls).toContainEqual({ channel: 'billing:notificationEvent', args: { id: 'ntf_1', kind: 'click' } })
    expect(onOpenChat).not.toHaveBeenCalled()
  })

  it('opens the Chat from a message without a button', async () => {
    served = { data: [notice({ target: 'chat' })], unread: 1 }
    const onOpenChat = vi.fn()
    render(<NotificationBell onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    fireEvent.click(await screen.findByText('La voix arrive'))
    expect(onOpenChat).toHaveBeenCalled()
  })

  it('opens from the notification on the Mac’s screen, and says when there is nothing', async () => {
    served = { data: [], unread: 0 }
    render(<NotificationBell />)
    window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATIONS_EVENT))
    expect(await screen.findByText('No notifications yet')).toBeTruthy()
  })
})
