import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CodeView } from './code/code-view'
const { row, session, refresh } = vi.hoisted(() => ({
  row: { project: { id: 'p', path: '/repo', name: 'Project', addedAt: '2026-10-15T00:00:00Z' }, git: { isGitRepo: true, hasCommits: true, branch: 'main', dirtyCount: 0, root: '/repo', subpath: '' } },
  session: { id: 'created', projectId: 'p', title: 'New session', cwd: '/worktree', agent: 'claude', createdAt: '2026-10-15T00:00:00Z' }, refresh: vi.fn(),
}))
vi.mock('./code/use-code-sessions', () => ({ useCodeSessions: () => ({ projects: [row], sessions: [], statusOf: () => 'idle', refresh }), projectLabel: () => 'Project' }))
vi.mock('./code/code-agent-status', () => ({ AGENT_LABEL: {}, fetchCodeAgentsStatus: async () => null, isAgentReady: () => true }))
vi.mock('./desktop-workspace', () => ({ useDesktopWorkspace: () => ({ mode: 'work' }), DesktopCodeRail: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./ui/sidebar', () => ({ useSidebar: () => ({ state: 'collapsed' }) }))
vi.mock('./code/session-rail', () => ({ SessionRail: () => null }))
vi.mock('./chat-input-with-mentions', () => ({ ChatInputWithMentions: ({ onSubmit, onSelectionChange }: { onSubmit: (...args: unknown[]) => void; onSelectionChange: (selection: unknown) => void }) => <button onClick={() => {
  onSelectionChange({ provider: 'fixture', model: 'selected-model' })
  onSubmit({ text: 'Review this project' }, undefined, [{ path: 'Attachments/spec.md', filename: 'spec.md', mimeType: 'text/markdown', size: 20 }], true, undefined, 'manual')
}}>Send Work request</button> }))
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })
it('creates one project session and forwards the complete first request with its selected model', async () => {
  const invoke = vi.fn().mockResolvedValue({ session })
  Object.defineProperty(window, 'ipc', { configurable: true, value: { invoke } })
  const start = vi.fn().mockResolvedValue(undefined)
  render(<CodeView onStartWork={start} />)
  fireEvent.click(screen.getByText('Send Work request'))
  await waitFor(() => expect(start).toHaveBeenCalledWith(session, {
    input: [{ text: 'Review this project' }, undefined, [{ path: 'Attachments/spec.md', filename: 'spec.md', mimeType: 'text/markdown', size: 20 }], true, undefined, 'manual'],
    selection: { provider: 'fixture', model: 'selected-model' },
  }))
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(invoke).toHaveBeenCalledWith('codeSession:create', { projectId: 'p', agent: 'claude', isolation: 'worktree', codeModeEnabled: true })
})
