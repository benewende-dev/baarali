"use client"

import { useEffect, useState } from "react"
import { Check, CheckCircle2, Gift, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { PartnerCodeCheck, PartnerCodeState, PlanOffer } from "@x/shared/dist/billing.js"

// Baarali (08/10/2026, mockup v2 validated the same day): a creator's partner
// code, typed in the days after signing up (the site's ?p= link does it by
// itself). Checked as it is typed, so the person sees whose it is and what it
// brings before applying it; then the offered plan's days. Hidden otherwise.

const DAY_MS = 86_400_000
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" })
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
/** What the field holds, as the control plane reads a code. */
const clean = (raw: string) => raw.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase()

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground ${small ? "size-6 text-[10px]" : "size-8 text-xs"}`}>
      {initials(name)}
    </span>
  )
}

interface PartnerCodeProps {
  enabled: boolean
  /** The plans as the pricing page words them: the gift says what it brings. */
  offers: PlanOffer[] | null
  /** The plan the person goes back to once the gift ends. */
  currentPlanName: string | null
  /** The account's plan changed (a code applied): the plan card refreshes. */
  onApplied?: () => void
}

export function PartnerCode({ enabled, offers, currentPlanName, onApplied }: PartnerCodeProps) {
  const [state, setState] = useState<PartnerCodeState | null>(null)
  const [code, setCode] = useState("")
  const [checked, setChecked] = useState<{ code: string; result: PartnerCodeCheck } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let live = true
    window.ipc.invoke("billing:getPartnerCode", null).then((s) => { if (live) setState(s) }, () => {})
    return () => { live = false }
  }, [enabled])

  // Checked once the typing pauses: whose code it is, before it is applied.
  const typed = clean(code)
  useEffect(() => {
    if (typed.length < 3) return
    let live = true
    const timer = setTimeout(() => {
      window.ipc.invoke("billing:checkPartnerCode", { code: typed }).then(
        (result) => { if (live) setChecked({ code: typed, result }) },
        () => {},
      )
    }, 350)
    return () => { live = false; clearTimeout(timer) }
  }, [typed])

  if (!state || (!state.canRedeem && !state.partner)) return null

  const check = checked?.code === typed ? checked.result : null
  const known = check?.ok ? check : null
  const refused = check && !check.ok ? check.message : null

  const submit = async () => {
    if (!known || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.ipc.invoke("billing:redeemPartnerCode", { code: typed })
      if (!result.ok) {
        setError(result.message)
        return
      }
      const fresh = await window.ipc.invoke("billing:getPartnerCode", null).catch(() => null)
      setState(fresh ?? { ...state, partner: result.partner, canRedeem: false, until: null, gift: null, running: null })
      onApplied?.()
    } catch {
      setError("The code could not be checked. Try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  const header = (chip?: string) => (
    <div className="flex items-center gap-2">
      <Gift className="size-4 text-muted-foreground" />
      <h4 className="text-sm font-medium">Partner code</h4>
      {chip && <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{chip}</span>}
    </div>
  )

  // Linked: the offered plan's days while they run, then one quiet line.
  if (state.partner) {
    const running = state.running
    const total = running ? Math.max(1, Math.round((Date.parse(running.endsAt) - Date.parse(running.startsAt)) / DAY_MS)) : 0
    const today = running ? Math.min(total, Math.max(1, Math.floor((Date.now() - Date.parse(running.startsAt)) / DAY_MS) + 1)) : 0
    return (
      <>
        <div className="space-y-3">
          {header()}
          {running ? (
            <div className="space-y-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {`${running.plan} is yours until ${day(running.endsAt)}`}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-emerald-600" style={{ width: `${Math.round((today / total) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{`Day ${today} of ${total}`}</span>
                <span>{`Recommended by ${state.partner}`}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm">
              <Avatar name={state.partner} small />
              <span className="text-muted-foreground">Recommended by</span>
              <span className="font-medium">{state.partner}</span>
            </div>
          )}
        </div>
        <Separator />
      </>
    )
  }

  const daysLeft = state.until ? Math.max(1, Math.ceil((Date.parse(state.until) - Date.now()) / DAY_MS)) : 0
  const gift = state.gift
  const points = gift ? (offers?.find((o) => o.levels.some((l) => l.id === gift.planId))?.points ?? []).slice(0, 3) : []

  return (
    <>
      <div className="space-y-3">
        {header(daysLeft === 1 ? "1 day left" : `${daysLeft} days left`)}
        <p className="text-xs text-muted-foreground">
          {gift
            ? `Did a creator recommend Baarali? Their code gives you ${gift.plan} for ${gift.days} days.`
            : "Did a creator recommend Baarali? Enter their code."}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit() }}
              placeholder="AWATECH"
              aria-label="Partner code"
              aria-invalid={Boolean(refused || error)}
              className="h-8 pr-24 font-mono text-sm uppercase tracking-wider"
              maxLength={20}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs">
              {typed.length >= 3 && !check ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : known ? (
                <span className="flex items-center gap-1 text-emerald-600"><Check className="size-3.5" />Recognised</span>
              ) : null}
            </span>
          </div>
          <Button size="sm" onClick={() => void submit()} disabled={!known || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
          </Button>
        </div>
        {(refused || error) && <p className="text-xs text-destructive">{error ?? refused}</p>}
        {known && (
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 p-2.5">
            <Avatar name={known.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{known.name}</p>
              {(known.network || known.city) && (
                <p className="truncate text-xs text-muted-foreground">{[known.network, known.city].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>
        )}
        {gift && (
          <div className="overflow-hidden rounded-lg border">
            <p className="bg-primary/10 px-3 py-2 text-sm">
              <span className="font-medium text-primary">{`${gift.plan} free`}</span>
              {` for ${gift.days} days`}
            </p>
            {points.length > 0 && (
              <ul className="space-y-1 px-3 pt-2.5">
                {points.map((point) => (
                  <li key={point} className="flex gap-2 text-[13px]">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-3 pb-2.5 pt-2 text-xs text-muted-foreground">
              {currentPlanName ? `Then back to ${currentPlanName}. No card, nothing to pay.` : "No card, nothing to pay."}
            </p>
          </div>
        )}
      </div>
      <Separator />
    </>
  )
}
