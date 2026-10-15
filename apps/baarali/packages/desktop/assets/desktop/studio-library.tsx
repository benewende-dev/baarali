import { useCallback, useEffect, useState } from 'react'
import { Clapperboard, FolderOpen, RefreshCw } from 'lucide-react'
import { BaaraliMark } from './baarali-mark'
import { CadEditor } from './cad-editor'
import { motionProject } from '@/lib/motion-project'

// BAARALI(15/10/2026): the Work entry opens the same saved projects and
// editor as chat file cards; a missing folder is an empty library, not an error.
export function DesktopStudioLibrary({ onOpen, onCreate }: { onOpen: (path: string) => void; onCreate: () => void }) {
  const [projects, setProjects] = useState<Array<{ path: string; modified: number }>>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(value => value + 1), [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    void window.ipc.invoke('workspace:exists', { path: 'motion' })
      .then(result => result.exists ? window.ipc.invoke('workspace:readdir', { path: 'motion', opts: { recursive: true, includeStats: true } }) : [])
      .then(entries => {
        if (!alive) return
        setProjects(entries.filter(entry => entry.kind === 'file' && motionProject(entry.path)).map(entry => ({ path: motionProject(entry.path)!, modified: entry.stat?.mtimeMs ?? 0 })).sort((a, b) => b.modified - a.modified))
        setFailed(false)
      })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [version])
  return <section className="baarali-studio-library">
    <div className="flex items-center justify-between gap-3"><div><h1>Studio</h1><p>Open a project to preview, adjust its scenes or export it.</p></div>
      <button type="button" onClick={reload} aria-label="Refresh"><RefreshCw size={16} /></button></div>
    <CadEditor onProject={project => onOpen(`${project}/index.html`)} />
    <div className="flex items-center justify-between gap-3"><h2>Your creations</h2><button type="button" className="baarali-primary" onClick={onCreate}>Create with the agent</button></div>
    {loading && <div role="status" className="flex justify-center py-8"><BaaraliMark size={36} motion="loading" /></div>}
    {failed && <div role="alert"><p>Could not load projects. Try again.</p><button type="button" onClick={reload}>Retry</button></div>}
    {!loading && !failed && projects.length === 0 && <div className="baarali-studio-empty"><FolderOpen size={30} /><p>No creations yet. Describe your project to the agent to get started.</p></div>}
    <div className="baarali-studio-projects">{projects.map(project => <button type="button" key={project.path} onClick={() => onOpen(`${project.path}/index.html`)}>
      <Clapperboard size={22} /><span><strong>{project.path.slice('motion/'.length).replace(/[-_]/g, ' ')}</strong>
      {project.modified > 0 && <small>{new Date(project.modified).toLocaleDateString()}</small>}</span><FolderOpen size={16} /></button>)}</div>
  </section>
}
