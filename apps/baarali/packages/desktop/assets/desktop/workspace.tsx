import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { LockKeyhole, RefreshCw } from 'lucide-react'
import { canUseWork } from '@/lib/work-access'
import { openPlans } from '@/lib/plans-window'
import { BaaraliMark } from '@/components/baarali-mark'

export type WorkspaceMode = 'chat' | 'work'
type Access = 'checking' | 'allowed' | 'denied' | 'unavailable'
type Workspace = {
  mode: WorkspaceMode; setMode: (mode: WorkspaceMode) => void
  access: Access; refresh: () => Promise<void>
  projectHost: HTMLDivElement | null; setProjectHost: (host: HTMLDivElement | null) => void
}
const Context = createContext<Workspace | null>(null)
export function useDesktopWorkspace() {
  const value = useContext(Context)
  if (!value) throw new Error('desktop_workspace_provider_required')
  return value
}

// BAARALI(15/10/2026): the approved Chat/Work layout shares one entitlement
// check; unknown/offline accounts never mount paid surfaces. Runtime guards remain authoritative.
export function DesktopWorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>('chat')
  const [access, setAccess] = useState<Access>('checking')
  const [projectHost, setProjectHost] = useState<HTMLDivElement | null>(null)
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++request.current
    try {
      const info = await window.ipc.invoke('billing:getInfo', null)
      if (id === request.current) setAccess(info ? canUseWork(info) ? 'allowed' : 'denied' : 'unavailable')
    } catch { if (id === request.current) setAccess('unavailable') }
  }, [])
  useEffect(() => {
    void refresh()
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    const resync = window.ipc.on('server:resync', focus)
    const connected = window.ipc.on('oauth:didConnect', focus)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    return () => { ++request.current; window.removeEventListener('focus', focus); resync(); connected(); clearInterval(timer) }
  }, [refresh])
  return <Context.Provider value={{ mode, setMode, access, refresh, projectHost, setProjectHost }}>{children}</Context.Provider>
}

export function workspaceForNav(nav: string | null | undefined): WorkspaceMode | null {
  if (['code', 'workspaces', 'agents', 'apps', 'baarasseurs', 'spaces', 'studio', 'email', 'meetings'].includes(nav ?? '')) return 'work'
  if (['assistant', 'home', 'chat-history'].includes(nav ?? '')) return 'chat'
  return null
}

// BAARALI(07/11/2026): no Chat/Work switch any more (the founder's call,
// one sidebar as in Claude Code). The mode follows the page, so Code keeps
// its projects in the sidebar; nothing to click.
export function DesktopModeSync({ activeNav }: { activeNav?: string | null }) {
  const { setMode } = useDesktopWorkspace()
  useEffect(() => { setMode(workspaceForNav(activeNav) ?? 'chat') }, [activeNav, setMode])
  return null
}

/** What each paid page is, said on its padlock screen. */
const PAID_PAGES: Record<string, { title: string; text: string }> = {
  baarasseurs: { title: 'Your agents', text: 'Agents with a name, a role and a face, who work on their own and wait for your approval before anything leaves.' },
  agents: { title: 'Routines', text: 'Your agents act at set times: the morning brief, a weekly follow-up, a report every month.' },
  code: { title: 'Code and projects', text: 'Open a folder, let an agent read, write and run code, and review each change.' },
  workspaces: { title: 'Code and projects', text: 'Open a folder, let an agent read, write and run code, and review each change.' },
  email: { title: 'Email', text: 'Your inbox sorted, answers drafted in your tone, nothing sent without you.' },
  meetings: { title: 'Meetings', text: 'Notes taken for you, a summary and the next steps at the end of each meeting.' },
  apps: { title: 'Apps', text: 'Connect the tools you use every day so your agents can work with them.' },
  spaces: { title: 'Team spaces', text: 'Share agents, documents and conversations with your team.' },
  studio: { title: 'Studio', text: 'Videos, motion and 3D made with your agents, with media credits.' },
}

export function DesktopWorkGate({ children, required = false, page, studio = false, onChat }: { children: ReactNode; required?: boolean; page?: string | null; studio?: boolean; onChat: () => void }) {
  const workspace = useDesktopWorkspace()
  if (!required || workspace.access === 'allowed') return children
  const about = PAID_PAGES[studio ? 'studio' : page ?? ''] ?? { title: 'This page', text: 'Agents, routines, code, email, meetings, apps, team spaces and Studio.' }
  return <div className="baarali-work-gate" role="region" aria-label="Plan access">
    {workspace.access === 'checking' ? <><BaaraliMark size={44} motion="loading" /><p role="status">Checking your plan…</p></> : <>
      <span className="baarali-gate-symbol"><LockKeyhole size={25} /></span>
      {workspace.access === 'denied' && <span className="baarali-gate-pill">From the Semaine plan</span>}
      <h1>{workspace.access === 'denied' ? about.title : 'Your plan could not be verified'}</h1>
      <p>{workspace.access === 'denied' ? about.text : 'Check your connection and try again.'}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="baarali-primary" onClick={workspace.access === 'denied' ? openPlans : () => void workspace.refresh()}>
          {workspace.access === 'unavailable' && <RefreshCw size={14} />}{workspace.access === 'denied' ? 'View plans' : 'Retry'}
        </button>
        <button type="button" onClick={onChat}>Back to the conversation</button>
      </div>
      {workspace.access === 'denied' && <small>On Découverte you keep conversations with Baarali, web search, your files, voice, personal tasks and the library.</small>}
    </>}
  </div>
}

// BAARALI(15/10/2026): move the existing, fully functional project rail into
// Work's sidebar instead of adding a second navigation column beside it.
export function DesktopCodeRail({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  const { projectHost } = useDesktopWorkspace()
  const [element] = useState(() => document.createElement('div'))
  useLayoutEffect(() => {
    element.className = 'h-full min-h-0'
    projectHost?.appendChild(element)
    return () => element.remove()
  }, [element, projectHost])
  return embedded ? createPortal(children, element) : children
}
