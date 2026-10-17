import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { DesktopModeTabs, DesktopWorkspaceProvider, DesktopWorkGate, workspaceForNav } from './desktop-workspace'

vi.mock('./baarali-mark', () => ({ BaaraliMark: () => <span>Loading</span> }))
const invoke = vi.fn()
let mounted = 0
function PaidContent() { useEffect(() => { mounted++ }, []); return <span>Project content</span> }
function Harness({ initial = 'assistant' }: { initial?: string }) {
  const [route, setRoute] = useState(initial)
  return <DesktopWorkspaceProvider>
    <DesktopModeTabs activeNav={route} onChat={() => setRoute('assistant')} onWork={() => setRoute('code')} />
    <DesktopWorkGate required={workspaceForNav(route) === 'work'} onChat={() => setRoute('assistant')}>
      {workspaceForNav(route) === 'work' ? <PaidContent /> : <span>Chat content</span>}
    </DesktopWorkGate>
  </DesktopWorkspaceProvider>
}
const plan = (category: string, status = 'active') => ({ catalog: { plans: [{ id: 'plan', category }] }, subscriptionPlanId: 'plan', subscriptionStatus: status })
beforeEach(() => {
  mounted = 0
  invoke.mockReset()
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke, on: () => () => {} } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('desktop Chat and Work', () => {
  it('keeps free accounts in Chat and never mounts a paid page when Work is selected', async () => {
    invoke.mockResolvedValue(plan('free'))
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    await screen.findByText('Work is available with a paid plan')
    expect(mounted).toBe(0)
    fireEvent.click(screen.getByText('Return to Chat'))
    expect(screen.getByText('Chat content')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
  })
  it('opens the real paid destination and supports keyboard switching', async () => {
    invoke.mockResolvedValue(plan('pro'))
    render(<Harness />)
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Chat' }), { key: 'ArrowRight' })
    expect(await screen.findByText('Project content')).toBeVisible()
    expect(mounted).toBe(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(screen.getByText('Chat content')).toBeVisible()
  })
  it('does not mount a restored Work route before entitlement is verified', async () => {
    let resolve!: (info: unknown) => void
    invoke.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<Harness initial="code" />)
    expect(mounted).toBe(0)
    await act(async () => resolve(plan('free')))
    expect(await screen.findByText('Work is available with a paid plan')).toBeVisible()
    expect(mounted).toBe(0)
  })
  it.each(['email', 'meetings', 'spaces'])('blocks restored %s pages for Discovery before they mount', async route => {
    invoke.mockResolvedValue(plan('free'))
    render(<Harness initial={route} />)
    expect(await screen.findByText('Work is available with a paid plan')).toBeVisible()
    expect(mounted).toBe(0)
    expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true')
  })
  it('completes a Work click made while the paid plan is still loading', async () => {
    let resolve!: (info: unknown) => void
    invoke.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(mounted).toBe(0)
    await act(async () => resolve(plan('pro')))
    expect(await screen.findByText('Project content')).toBeVisible()
  })
  it('shows retry on verification failure and opens after a successful retry', async () => {
    invoke.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(plan('starter'))
    render(<Harness initial="code" />)
    await screen.findByText('Your plan could not be verified')
    expect(mounted).toBe(0)
    fireEvent.click(screen.getByText('Retry'))
    expect(await screen.findByText('Project content')).toBeVisible()
  })
  it('removes paid content after the account loses access', async () => {
    invoke.mockResolvedValue(plan('pro'))
    render(<Harness initial="code" />)
    await screen.findByText('Project content')
    invoke.mockResolvedValue(plan('free'))
    fireEvent(window, new Event('focus'))
    expect(await screen.findByText('Work is available with a paid plan')).toBeVisible()
    expect(screen.queryByText('Project content')).toBeNull()
  })
})
