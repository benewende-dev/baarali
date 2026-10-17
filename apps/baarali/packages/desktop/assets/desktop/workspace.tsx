import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BriefcaseBusiness, LockKeyhole, MessagesSquare, RefreshCw } from 'lucide-react'
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

export function DesktopModeTabs({ activeNav, onChat, onWork }: { activeNav?: string | null; onChat: () => void; onWork: () => void }) {
  const workspace = useDesktopWorkspace()
  const { setMode } = workspace
  const [pendingWork, setPendingWork] = useState(false)
  useEffect(() => { const mode = workspaceForNav(activeNav); if (mode) setMode(mode) }, [activeNav, setMode])
  useEffect(() => {
    if (pendingWork && workspace.mode === 'work' && workspace.access === 'allowed') { setPendingWork(false); onWork() }
  }, [pendingWork, workspace.mode, workspace.access, onWork])
  const select = (mode: WorkspaceMode) => {
    setMode(mode)
    if (mode === 'chat') { setPendingWork(false); onChat() }
    else if (workspace.access === 'allowed') { setPendingWork(false); onWork() }
    else setPendingWork(true)
  }
  return <div className="baarali-mode-tabs titlebar-no-drag" role="tablist" aria-label="Chat and Work">
    {(['chat', 'work'] as const).map(mode => {
      const Icon = mode === 'chat' ? MessagesSquare : BriefcaseBusiness
      return <button key={mode} type="button" role="tab" aria-selected={workspace.mode === mode}
        onClick={() => select(mode)} onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); select(mode === 'chat' ? 'work' : 'chat')
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[mode === 'chat' ? 1 : 0]?.focus()
          }
        }}><Icon size={14} />{mode === 'chat' ? 'Chat' : 'Work'}{mode === 'work' && workspace.access === 'denied' && <LockKeyhole size={11} />}</button>
    })}
  </div>
}

export function DesktopWorkGate({ children, required = false, onChat }: { children: ReactNode; required?: boolean; onChat: () => void }) {
  const workspace = useDesktopWorkspace()
  if ((!required && workspace.mode !== 'work') || workspace.access === 'allowed') return children
  return <div className="baarali-work-gate" role="region" aria-label="Work access">
    {workspace.access === 'checking' ? <><BaaraliMark size={44} motion="loading" /><p role="status">Checking your plan…</p></> : <>
      <span className="baarali-gate-symbol"><LockKeyhole size={25} /></span>
      <h1>{workspace.access === 'denied' ? 'Work is available with a paid plan' : 'Your plan could not be verified'}</h1>
      <p>{workspace.access === 'denied' ? 'Bring your projects, email, meetings, team spaces, agents, routines, Code and Studio together in one workspace.' : 'Check your connection and try again to open your workspace.'}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="baarali-primary" onClick={workspace.access === 'denied' ? openPlans : () => void workspace.refresh()}>
          {workspace.access === 'unavailable' && <RefreshCw size={14} />}{workspace.access === 'denied' ? 'View plans' : 'Retry'}
        </button>
        <button type="button" onClick={() => { workspace.setMode('chat'); onChat() }}>Return to Chat</button>
      </div>
      <small>Chat, web search, files, writing and voice remain available within your plan’s limits.</small>
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
