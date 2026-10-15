import { Code2, FolderGit2, FolderPlus, Plus } from 'lucide-react'
import type { CodeSession, CodeSessionStatus } from '@x/shared/src/code-sessions.js'
import { projectLabel, type ProjectRow } from './code/use-code-sessions'
import { BaaraliMark } from './baarali-mark'

export function DesktopCodeHome({ projects, sessions, statusOf, onOpen, onAdd, onNew }: {
  projects: ProjectRow[]; sessions: CodeSession[]; statusOf: (id: string) => CodeSessionStatus
  onOpen: (id: string) => void; onAdd: () => void; onNew: (projectId: string) => void
}) {
  const recent = sessions.filter(session => !session.doneAt).slice(0, 5)
  return <section className="baarali-code-home">
    <div className="baarali-work-welcome"><BaaraliMark size={38} /><div><h1>Your workspace</h1><p>Build, review and move your projects forward.</p></div></div>
    <div className="baarali-section-heading"><h2>Resume a session</h2><button type="button" onClick={onAdd}><FolderPlus size={15} />Add a project</button></div>
    <div className="baarali-work-sessions">{recent.map(session => {
      const state = statusOf(session.id)
      const project = projects.find(row => row.project.id === session.projectId)
      return <button type="button" key={session.id} onClick={() => onOpen(session.id)}><Code2 size={18} /><span><strong>{session.title || 'New session'}</strong><small>{project ? projectLabel(project) : session.cwd}</small></span>
        <span className="baarali-session-state" data-status={state}>{state === 'working' ? 'Working' : state === 'needs-you' ? 'Needs your input' : 'Ready'}</span></button>
    })}</div>
    {recent.length === 0 && <p className="baarali-empty-hint">Open a project to start your first session.</p>}
    <div className="baarali-section-heading"><h2>Your projects</h2></div>
    <div className="baarali-project-grid">{projects.map(row => <button type="button" key={row.project.id} aria-label={`New thread in ${projectLabel(row)}`} onClick={() => onNew(row.project.id)}><FolderGit2 size={20} /><strong>{projectLabel(row)}</strong><small>{row.git.branch ?? 'Project folder'}</small><Plus size={15} /></button>)}</div>
    {projects.length === 0 && <button type="button" className="baarali-add-project" onClick={onAdd}><FolderPlus size={22} /><strong>Add a project folder</strong><small>Start a conversation with the files and tools you need.</small></button>}
  </section>
}
