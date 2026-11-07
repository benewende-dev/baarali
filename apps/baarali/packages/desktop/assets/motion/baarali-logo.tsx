// BAARALI(11/10/2026): Chargement animates the approved compact B in the sidebar.
import { BaaraliMark } from '@/components/baarali-mark';
import { WORD as B_WORD } from '@/lib/baarali-b-mark';

// BAARALI(07/11/2026): the word in Geist SemiBold, one colour (sign C).
const WORD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${B_WORD.left} 0 ${B_WORD.width - B_WORD.left} ${B_WORD.capHeight}" role="img" aria-label="Baarali"><path d="${B_WORD.d}" fill="currentColor"/></svg>`

export function BaaraliLogo() {
  return (
    <span className="flex items-center gap-2" aria-label="Baarali" role="img">
      <BaaraliMark size={28} motion="loading" className="text-sidebar-foreground" />
      <span className="h-[14px] text-sidebar-foreground [&>svg]:h-full [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: WORD }} />
    </span>
  )
}
