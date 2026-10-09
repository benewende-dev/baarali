// BAARALI(2026-10-09): the chat's card for a motion project the agent made
// (mockup validated by the founder the same day): the project's name and
// what it is, and one button that opens it in the Studio Motion.
import { ClapperboardIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFileCard } from '@/contexts/file-card-context'
import { motionProjectName } from '@/lib/motion-project'
import { CardShell } from './file-path-card'

export function MotionFileCard({ filePath }: { filePath: string }) {
  const { onOpenFile, onPreviewFile } = useFileCard()
  const name = motionProjectName(filePath)
  // The project's place in the workspace is known: motion/<name>/index.html, wherever the path was written from.
  const open = () => (onOpenFile && name ? onOpenFile(`motion/${name}/index.html`) : onPreviewFile(filePath))
  return (
    <CardShell
      icon={<ClapperboardIcon className="h-5 w-5 text-muted-foreground" />}
      title={name ?? filePath}
      subtitle="Motion video"
      onClick={open}
      action={<Button size="sm" className="h-8 text-xs" onClick={(event) => { event.stopPropagation(); open() }}>Open the studio</Button>}
    />
  )
}
