import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodeView } from './code/code-view'
const { row, session, refresh, state } = vi.hoisted(() => ({
  row: { project: { id: 'p', path: '/repo', name: 'Project', addedAt: '2026-10-15T00:00:00Z' }, git: { isGitRepo: true, hasCommits: true, branch: 'main', dirtyCount: 0, root: '/repo', subpath: '' } },
  session: { id: 'created', projectId: 'p', title: 'New session', cwd: '/worktree', agent: 'claude', createdAt: '2026-10-15T00:00:00Z' }, refresh: vi.fn(), state: { empty: false },
}))
vi.mock('./code/use-code-sessions', () => ({ useCodeSessions: () => ({ projects: state.empty ? [] : [row], sessions: [], statusOf: () => 'idle', refresh }), projectLabel: () => 'Project' }))
vi.mock('./code/code-agent-status', () => ({ AGENT_LABEL: {}, fetchCodeAgentsStatus: async () => null, isAgentReady: () => true }))
vi.mock('./desktop-workspace', () => ({ useDesktopWorkspace: () => ({ mode: 'work' }), DesktopCodeRail: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./ui/sidebar', () => ({ useSidebar: () => ({ state: 'collapsed' }) }))
vi.mock('./code/session-rail', () => ({ SessionRail: () => null }))
vi.mock('./chat-input-with-mentions', () => ({ ChatInputWithMentions: ({ onSubmit, onSelectionChange, onStartCall }: { onSubmit: (...args: unknown[]) => void; onSelectionChange: (selection: unknown) => void; onStartCall?: (preset: string) => void }) => <><button onClick={() => {
  onSelectionChange({ provider: 'fixture', model: 'selected-model' })
  onSubmit({ text: 'Review this project' }, undefined, [{ path: 'Attachments/spec.md', filename: 'spec.md', mimeType: 'text/markdown', size: 20 }], true, undefined, 'manual')
}}>Send Work request</button><button onClick={() => onStartCall?.('voice')}>Start Work voice</button></> }))
beforeEach(() => { state.empty = false })
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })
it('creates one project session and forwards the complete first request with its selected model', async () => {
  const invoke = vi.fn().mockResolvedValue({ session })
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  const start = vi.fn().mockResolvedValue(undefined)
  render(<CodeView onStartWork={start} />)
  fireEvent.change(screen.getByLabelText('Project for the new task'), { target: { value: 'p' } })
  fireEvent.click(screen.getByText('Send Work request'))
  await waitFor(() => expect(start).toHaveBeenCalledWith(session, {
    input: [{ text: 'Review this project' }, undefined, [{ path: 'Attachments/spec.md', filename: 'spec.md', mimeType: 'text/markdown', size: 20 }], true, undefined, 'manual'],
    selection: { provider: 'fixture', model: 'selected-model' },
  }))
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(invoke).toHaveBeenCalledWith('codeSession:create', { projectId: 'p', agent: 'claude', isolation: 'worktree', codeModeEnabled: true })
})

it('shows the composer with no project and starts plain Work without a coding engine', async () => {
  state.empty = true
  const general = { ...session, projectId: 'work', cwd: '/data/Projects/Work', codeModeEnabled: false }
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'workspace:getRoot') return { root: '/data/' }
    if (channel === 'workspace:mkdir') return { ok: true }
    if (channel === 'codeProject:add') return { ...row, project: { ...row.project, id: 'work', path: '/data/Projects/Work', name: 'Work' } }
    if (channel === 'codeSession:create') return { session: general }
    throw new Error('Unexpected channel: ' + channel)
  })
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  const start = vi.fn().mockResolvedValue(undefined)
  render(<CodeView onStartWork={start} />)
  expect(screen.getByLabelText('Project for the new task')).toHaveValue('')
  expect(invoke).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Send Work request'))
  fireEvent.click(screen.getByText('Send Work request'))
  await waitFor(() => expect(start).toHaveBeenCalledWith(general, expect.objectContaining({ selection: { provider: 'fixture', model: 'selected-model' } })))
  expect(invoke).toHaveBeenCalledWith('workspace:mkdir', { path: 'Projects/Work', recursive: true })
  expect(invoke).toHaveBeenCalledWith('codeProject:add', { path: '/data/Projects/Work' })
  expect(invoke).toHaveBeenCalledWith('codeSession:create', { projectId: 'work', agent: 'claude', isolation: 'in-repo', codeModeEnabled: false })
  expect(start).toHaveBeenCalledTimes(1)
})

it('keeps Work usable and explains a failed workspace preparation before any session is created', async () => {
  state.empty = true
  const invoke = vi.fn().mockRejectedValue(new Error('offline'))
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  const start = vi.fn()
  render(<CodeView onStartWork={start} />)
  fireEvent.click(screen.getByText('Send Work request'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not start this task. Please try again.')
  expect(start).not.toHaveBeenCalled()
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Send Work request')).toBeVisible()
})

it('prepares a plain Work session for the voice call without submitting an empty message', async () => {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'workspace:getRoot') return { root: '/data' }
    if (channel === 'workspace:mkdir') return { ok: true }
    if (channel === 'codeProject:add') return row
    if (channel === 'codeSession:create') return { session }
    throw new Error(channel)
  })
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  const start = vi.fn().mockResolvedValue(undefined)
  render(<CodeView workVoice={{ callAvailable: true }} onStartWork={start} />)
  fireEvent.click(screen.getByText('Start Work voice'))
  await waitFor(() => expect(start).toHaveBeenCalledWith(session, { input: [{ text: '', files: [] }], selection: null, call: 'voice' }))
  expect(invoke).toHaveBeenCalledWith('codeSession:create', expect.objectContaining({ isolation: 'in-repo', codeModeEnabled: false }))
})
