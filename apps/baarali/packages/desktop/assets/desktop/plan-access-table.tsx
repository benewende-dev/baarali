import { Check, LockKeyhole } from 'lucide-react'
import type { PlanOffer } from '@x/shared/src/billing.js'
import { lockedNote, planAccess, type Cell, type Tier } from '@/lib/plan-access-copy'
import { cn } from '@/lib/utils'

// BAARALI(07/11/2026): what each plan opens, in the app's plans window, from
// the same table as baarali.com/tarifs (plan-access-copy.ts). The account's
// own plan is underlined.
const tierOf = (plan: PlanOffer): Tier => (plan.free ? 'free' : plan.id.startsWith('pro') ? 'pro' : 'starter')

function Mark({ cell }: { cell: Cell }) {
    if (cell === true) return <Check className="mx-auto size-4 text-foreground" aria-label="Included" />
    if (cell === false) return <span className="text-muted-foreground/60" aria-label="Not included">—</span>
    return <span className="text-xs text-muted-foreground">{cell}</span>
}

export function PlanAccessTable({ plans, lang, currentId }: { plans: PlanOffer[]; lang: 'fr' | 'en'; currentId: string | null }) {
    const mine = (plan: PlanOffer) => plan.levels.some((l) => l.id === currentId)
    return (
        <section aria-label="What each plan includes" className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
                <thead>
                    <tr className="border-b">
                        <td className="w-[38%] p-3" />
                        {plans.map((plan) => (
                            <th key={plan.id} scope="col" className={cn('p-3 text-center font-semibold', mine(plan) && 'bg-muted/50')}>
                                {plan.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {planAccess(lang).map((group) => [
                        <tr key={group.name}>
                            <th scope="colgroup" colSpan={plans.length + 1} className="px-3 pb-1.5 pt-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" data-no-translate>
                                {group.name}
                            </th>
                        </tr>,
                        ...group.rows.map((row) => (
                            <tr key={row.text} className="border-t border-border/60">
                                <th scope="row" className="p-3 text-left font-normal" data-no-translate>{row.text}</th>
                                {plans.map((plan) => (
                                    <td key={plan.id} className={cn('p-3 text-center', mine(plan) && 'bg-muted/50')} data-no-translate>
                                        <Mark cell={row.cells[tierOf(plan)]} />
                                    </td>
                                ))}
                            </tr>
                        )),
                    ])}
                </tbody>
            </table>
        </section>
    )
}

/** On Découverte's card: what waits for a paid plan. */
export function LockedNote({ lang }: { lang: 'fr' | 'en' }) {
    return (
        <p className="mt-1 flex gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground" data-no-translate>
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
            {lockedNote(lang)}
        </p>
    )
}
