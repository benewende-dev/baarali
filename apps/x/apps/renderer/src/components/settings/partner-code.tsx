"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Gift, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { PartnerCodeState } from "@x/shared/dist/billing.js"

// Baarali (08/10/2026): a creator's partner code, typed in the days after
// signing up (the site's ?p= link does it by itself). Shown while it can
// still be typed; once linked, who recommended Baarali. Hidden otherwise.

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" })

export function PartnerCode({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<PartnerCodeState | null>(null)
  const [code, setCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let live = true
    window.ipc.invoke("billing:getPartnerCode", null).then((s) => { if (live) setState(s) }, () => {})
    return () => { live = false }
  }, [enabled])

  if (!state || (!state.canRedeem && !state.partner)) return null

  const submit = async () => {
    if (!code.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.ipc.invoke("billing:redeemPartnerCode", { code: code.trim() })
      if (result.ok) {
        setApplied(result.gift ? `Code from ${result.partner} applied. ${result.gift.plan} is yours until ${day(result.gift.endsAt)}.` : `Code from ${result.partner} applied.`)
        setState({ ...state, partner: result.partner, canRedeem: false, until: null })
      } else {
        setError(result.message)
      }
    } catch {
      setError("The code could not be checked. Try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  // Followed by its own separator: hidden, it leaves none behind.
  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Partner code</h4>
      </div>
      {applied ? (
        <div className="flex items-center gap-2 rounded-lg border bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <p className="text-sm">{applied}</p>
        </div>
      ) : state.partner ? (
        <p className="text-sm text-muted-foreground">Recommended by {state.partner}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {state.gift
              ? `Did a creator recommend Baarali? Enter their code before ${day(state.until!)}: ${state.gift.plan} is yours for ${state.gift.days} days.`
              : `Did a creator recommend Baarali? Enter their code before ${day(state.until!)}.`}
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit() }}
              placeholder="AWATECH"
              aria-label="Partner code"
              className="h-8 font-mono text-sm uppercase"
              maxLength={16}
            />
            <Button size="sm" onClick={() => void submit()} disabled={!code.trim() || submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
    <Separator />
    </>
  )
}
