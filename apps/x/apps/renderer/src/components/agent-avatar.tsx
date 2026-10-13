import type { AgentAvatarId } from '@x/shared/dist/baarasseur.js'
import original from '@/assets/baarali-avatars/original.svg'
import bop from '@/assets/baarali-avatars/bop.png'
import moki from '@/assets/baarali-avatars/moki.png'
import nova from '@/assets/baarali-avatars/nova.png'
import tiko from '@/assets/baarali-avatars/tiko.png'
import nimbo from '@/assets/baarali-avatars/nimbo.png'
import pixel from '@/assets/baarali-avatars/pixel.png'
import zest from '@/assets/baarali-avatars/zest.png'
import ink from '@/assets/baarali-avatars/ink.png'
import street from '@/assets/baarali-avatars/street.png'

// BAARALI(11/10/2026): the same assets and ids as the phone, rendered from
// the saved profile rather than a separate browser preference.
const SOURCES: Record<AgentAvatarId, string> = { original, bop, moki, nova, tiko, nimbo, pixel, zest, ink, street }
export function AgentAvatarImage({ avatar }: { avatar: AgentAvatarId }) {
  return <img src={SOURCES[avatar]} alt="" className="h-full w-full object-contain p-0.5" draggable={false} />
}
