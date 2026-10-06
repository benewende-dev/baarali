"use client";

// BAARALI(06/10/2026): the fast browser mode's card, after the validated
// mockup (claude.ai/artifact/C6AvQ6fn9rhFjwMyDiYaAH): the goal, each step
// with its time, then the count, the duration and the cost. Strings are
// English and whole, so the French layer translates them (fr.ts); what
// comes from the page is marked data-no-translate.

import { LoaderIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeToolInput, type ToolCall } from "@/lib/chat-conversation";

interface Step {
  operation: string;
  index?: number;
  label?: string;
  text?: string;
  ms: number;
}

export interface FastBrowseData {
  goal: string;
  status: string | null;
  steps: Step[];
  url: string | null;
  costUsd: number;
  durationMs: number;
}

/** A dollar is about 600 F CFA: the card shows an order of size, not an invoice. */
const XOF_PER_USD = 600;

const OPERATIONS: Record<string, string> = {
  CLICK: "Click",
  TYPE_TEXT: "Write",
  PRESS_ENTER: "Enter",
  SCROLL_DOWN: "Scroll",
  SCROLL_UP: "Scroll",
  WAIT: "Wait",
  DONE: "Done",
  BLOCKED: "Blocked",
};

const STATES: Record<string, { label: string; tone: "ok" | "wait" | "warn" }> = {
  done: { label: "Done", tone: "ok" },
  awaiting_approval: { label: "Waiting for your approval", tone: "wait" },
  uncertain: { label: "Handed back to the assistant", tone: "wait" },
  blocked: { label: "Handed back to the assistant", tone: "warn" },
  max_steps: { label: "Step limit reached", tone: "warn" },
  stopped: { label: "Stopped", tone: "warn" },
  error: { label: "Failed", tone: "warn" },
};

export function getFastBrowseData(tool: ToolCall): FastBrowseData | null {
  if (tool.name !== "browser-run") return null;
  const normalized = normalizeToolInput(tool.input);
  const input = (typeof normalized === "object" && normalized ? normalized : {}) as Record<string, unknown>;
  const result = (typeof tool.result === "object" && tool.result ? tool.result : {}) as Record<string, unknown>;
  const page = result.page as { url?: unknown } | null | undefined;
  return {
    goal: typeof input.goal === "string" ? input.goal : "",
    status: typeof result.status === "string" ? result.status : null,
    steps: Array.isArray(result.steps) ? (result.steps as Step[]).filter((s) => s && typeof s.operation === "string") : [],
    url: typeof page?.url === "string" ? page.url : typeof input.startUrl === "string" ? input.startUrl : null,
    costUsd: typeof result.costUsd === "number" ? result.costUsd : 0,
    durationMs: typeof result.durationMs === "number" ? result.durationMs : 0,
  };
}

/** In the system's way of writing numbers: 5,8 in French. */
const decimal = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const seconds = (ms: number) => decimal(ms / 1000);

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function FastBrowseCard({ data, status }: { data: FastBrowseData; status: ToolCall["status"] }) {
  const running = status === "pending" || status === "running";
  const state = running ? null : STATES[data.status ?? "error"] ?? STATES.error;
  let elapsed = 0;
  const cost = data.costUsd * XOF_PER_USD;

  return (
    <div className="not-prose my-1 w-full overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ZapIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Fast browsing</div>
          <div className="truncate text-xs text-muted-foreground" data-no-translate>
            {[host(data.url), data.goal].filter(Boolean).join(" · ")}
          </div>
        </div>
        {running ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderIcon className="size-3 animate-spin" />
            <span>Running</span>
          </span>
        ) : state ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              state.tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              state.tone === "wait" && "bg-primary/10 text-primary",
              state.tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            {state.label}
          </span>
        ) : null}
      </div>

      {data.steps.length > 0 && (
        <ol className="max-h-60 list-none overflow-y-auto py-1.5 text-[12.5px]">
          {data.steps.map((step, i) => {
            elapsed += step.ms;
            const what = step.text ? `${step.label ?? ""} — ${step.text}` : step.label;
            return (
              <li key={i} className="grid grid-cols-[48px_76px_1fr] items-baseline gap-2 px-3 py-1">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground" data-no-translate>{seconds(elapsed)} s</span>
                <span
                  className={cn(
                    "font-mono text-[10.5px] font-medium uppercase text-primary",
                    step.operation === "TYPE_TEXT" && "text-emerald-700 dark:text-emerald-400",
                    step.operation === "BLOCKED" && "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {OPERATIONS[step.operation] ?? step.operation}
                  {step.index !== undefined && <span data-no-translate> [{step.index}]</span>}
                </span>
                <span className="min-w-0 truncate" data-no-translate>{what ?? ""}</span>
              </li>
            );
          })}
        </ol>
      )}

      {!running && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs tabular-nums text-muted-foreground">
          <span><b className="text-foreground" data-no-translate>{data.steps.length}</b> <span>steps</span></span>
          <span><b className="text-foreground" data-no-translate>{seconds(data.durationMs)} s</b></span>
          <span><span>Cost</span> <b className="text-foreground" data-no-translate>≈ {decimal(Math.max(cost, 0.1))} F CFA</b></span>
        </div>
      )}
    </div>
  );
}
