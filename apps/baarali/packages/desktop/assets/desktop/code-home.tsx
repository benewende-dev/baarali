import { Code2, FolderGit2, FolderPlus, Plus } from 'lucide-react'
import type { CodeSession, CodeSessionStatus } from '@x/shared/src/code-sessions.js'
import { projectLabel, type ProjectRow } from './code/use-code-sessions'
import { BaaraliMark } from './baarali-mark'
import { ChatInputWithMentions, type ChatInputWithMentionsProps, type ModelSelection } from './chat-input-with-mentions'
import { useRef, useState } from 'react'

export type WorkSubmission = { input: Parameters<ChatInputWithMentionsProps['onSubmit']>; selection: ModelSelection | null }

export function DesktopCodeHome({ projects, sessions, statusOf, onOpen, onAdd, onNew, onStart }: {
  projects: ProjectRow[]; sessions: CodeSession[]; statusOf: (id: string) => CodeSessionStatus
  onOpen: (id: string) => void; onAdd: () => void; onNew: (projectId: string) => void
  onStart?: (projectId: string | undefined, submission: WorkSubmission) => Promise<void>
}) {
  const [projectId, setProjectId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(false)
  const startingRef = useRef(false)
  const [retryDraft, setRetryDraft] = useState<string>()
  const selection = useRef<ModelSelection | null>(null)
  const project = projects.find(row => row.project.id === projectId)
  const recent = sessions.filter(session => !session.doneAt).slice(0, 5)
  return <section className="baarali-code-home">
    <div className="baarali-work-welcome"><BaaraliMark size={38} /><div><h1>Your workspace</h1><p>Build, review and move your projects forward.</p></div></div>
    {onStart && <div className="baarali-work-home-composer">
      <div className="baarali-work-project-options">
        <label><FolderGit2 size={14} />Project (optional)
          <select aria-label="Project for the new task" value={project?.project.id ?? ''} onChange={event => setProjectId(event.target.value)} disabled={starting}>
            <option value="">Without a project</option>
            {projects.map(row => <option key={row.project.id} value={row.project.id}>{projectLabel(row)}</option>)}
          </select>
        </label>
        <button type="button" className="baarali-work-project-add" onClick={onAdd} disabled={starting}><FolderPlus size={14} />Add a project</button>
      </div>
      <ChatInputWithMentions knowledgeFiles={[]} recentFiles={[]} visibleFiles={[]} draftKey="baarali:work-home" runId={null}
        isProcessing={starting} initialDraft={retryDraft} presetMessage={retryDraft} onPresetMessageConsumed={() => setRetryDraft(undefined)}
        placeholder="Describe a task, an app or a project."
        onSelectionChange={value => { selection.current = value }}
        onSubmit={(...input) => {
          if (startingRef.current) return
          startingRef.current = true
          setStartError(false)
          setStarting(true)
          void onStart(project?.project.id, { input, selection: selection.current }).catch(() => { setRetryDraft(input[0].text); setStartError(true) }).finally(() => { startingRef.current = false; setStarting(false) })
        }} />
      {startError && <p role="alert" className="text-sm text-destructive pt-2">Could not start this task. Please try again.</p>}
    </div>}
    {recent.length > 0 && <>
      <div className="baarali-section-heading"><h2>Resume a session</h2></div>
      <div className="baarali-work-sessions">{recent.map(session => {
        const state = statusOf(session.id)
        const project = projects.find(row => row.project.id === session.projectId)
        return <button type="button" key={session.id} onClick={() => onOpen(session.id)}><Code2 size={18} /><span><strong>{session.title || 'New session'}</strong><small>{project ? projectLabel(project) : session.cwd}</small></span>
          <span className="baarali-session-state" data-status={state}>{state === 'working' ? 'Working' : state === 'needs-you' ? 'Needs your input' : 'Ready'}</span></button>
      })}</div>
    </>}
    {projects.length > 0 && <>
      <div className="baarali-section-heading"><h2>Your projects</h2></div>
      <div className="baarali-project-grid">{projects.map(row => <button type="button" key={row.project.id} aria-label={`New thread in ${projectLabel(row)}`} onClick={() => onNew(row.project.id)}><FolderGit2 size={20} /><strong>{projectLabel(row)}</strong><small>{row.git.branch ?? 'Project folder'}</small><Plus size={15} /></button>)}</div>
    </>}
  </section>
}
