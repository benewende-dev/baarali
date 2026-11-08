import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { DesktopModeSync, DesktopWorkspaceProvider, DesktopWorkGate, workspaceForNav } from './desktop-workspace'

vi.mock('./baarali-mark', () => ({ BaaraliMark: () => <span>Loading</span> }))
const invoke = vi.fn()
let mounted = 0
function PaidContent() { useEffect(() => { mounted++ }, []); return <span>Project content</span> }
function Harness({ initial = 'assistant' }: { initial?: string }) {
  const [route, setRoute] = useState(initial)
  return <DesktopWorkspaceProvider>
    <DesktopModeSync activeNav={route} />
    <button type="button" onClick={() => setRoute('code')}>Code</button>
    <button type="button" onClick={() => setRoute('todo')}>Tasks</button>
    <DesktopWorkGate required={workspaceForNav(route) === 'work'} page={route} onChat={() => setRoute('assistant')}>
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
describe('desktop pages by plan', () => {
  it('shows the padlock screen for a paid page on Découverte and never mounts it', async () => {
    invoke.mockResolvedValue(plan('free'))
    render(<Harness />)
    fireEvent.click(screen.getByText('Code'))
    expect(await screen.findByText('From the Semaine plan')).toBeVisible()
    expect(screen.getByText('Code and projects')).toBeVisible()
    expect(mounted).toBe(0)
    fireEvent.click(screen.getByText('Back to the conversation'))
    expect(screen.getByText('Chat content')).toBeVisible()
  })
  it('keeps free pages open on Découverte after a paid one', async () => {
    invoke.mockResolvedValue(plan('free'))
    render(<Harness initial="code" />)
    await screen.findByText('From the Semaine plan')
    fireEvent.click(screen.getByText('Tasks'))
    expect(screen.getByText('Chat content')).toBeVisible()
  })
  it('opens a paid page on a paid plan', async () => {
    invoke.mockResolvedValue(plan('pro'))
    render(<Harness />)
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.click(screen.getByText('Code'))
    expect(await screen.findByText('Project content')).toBeVisible()
    expect(mounted).toBe(1)
  })
  it('does not mount a restored paid page before the plan is verified', async () => {
    let resolve!: (info: unknown) => void
    invoke.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<Harness initial="code" />)
    expect(mounted).toBe(0)
    await act(async () => resolve(plan('free')))
    expect(await screen.findByText('From the Semaine plan')).toBeVisible()
    expect(mounted).toBe(0)
  })
  it.each(['email', 'meetings', 'spaces', 'baarasseurs', 'agents', 'apps'])('blocks restored %s pages on Découverte', async route => {
    invoke.mockResolvedValue(plan('free'))
    render(<Harness initial={route} />)
    expect(await screen.findByText('From the Semaine plan')).toBeVisible()
    expect(mounted).toBe(0)
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
    expect(await screen.findByText('From the Semaine plan')).toBeVisible()
    expect(screen.queryByText('Project content')).toBeNull()
  })
})
