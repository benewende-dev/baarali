// BAARALI(15/10/2026): approved Chat/Work layout, applied only to build
// copies so upstream updates still fail on an explicit, reviewable anchor.
import fs from 'node:fs';
const renderer = 'apps/x/apps/renderer/src';
const edit = (file, from, to) => ({ file: `${renderer}/${file}`, from, to });
export function desktopLayoutEdits() {
  // Keep immutable anchors: the release's translation check also reads this
  // plan after branding, when the checkout already contains the new layout.
  const sidebarNavigation = fs.readFileSync(new URL('./anchors/desktop-sidebar.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codeEmptyState = fs.readFileSync(new URL('./anchors/desktop-code-home.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  return [
    // BAARALI(16/10/2026): an empty session snapshot can arrive after a fast
    // first answer. Refetch if live durable/queue events overtook hydration;
    // otherwise the UI falls back to its legacy never-settled loading state.
    edit('lib/session-chat/store.ts', '  private generation = 0', '  private generation = 0\n  private feedRevision = 0'),
    edit('lib/session-chat/store.ts', '  private async load(sessionId: string, generation: number): Promise<void> {\n    try {', '  private async load(sessionId: string, generation: number): Promise<void> {\n    const revision = this.feedRevision\n    try {'),
    edit('lib/session-chat/store.ts', '      const reduced = turns.map((turn) => reduceTurn(turn.events))', '      if (revision !== this.feedRevision) return this.load(sessionId, generation)\n      const reduced = turns.map((turn) => reduceTurn(turn.events))'),
    edit('lib/session-chat/store.ts', '    this.queued = event.queue', '    this.feedRevision += 1\n    this.queued = event.queue'),
    edit('lib/session-chat/store.ts', '    const turnEvent = event.event', '    const turnEvent = event.event\n    if (isDurableTurnEvent(turnEvent)) this.feedRevision += 1'),
    edit('main.tsx', "import App from './App.tsx'", "import App from './App.tsx'\nimport { DesktopWorkspaceProvider } from '@/components/desktop-workspace'"),
    edit('main.tsx', '          <App />', '          <DesktopWorkspaceProvider><App /></DesktopWorkspaceProvider>'),
    edit('App.tsx', "import { SidebarContentPanel } from '@/components/sidebar-content';", "import { SidebarContentPanel } from '@/components/sidebar-content';\nimport { DesktopModeTabs, DesktopWorkGate, useDesktopWorkspace, workspaceForNav } from '@/components/desktop-workspace';\nimport { DesktopStudioLibrary } from '@/components/desktop-studio-library';"),
    edit('App.tsx', "currentViewState.type !== 'prompts' && currentViewState.type !== 'baarasseurs'", "currentViewState.type !== 'studio' && currentViewState.type !== 'prompts' && currentViewState.type !== 'baarasseurs'"),
    edit('App.tsx', 'function App() {', 'function App() {\n  const desktopWorkspace = useDesktopWorkspace();'),
    edit('App.tsx', "  | { type: 'apps' }", "  | { type: 'apps' }\n  | { type: 'studio' }"),
    edit('App.tsx', "  | 'bg-tasks' | 'apps' | 'prompts'", "  | 'studio' | 'bg-tasks' | 'apps' | 'prompts'"),
    edit('App.tsx', '  const [isAppsOpen, setIsAppsOpen] = useState(false)', '  const [isStudioOpen, setIsStudioOpen] = useState(false)\n  const [isAppsOpen, setIsAppsOpen] = useState(false)'),
    edit('App.tsx', '!isBgTasksOpen && !isAppsOpen', '!isBgTasksOpen && !isStudioOpen && !isAppsOpen'),
    edit('App.tsx', "    if (isAppsOpen) return { type: 'apps' }", "    if (isStudioOpen) return { type: 'studio' }\n    if (isAppsOpen) return { type: 'apps' }"),
    edit('App.tsx', 'isLiveNotesOpen, isBgTasksOpen, isAppsOpen, isPromptsOpen', 'isLiveNotesOpen, isBgTasksOpen, isStudioOpen, isAppsOpen, isPromptsOpen'),
    edit('App.tsx', "      case 'apps': return 'Apps'", "      case 'studio': return 'Studio'\n      case 'apps': return 'Apps'"),
    edit('App.tsx', '    setIsAppsOpen(false)', '    setIsStudioOpen(false)\n    setIsAppsOpen(false)'),
    edit('App.tsx', "      case 'apps':\n        setIsAppsOpen(true)", "      case 'studio':\n        setIsStudioOpen(true)\n        return\n      case 'apps':\n        setIsAppsOpen(true)"),
    edit('App.tsx', 'isLiveNotesOpen || isBgTasksOpen || isAppsOpen', 'isLiveNotesOpen || isBgTasksOpen || isStudioOpen || isAppsOpen'),
    edit('App.tsx', "\n    : isAppsOpen ? 'apps'", "\n    : isStudioOpen ? 'studio'\n    : isAppsOpen ? 'apps'"),
    edit('App.tsx', "\n      : isAppsOpen ? 'apps'", "\n      : isStudioOpen ? 'studio'\n      : isAppsOpen ? 'apps'"),
    edit('App.tsx', "    onOpenMeetings: openMeetingsView,", "    onSearch: () => setIsSearchOpen(true),\n    onOpenStudio: () => void navigateToView({ type: 'studio' }),\n    onNewWork: () => { openCodeView(); window.dispatchEvent(new Event('baarali:new-work')) },\n    onOpenMeetings: openMeetingsView,"),
    // Main navigation stays visible above every pane, including a maximized chat.
    edit('App.tsx', '                    onSessionSelected={handleCodeSessionSelected}', `                    onStartWork={async (session, submission) => {
                      handleCodeSessionSelected({ session, status: 'idle' });
                      codeSessionLocksRef.current = { ...codeSessionLocksRef.current, [session.id]: { cwd: session.cwd, agent: session.agent, codeModeEnabled: session.codeModeEnabled } };
                      const tab = chatTabsRef.current.find(tab => tab.runId === session.id);
                      if (!tab) throw new Error('work_chat_binding_failed');
                      if (submission.selection) selectionByTabRef.current.set(tab.chatId, submission.selection);
                      const [message, mentions, attachments, search, code, permission] = submission.input;
                      await handlePromptSubmit(message, mentions, attachments, search, code, permission, tab.id);
                    }}
                    onSessionSelected={handleCodeSessionSelected}`),
    // BAARALI(16/10/2026): Electron computes native draggable regions in
    // paint order. Tabs must follow every drag region, like FixedSidebarToggle;
    // z-index alone leaves real mouse clicks captured by the titlebar.
    edit('App.tsx', '            <MenuSidebarToggleBridge />', '            <MenuSidebarToggleBridge />\n            <DesktopModeTabs activeNav={sidebarNavProps.activeNav} onChat={openAssistant} onWork={openCodeView} />'),
    edit('App.tsx', '            <SidebarInset\n', "            <DesktopWorkGate required={workspaceForNav(sidebarNavProps.activeNav) === 'work' || (isStudioOpen || !!selectedPath?.startsWith('motion/'))} onChat={openAssistant}>\n            <SidebarInset\n"),
    edit('App.tsx', '            {/* Full-screen call: user tile', '            </DesktopWorkGate>\n            {/* Full-screen call: user tile'),
    edit('App.tsx', "              {activeMiddle === 'suggested-topics' && (", "              {activeMiddle === 'studio' && <DesktopStudioLibrary onOpen={navigateToFile} onCreate={() => prefillChat('Help me prepare a creative project in Studio. ')} />}\n              {activeMiddle === 'suggested-topics' && ("),
    edit('App.tsx', "      return { ...style, width: codeRailWidth, flex: '0 0 auto' }", "      return { ...style, width: desktopWorkspace.mode === 'work' && sidebarOpen ? 0 : codeRailWidth, flex: '0 0 auto' }"),
    edit('App.tsx', '[ chatPaneSize, codeChatMain, codeRailWidth,', '[ desktopWorkspace.mode, sidebarOpen, chatPaneSize, codeChatMain, codeRailWidth,'),
    edit('components/sidebar-content.tsx', 'import { SidebarChatContextMenu }', "import { useDesktopWorkspace } from './desktop-workspace'\nimport { Search, Clapperboard, Users } from 'lucide-react'\nimport { SidebarChatContextMenu }"),
    edit('components/sidebar-content.tsx', '  onOpenMeetings?: () => void', '  onSearch?: () => void\n  onOpenStudio?: () => void\n  onNewWork?: () => void\n  onOpenMeetings?: () => void'),
    edit('components/sidebar-content.tsx', "| 'spaces' | 'workspaces' | null", "| 'studio' | 'spaces' | 'workspaces' | null"),
    edit('components/sidebar-content.tsx', '  onOpenMeetings,\n  onOpenBgTasks,', '  onSearch, onOpenStudio, onNewWork, onOpenSpaces,\n  onOpenMeetings,\n  onOpenBgTasks,'),
    edit('components/sidebar-content.tsx', '  onOpenSpace,\n  activeSpace,\n', ''),
    edit('components/sidebar-content.tsx', '  const { sessions: projectSessions,', '  const workspace = useDesktopWorkspace()\n  const { sessions: projectSessions,'),
    edit('components/sidebar-content.tsx', sidebarNavigation, `  const isWork = workspace.mode === 'work'
  menuRun.push(<SidebarMenuItem key="new"><SidebarMenuButton className="baarali-new-action" onClick={() => isWork ? onNewWork?.() : onNewChat?.()}><SquarePen className="size-4 shrink-0" /><span>{isWork ? 'New work' : 'New chat'}</span></SidebarMenuButton></SidebarMenuItem>)
  if (!isWork) menuRun.push(<SidebarMenuItem key="search"><SidebarMenuButton onClick={onSearch}><Search className="size-4" /><span>Search</span></SidebarMenuButton></SidebarMenuItem>)
  for (const id of (isWork ? ['code', 'coworkers', 'routines', 'apps'] : ['email', 'meetings', 'todo', 'library', 'prompts']) as SidebarPage[]) {
    const row = sidebarRows.find(row => row.id === id)
    menuRun.push(renderPage({ id, label: (row && 'label' in row ? row.label : null) ?? (id === 'coworkers' ? 'Agents' : null) }))
  }
  if (isWork) {
    if (SPACES_ENABLED) menuRun.push(<SidebarMenuItem key="spaces"><SidebarMenuButton isActive={activeNav === 'spaces'} onClick={onOpenSpaces}><Users className="size-4" /><span>Team spaces</span></SidebarMenuButton></SidebarMenuItem>)
    menuRun.push(<SidebarMenuItem key="studio"><SidebarMenuButton isActive={activeNav === 'studio'} onClick={onOpenStudio}><Clapperboard className="size-4" /><span>Studio</span></SidebarMenuButton></SidebarMenuItem>)
  }
  flushMenu()`),
    // Keep the entire profile/usage/status footer unchanged; only the body differs.
    edit('components/sidebar-content.tsx', '        {/* Chats */}\n        <SidebarGroup', '        {isWork && workspace.access === \'allowed\' && <div ref={workspace.setProjectHost} className="baarali-project-host min-h-0 flex-1" />}\n        {/* Chats */}\n        <SidebarGroup hidden={isWork}'),
    edit('components/sidebar-content.tsx', 'import { SpacesSidebarSection } from "@/components/spaces-sidebar-section"\n', ''),
    edit('components/dock-sidebar.tsx', 'export function DockSidebar({', "import { useDesktopWorkspace } from './desktop-workspace'\nimport { Clapperboard, Bot } from 'lucide-react'\n\nexport function DockSidebar({"),
    edit('components/dock-sidebar.tsx', '  onOpenMeetings?: () => void', '  onOpenStudio?: () => void\n  onOpenBaarasseurs?: () => void\n  onNewWork?: () => void\n  onOpenMeetings?: () => void'),
    edit('components/dock-sidebar.tsx', '  onOpenMeetings,\n  onOpenBgTasks,', '  onOpenStudio, onOpenBaarasseurs, onNewWork,\n  onOpenMeetings,\n  onOpenBgTasks,'),
    edit('components/dock-sidebar.tsx', '  // ----- interaction state -----', "  const workspace = useDesktopWorkspace()\n  // ----- interaction state -----"),
    edit('components/dock-sidebar.tsx', '    return items\n  }, [', "    const work = workspace.mode === 'work'\n    const filtered = items.filter(row => {\n      if ('sep' in row && row.sep) return false\n      const key = row.item.key\n      return work ? ['workspaces', 'spaces', 'agents', 'apps', 'settings'].includes(key) || key.startsWith('app:') : ['new-chat', 'assistant', 'email', 'meetings', 'home', 'brain', 'chats', 'settings'].includes(key)\n    })\n    if (work) filtered.unshift({ item: { key: 'new-work', label: 'New work', icon: SquarePen, onClick: () => onNewWork?.() } }, { item: { key: 'baarasseurs', label: 'Agents', icon: Bot, onClick: () => onOpenBaarasseurs?.() } }, { item: { key: 'studio', label: 'Studio', icon: Clapperboard, onClick: () => onOpenStudio?.() } })\n    return filtered\n  }, [workspace.mode, onOpenStudio, onOpenBaarasseurs, onNewWork,"),
    edit('components/code/code-view.tsx', "import { SessionRail } from './session-rail'", "import { SessionRail } from './session-rail'\nimport { DesktopCodeRail, useDesktopWorkspace } from '../desktop-workspace'\nimport { DesktopCodeHome, type WorkSubmission } from '../desktop-code-home'\nimport { useSidebar } from '../ui/sidebar'"),
    edit('components/code/code-view.tsx', '  onSessionSelected,\n  focusSessionId,', '  onSessionSelected, onStartWork,\n  focusSessionId,'),
    edit('components/code/code-view.tsx', '  onSessionSelected?: (active: ActiveCodeSession | null) => void', '  onStartWork?: (session: CodeSession, submission: WorkSubmission) => Promise<void>\n  onSessionSelected?: (active: ActiveCodeSession | null) => void'),
    edit('components/code/code-view.tsx', '      setSelectedSessionId(res.session.id)', '      setSelectedSessionId(res.session.id)\n      return res.session'),
    edit('components/code/code-view.tsx', '  const { projects, sessions, statusOf, refresh } = useCodeSessions()', "  const workspace = useDesktopWorkspace()\n  const { state: sidebarState } = useSidebar()\n  const embedded = workspace.mode === 'work' && sidebarState === 'expanded'\n  const { projects, sessions, statusOf, refresh } = useCodeSessions()"),
    edit('components/code/code-view.tsx', "  const creatingRef = useRef(false)", "  useEffect(() => {\n    const reset = () => { setSelectedSessionId(null); onSessionSelected?.(null) }\n    window.addEventListener('baarali:new-work', reset)\n    return () => window.removeEventListener('baarali:new-work', reset)\n  }, [onSessionSelected])\n  const creatingRef = useRef(false)"),
    edit('components/code/code-view.tsx', '      <SessionRail\n', '      <DesktopCodeRail embedded={embedded}><SessionRail embedded={embedded}\n'),
    edit('components/code/code-view.tsx', codeEmptyState, `      </DesktopCodeRail>\n      {!selectedSession && <DesktopCodeHome projects={projects} sessions={sessions} statusOf={statusOf} onOpen={setSelectedSessionId} onAdd={() => void handleAddProject()} onNew={id => void handleNewSession(id)} onStart={onStartWork ? async (id, submission) => { const session = await handleNewSession(id); if (!session) throw new Error('work_session_creation_failed'); await onStartWork(session, submission) } : undefined} />}\n\n`),
    edit('components/code/code-view.tsx', "import { FolderOpen, Plus } from 'lucide-react'\n", ''),
    edit('components/code/code-view.tsx', "import { Button } from '@/components/ui/button'\n", ''),
    edit('components/code/code-view.tsx', 'useCodeSessions, projectLabel, type ProjectRow', 'useCodeSessions, type ProjectRow'),
    edit('components/code/code-view.test.tsx', "import { CodeView } from './code-view'", "import { CodeView } from './code-view'\nvi.mock('../desktop-workspace', () => ({ useDesktopWorkspace: () => ({ mode: 'work' }), DesktopCodeRail: ({ children }: { children: React.ReactNode }) => children }))\nvi.mock('../ui/sidebar', () => ({ useSidebar: () => ({ state: 'collapsed' }) }))"),
    edit('components/code/code-view.test.tsx', "vi.mock('./session-rail',", `vi.mock('../chat-input-with-mentions', () => ({ ChatInputWithMentions: ({ onSubmit, onSelectionChange }: { onSubmit: (...args: unknown[]) => void; onSelectionChange: (selection: unknown) => void }) => <button onClick={() => { onSelectionChange({ provider: 'fixture', model: 'selected-model' }); onSubmit({ text: 'Review this project' }, undefined, [{ path: 'Attachments/spec.md', filename: 'spec.md', mimeType: 'text/markdown', size: 20 }], true, undefined, 'manual') }}>Start Work request</button> }))
vi.mock('./session-rail',`),
    edit('components/code/session-rail.tsx', '  className,\n  onSwitchBranch,\n}: {', '  className, embedded = false,\n  onSwitchBranch,\n}: {\n  embedded?: boolean'),
    edit('components/code/session-rail.tsx', '  return (\n    // Always docked:', '  if (embedded) return body\n  return (\n    // Always docked:'),
    edit('components/chat-input-with-mentions.tsx', 'rounded-[24px] border bg-background', 'rounded-[18px] border bg-background'),
    edit('components/chat-input-with-mentions.tsx', '<div className="px-4 pt-5 pb-3">', '<div className="px-3.5 pt-3 pb-2">'),
    edit('components/chat-input-with-mentions.tsx', 'className="flex items-center gap-2 px-4 pb-3"', 'className="flex items-center gap-1.5 px-3 pb-2"'),
    edit('components/chat-input-with-mentions.tsx', '<div title="Assistant model" aria-label="Assistant model">', '<div className="baarali-compact-model" title="Assistant model" aria-label="Assistant model">'),
  ];
}
