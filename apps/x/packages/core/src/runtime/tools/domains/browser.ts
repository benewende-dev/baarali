// Builtin tools: browser domain. Entries moved VERBATIM from the historical
// monolith — the merge order in ../builtin-tools.ts preserves the original
// catalog key order (provider-payload bytes; see the key-order test there).

import { z } from "zod";
import container from "../../../di/container.js";
import { BrowserControlInputSchema, type BrowserControlInput } from "@x/shared/dist/browser-control.js";
import { ensureLoaded as ensureBrowserSkillsLoaded, readSkillContent as readBrowserSkillContent, refreshFromRemote as refreshBrowserSkills } from "../../../application/browser-skills/index.js";
import type { ToolContext } from "../exec-tool.js";
import type { IBrowserControlService } from "../../../application/browser-control/service.js";
import { BuiltinToolsSchema } from "../types.js";
import { isSignedIn } from "../../../account/account.js";
import { API_URL } from "../../../config/env.js";
import { authedFetch } from "../../../models/gateway.js";
import { fastRun, type DecisionAnswer } from "../../../application/browser-control/fast-run.js";

// BAARALI(06/10/2026): the fast browser mode's two calls, through the
// control plane like every model call (the OpenRouter key never reaches the
// app), and counted in the plan's usage.
async function gatewayPost(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const res = await authedFetch(`${API_URL}/v1/llm${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
        const error = data.error as { code?: string; message?: string } | undefined;
        if (res.status === 429) throw new Error("La limite d’usage du forfait est atteinte ; aucune action faite.");
        throw new Error(`Le service de décision a répondu ${res.status}${error?.message ? ` : ${error.message}` : ""} ; aucune action faite.`);
    }
    return data;
}

const costOf = (data: Record<string, unknown>) => {
    const cost = (data.usage as { cost?: unknown } | undefined)?.cost;
    return typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
};

/**
 * The small model that writes a field's text when the goal describes it
 * without giving it (the founder's choice, 06/10/2026: Qwen 3.8 Flash, good
 * French for pennies; GPT-6 Luna if it fails). Découverte's calls go to its
 * own list instead.
 */
const TEXT_MODELS = ["qwen/qwen3.8-flash", "openai/gpt-6-luna"];


export const browserTools: z.infer<typeof BuiltinToolsSchema> = {
    'load-browser-skill': {
        permission: "none",
        description: 'Load a site-specific browser skill (from the browser-use/browser-harness domain-skills library) by id. Returns the full markdown content with selectors, gotchas, and recipes for the target site. Call this after browser-control responses surface a matching skill in suggestedSkills. Pass action="list" to see all available skills. Skills are fetched on first use and cached locally; pass action="refresh" to force an update from upstream.',
        inputSchema: z.object({
            action: z.enum(['load', 'list', 'refresh']).optional().describe('load: fetch a skill by id (default). list: list all cached skills. refresh: re-fetch the library from upstream.'),
            id: z.string().optional().describe('Skill id (e.g., "github/repo-actions") — required for load.'),
            site: z.string().optional().describe('Filter list results to a single site (e.g., "github").'),
        }),
        execute: async (input: { action?: 'load' | 'list' | 'refresh'; id?: string; site?: string }) => {
            const action = input.action ?? 'load';
            try {
                if (action === 'refresh') {
                    const index = await refreshBrowserSkills();
                    return {
                        success: true,
                        message: `Refreshed ${index.entries.length} skill${index.entries.length === 1 ? '' : 's'} from upstream.`,
                        count: index.entries.length,
                        treeSha: index.treeSha,
                    };
                }

                if (action === 'list') {
                    const status = await ensureBrowserSkillsLoaded();
                    if (status.status === 'error') {
                        return { success: false, error: status.error };
                    }
                    if (status.status === 'empty') {
                        return { success: false, error: 'No browser skills cached yet.' };
                    }
                    const entries = status.index.entries
                        .filter((e) => !input.site || e.site === input.site)
                        .map((e) => ({ id: e.id, title: e.title, site: e.site }));
                    return {
                        success: true,
                        count: entries.length,
                        skills: entries,
                        cacheAgeMs: Date.now() - status.index.fetchedAt,
                        refreshing: status.status === 'stale' ? status.refreshing : false,
                    };
                }

                if (!input.id) {
                    return { success: false, error: 'id is required for load.' };
                }
                const result = await readBrowserSkillContent(input.id);
                if (!result.ok) {
                    return { success: false, error: result.error };
                }
                return {
                    success: true,
                    id: result.entry.id,
                    title: result.entry.title,
                    site: result.entry.site,
                    path: result.entry.path,
                    content: result.content,
                };
            } catch (err) {
                return { success: false, error: err instanceof Error ? err.message : 'Failed to load browser skill.' };
            }
        },
    },

    // ============================================================================
    // Browser Control
    // ============================================================================,

    'browser-control': {
        permission: "none",
        description: 'Control the embedded browser pane. Read the current page, inspect indexed interactable elements, and navigate/click/type/press keys in the active browser tab.',
        inputSchema: BrowserControlInputSchema,
        isAvailable: async () => {
            try {
                container.resolve<IBrowserControlService>('browserControlService');
                return true;
            } catch {
                return false;
            }
        },
        execute: async (input: BrowserControlInput, ctx?: ToolContext) => {
            try {
                const browserControlService = container.resolve<IBrowserControlService>('browserControlService');
                return await browserControlService.execute(input, { signal: ctx?.signal });
            } catch (error) {
                return {
                    success: false,
                    action: input.action,
                    error: error instanceof Error ? error.message : 'Browser control is unavailable.',
                    browser: {
                        activeTabId: null,
                        tabs: [],
                    },
                };
            }
        },
    },

    // ============================================================================
    // Fast browser mode (BAARALI 06/10/2026)
    // ============================================================================,

    'browser-run': {
        permission: "none",
        description: 'Fast browser mode: give a goal in plain words and a small decision model carries it out in the embedded browser, step by step (click, type, scroll), about half a second a step and a hundred times cheaper than doing each step yourself. Prefer it to browser-control for any task with a clear goal on a normal web page (fill a form, search, open a result, prepare a post). Put every text to type in `values`, by name, exactly as it must appear. It never publishes, sends, pays or deletes: before such a click it stops with status "awaiting_approval" and a `pending` element; tell the user what it is about to do and call browser-confirm with that element. On "blocked" (sign-in, captcha, canvas) or "max_steps", continue with browser-control yourself from the page it reached.',
        inputSchema: z.object({
            goal: z.string().min(1).describe('The whole goal, in plain words, with every requirement (e.g. "Create a post on the Sahel Matériaux Facebook page with the text and attach affiche-lundi.png").'),
            startUrl: z.string().optional().describe('A URL to open first; the current page otherwise.'),
            values: z.record(z.string(), z.string()).optional().describe('Texts to type, by name: {"texte du post": "…", "email": "…"}. Typed exactly as given.'),
            maxSteps: z.number().int().positive().max(40).optional().describe('At most 40 (the default).'),
        }),
        isAvailable: async () => {
            try {
                container.resolve<IBrowserControlService>('browserControlService');
                return await isSignedIn();
            } catch {
                return false;
            }
        },
        execute: async (input: { goal: string; startUrl?: string; values?: Record<string, string>; maxSteps?: number }, ctx?: ToolContext) => {
            const browser = container.resolve<IBrowserControlService>('browserControlService');
            return fastRun(input, {
                browser: (action) => browser.execute(action, { signal: ctx?.signal }),
                decide: async (body) => {
                    const data = await gatewayPost('/systemone', body, ctx?.signal);
                    const answers = data.answers && typeof data.answers === 'object' ? data.answers as Record<string, DecisionAnswer> : {};
                    return { answers, cost: costOf(data) };
                },
                write: async ({ system, user }) => {
                    const data = await gatewayPost('/chat/completions', {
                        model: TEXT_MODELS[0],
                        models: TEXT_MODELS,
                        max_tokens: 600,
                        reasoning: { enabled: false },
                        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                    }, ctx?.signal);
                    const content = (data.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message?.content;
                    const text = typeof content === 'string' ? content.trim().replace(/^"(.*)"$/s, '$1') : '';
                    return { text: text && text !== 'NONE' && text.length <= 4000 ? text : null, cost: costOf(data) };
                },
                now: () => Date.now(),
                signal: ctx?.signal,
            });
        },
    },

    'browser-confirm': {
        permission: "prompt",
        description: 'Do the one browser action browser-run stopped before (publish, send, pay, delete…), after the user has seen what it does: always asks the user\'s approval. Pass the `pending` element browser-run returned, unchanged, and in `summary` say in the user\'s language what it will do ("Publier le post sur la page Sahel Matériaux").',
        inputSchema: z.object({
            summary: z.string().min(1).describe('What this action will do, for the approval card.'),
            index: z.number().int().positive(),
            snapshotId: z.string().min(1),
            label: z.string().optional(),
            enter: z.boolean().optional().describe('True when browser-run stopped before pressing Enter in a field rather than a click.'),
        }),
        isAvailable: async () => {
            try {
                container.resolve<IBrowserControlService>('browserControlService');
                return true;
            } catch {
                return false;
            }
        },
        execute: async (input: { summary: string; index: number; snapshotId: string; enter?: boolean }, ctx?: ToolContext) => {
            const browser = container.resolve<IBrowserControlService>('browserControlService');
            try {
                return await browser.execute(
                    input.enter
                        ? { action: 'press', key: 'Enter', index: input.index, snapshotId: input.snapshotId }
                        : { action: 'click', index: input.index, snapshotId: input.snapshotId },
                    { signal: ctx?.signal },
                );
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Browser control is unavailable.' };
            }
        },
    },

    // ============================================================================
    // App Navigation
    // ============================================================================,
};
