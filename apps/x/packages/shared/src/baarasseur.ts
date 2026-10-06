import z from "zod";

// BAARALI(06/10/2026): the baarasseurs — named agents the user recruits
// (baara, work in Dioula, and « bosseurs »). Each one is the copilot with its
// own name, mission, tools, model and hours: it keeps every capability of the
// assistant, and its conversations carry the agent id `baarasseur-<id>`.
// They live in the workspace (config/baarasseurs.json), written by the app's
// Baarasseurs page and read by the core on every turn, so an edit applies to
// the next message.

export const BAARASSEURS_PATH = "config/baarasseurs.json";
export const BAARASSEUR_PREFIX = "baarasseur-";
/** A rule it keeps is a line, and it keeps a few: the prompt stays short. */
export const MEMORY_LIMIT = 30;

export const BaarasseurScheduleSchema = z.object({
    every: z.enum(["day", "weekday", "week", "month"]),
    /** The day of the week (0 = Sunday) for "week", of the month (1–28) for "month". */
    day: z.number().int().min(0).max(28).optional(),
    hour: z.number().int().min(0).max(23),
});

export const BaarasseurSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(40),
    role: z.string().max(60).default(""),
    mission: z.string().max(4000).default(""),
    /** One of the avatar tints the app offers. */
    color: z.string().max(20).default("clay"),
    /** The tools it works with, as the app names them (Gmail, WhatsApp…). */
    tools: z.array(z.string().max(40)).max(20).default([]),
    model: z.string().optional(),
    provider: z.string().optional(),
    schedule: BaarasseurScheduleSchema.nullable().optional(),
    memory: z.array(z.string().max(300)).max(MEMORY_LIMIT).default([]),
    createdAt: z.string(),
});

// Written out rather than inferred, so every package reads the same shape.
export interface BaarasseurSchedule {
    every: "day" | "weekday" | "week" | "month";
    day?: number;
    hour: number;
}

export interface Baarasseur {
    id: string;
    name: string;
    role: string;
    mission: string;
    color: string;
    tools: string[];
    model?: string;
    provider?: string;
    schedule?: BaarasseurSchedule | null;
    memory: string[];
    createdAt: string;
}

export function baarasseurAgentId(id: string): string {
    return `${BAARASSEUR_PREFIX}${id}`;
}

export function baarasseurIdOf(agentId: string | null | undefined): string | null {
    return agentId?.startsWith(BAARASSEUR_PREFIX) ? agentId.slice(BAARASSEUR_PREFIX.length) : null;
}

/** Reads the file's text leniently: a broken entry is dropped, not the whole team. */
export function parseBaarasseurs(text: string | null | undefined): Baarasseur[] {
    if (!text) return [];
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return [];
    }
    const list = (raw as { baarasseurs?: unknown })?.baarasseurs;
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry) => {
        const parsed = BaarasseurSchema.safeParse(entry);
        return parsed.success ? [parsed.data as Baarasseur] : [];
    });
}

export function scheduleCron(s: BaarasseurSchedule): string {
    switch (s.every) {
        case "day": return `0 ${s.hour} * * *`;
        case "weekday": return `0 ${s.hour} * * 1-5`;
        case "week": return `0 ${s.hour} * * ${s.day ?? 1}`;
        case "month": return `0 ${s.hour} ${Math.max(1, s.day ?? 1)} * *`;
    }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** In English for the prompt; the app words it in the user's language. */
export function scheduleWords(s: BaarasseurSchedule): string {
    const at = `at ${s.hour}:00`;
    switch (s.every) {
        case "day": return `every day ${at}`;
        case "weekday": return `every weekday ${at}`;
        case "week": return `every ${DAYS[s.day ?? 1]} ${at}`;
        case "month": return `on day ${Math.max(1, s.day ?? 1)} of every month ${at}`;
    }
}

/** What its scheduled run opens with. */
export const SCHEDULED_MESSAGE = "It is time for your scheduled run. Do your mission now, then report briefly: what you did, and what waits for my approval.";

/**
 * The part of the system prompt that makes the copilot this baarasseur.
 * What the user typed goes in as their words, fenced, never as our rules.
 */
export function personaInstructions(b: Baarasseur): string {
    const lines = [
        `# You are ${b.name}${b.role ? `, ${b.role}` : ""}`,
        "",
        `In this conversation you are not the general assistant: you are ${b.name}, a « baarasseur » the user recruited in Baarali — a named colleague with one mission. Speak as ${b.name}, in the user's language, and keep to your mission; for anything far from it, say that the Baarali assistant is better placed.`,
        "",
        "## Your mission, in the user's words",
        "<mission>",
        b.mission.trim() || "(No mission written yet: ask the user what you should take care of.)",
        "</mission>",
    ];
    if (b.tools.length > 0) {
        lines.push(
            "",
            "## Your tools",
            `The user gave you these to work with: ${b.tools.join(", ")}. Prefer them; use another only when the mission truly needs it. If one is not connected yet, say so and tell the user where to connect it.`,
        );
    }
    lines.push(
        "",
        "## What you remember",
        ...(b.memory.length > 0 ? b.memory.map((m) => `- ${m}`) : ["(Nothing yet.)"]),
        `When the user gives you a lasting rule or fact for your mission, call \`baarasseur-remember\` with id "${b.id}" and the rule in one short line, then confirm it in one sentence.`,
    );
    if (b.schedule) {
        lines.push(
            "",
            "## Your hours",
            `You also work on your own, ${scheduleWords(b.schedule)}. A scheduled run has nobody watching: never send, publish, post, pay or delete during it. Prepare drafts instead, and end with a short report of what you did and what waits for the user's approval.`,
        );
    }
    return lines.join("\n");
}
