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
export const DOCUMENTS_LIMIT = 20;
/** Where its documents are kept, one folder each. */
export const DOCUMENTS_DIR = "baarasseurs";

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
    /** Its documents (08/10/2026): workspace paths it reads when the mission needs them. */
    documents: z.array(z.string().max(300)).max(DOCUMENTS_LIMIT).default([]),
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
    documents?: string[];
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

/** When it next works on its own, on this machine's clock (the routine's cron runs on it). */
export function nextRunAt(s: BaarasseurSchedule, from: Date): Date {
    const at = new Date(from);
    at.setMinutes(0, 0, 0);
    at.setHours(s.hour);
    const fits = (d: Date) => {
        switch (s.every) {
            case "day": return true;
            case "weekday": return d.getDay() >= 1 && d.getDay() <= 5;
            case "week": return d.getDay() === (s.day ?? 1);
            case "month": return d.getDate() === Math.max(1, s.day ?? 1);
        }
    };
    // A month at most ahead: every schedule here fits within one.
    for (let i = 0; i < 32; i++) {
        if (at > from && fits(at)) return at;
        at.setDate(at.getDate() + 1);
        at.setHours(s.hour, 0, 0, 0);
    }
    return at;
}

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
    const documents = b.documents ?? [];
    if (documents.length > 0) {
        lines.push(
            "",
            "## Your documents",
            "The user gave you these files, in the workspace. Read the one the task needs (parseFile for PDF, Word or Excel; the workspace tools for text) before answering from memory, and quote what you rely on.",
            ...documents.map((d) => `- ${d}`),
        );
    }
    if (b.schedule) {
        lines.push(
            "",
            "## Your hours",
            `You also work on your own, ${scheduleWords(b.schedule)}. A scheduled run has nobody watching: never send, publish, post, pay or delete during it. Prepare drafts instead, and end with a short report of what you did and what waits for the user's approval.`,
        );
    }
    return lines.join("\n");
}


// ---------------------------------------------------------------------------
// The recruiting kit, shared by the desktop and the phone (06/10/2026): the
// tools one can give, the templates of the site's carousel, the sentence →
// form step, and the save that keeps the team, its memory and its hours.
// Kept here, out of the apps' sources, so their i18n extractors never take a
// prompt or a template for interface text.

export type Lang = "fr" | "en";

/** The tools one can give, by the name the prompt and the chips use. */
export const TOOLS = [
    "Gmail", "Google Calendar", "WhatsApp", "Telegram", "Google Sheets", "Google Docs", "Google Drive",
    "Outlook", "Web search", "Browser", "Images and videos",
] as const;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The avatar tints, by name. */
export const COLORS = ["clay", "blue", "green", "violet", "rose", "amber", "teal"] as const;

type Words = { fr: string; en: string };
export interface Template {
    id: string;
    name: string;
    color: string;
    role: Words;
    /** A few words on what it handles, under the role on the template's card. */
    summary: Words;
    mission: Words;
    tools: string[];
    schedule: BaarasseurSchedule | null;
}

// The site's carousel (control home-page.ts), as ready-to-recruit baarasseurs.
export const TEMPLATES: Template[] = [
    {
        "id": "mariama",
        "name": "Mariama",
        "color": "clay",
        "tools": [
            "Gmail",
            "WhatsApp",
            "Google Sheets"
        ],
        "schedule": {
            "every": "week",
            "day": 1,
            "hour": 8
        },
        "role": {
            "fr": "Commerciale",
            "en": "Sales"
        },
        "summary": {
            "fr": "Relances, devis, prospects",
            "en": "Follow-ups, quotes, prospects"
        },
        "mission": {
            "fr": "Chaque lundi, relance les prospects qui n’ont pas répondu depuis une semaine, avec un message court et poli. Prépare les devis à partir de ma grille de prix. Ne promets jamais de remise sans mon accord.",
            "en": "Every Monday, follow up with prospects who have not answered for a week, with a short, polite message. Prepare quotes from my price list. Never promise a discount without my approval."
        }
    },
    {
        "id": "ibrahim",
        "name": "Ibrahim",
        "color": "blue",
        "tools": [
            "Google Sheets",
            "Gmail"
        ],
        "schedule": {
            "every": "month",
            "day": 5,
            "hour": 8
        },
        "role": {
            "fr": "Comptable SYSCOHADA",
            "en": "SYSCOHADA accountant"
        },
        "summary": {
            "fr": "Comptes, TVA, états financiers",
            "en": "Books, VAT, statements"
        },
        "mission": {
            "fr": "Tiens mes comptes selon le SYSCOHADA : classe les recettes et les dépenses, prépare la déclaration de TVA du mois et signale-moi tout écart.",
            "en": "Keep my books under SYSCOHADA: file income and expenses, prepare the month’s VAT return and point out anything that does not add up."
        }
    },
    {
        "id": "adjoua",
        "name": "Adjoua",
        "color": "violet",
        "tools": [
            "Google Calendar",
            "Gmail"
        ],
        "schedule": {
            "every": "weekday",
            "hour": 7
        },
        "role": {
            "fr": "Assistante personnelle",
            "en": "Personal assistant"
        },
        "summary": {
            "fr": "Agenda, emails, rappels",
            "en": "Calendar, emails, reminders"
        },
        "mission": {
            "fr": "Chaque matin, résume-moi mon agenda du jour et les emails importants. Propose des réponses courtes, et rappelle-moi ce qui ne doit pas attendre.",
            "en": "Every morning, sum up my day’s agenda and the important emails. Suggest short replies, and remind me of what cannot wait."
        }
    },
    {
        "id": "aminata",
        "name": "Aminata",
        "color": "green",
        "tools": [
            "WhatsApp",
            "Google Sheets"
        ],
        "schedule": null,
        "role": {
            "fr": "Gestion de boutique",
            "en": "Shop manager"
        },
        "summary": {
            "fr": "Stocks et commandes WhatsApp",
            "en": "Stock and WhatsApp orders"
        },
        "mission": {
            "fr": "Suis mes stocks dans mon tableau et réponds aux commandes WhatsApp : prix, disponibilité, livraison. Préviens-moi quand un article passe sous 10 unités.",
            "en": "Keep track of my stock in my sheet and answer WhatsApp orders: price, availability, delivery. Tell me when an item drops below 10 units."
        }
    },
    {
        "id": "fatou",
        "name": "Fatou",
        "color": "rose",
        "tools": [
            "Google Drive",
            "Gmail"
        ],
        "schedule": null,
        "role": {
            "fr": "RH et paie",
            "en": "HR and payroll"
        },
        "summary": {
            "fr": "Bulletins, congés, contrats",
            "en": "Payslips, leave, contracts"
        },
        "mission": {
            "fr": "Prépare les bulletins de paie, suis les congés et les contrats de l’équipe, et rappelle-moi les échéances (fins de contrat, déclarations sociales).",
            "en": "Prepare payslips, track the team’s leave and contracts, and remind me of deadlines (contract ends, social security returns)."
        }
    },
    {
        "id": "moussa",
        "name": "Moussa",
        "color": "amber",
        "tools": [
            "WhatsApp",
            "Google Calendar"
        ],
        "schedule": {
            "every": "day",
            "hour": 7
        },
        "role": {
            "fr": "Logistique",
            "en": "Logistics"
        },
        "summary": {
            "fr": "Livraisons, clients prévenus",
            "en": "Deliveries, customers kept informed"
        },
        "mission": {
            "fr": "Planifie les livraisons du jour par quartier, prépare un message pour prévenir chaque client de l’heure de passage, et signale les retards.",
            "en": "Plan the day’s deliveries by area, prepare a message telling each customer when we will come, and flag delays."
        }
    },
    {
        "id": "zara",
        "name": "Zara",
        "color": "teal",
        "tools": [
            "Images and videos",
            "Google Drive"
        ],
        "schedule": {
            "every": "week",
            "day": 1,
            "hour": 9
        },
        "role": {
            "fr": "Designer",
            "en": "Designer"
        },
        "summary": {
            "fr": "Visuels et posts de la semaine",
            "en": "Visuals and the week’s posts"
        },
        "mission": {
            "fr": "Chaque semaine, propose 3 publications pour mes réseaux : le texte et le visuel, dans mes couleurs. Rien n’est publié sans mon accord.",
            "en": "Every week, suggest 3 posts for my social media: the text and the visual, in my colours. Nothing is posted without my approval."
        }
    },
    {
        "id": "kofi",
        "name": "Kofi",
        "color": "blue",
        "tools": [
            "Google Sheets",
            "Web search"
        ],
        "schedule": null,
        "role": {
            "fr": "Analyste data",
            "en": "Data analyst"
        },
        "summary": {
            "fr": "Chiffres, tableaux, tendances",
            "en": "Figures, tables, trends"
        },
        "mission": {
            "fr": "Lis mes ventes et dis-moi, en 5 points maximum, ce qui marche, ce qui baisse et quoi changer.",
            "en": "Read my sales and tell me, in 5 points at most, what works, what is dropping and what to change."
        }
    }
];

/** A readable, unique id from the name: « Aminata » → aminata, then aminata-2. */
export function idFor(name: string, taken: string[]): string {
    const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "baarasseur";
    let id = base;
    for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
    return id;
}

export function templateToBaarasseur(t: Template, taken: string[], lang: Lang): Baarasseur {
    return {
        id: idFor(t.name, taken), name: t.name, role: t.role[lang], mission: t.mission[lang], color: t.color,
        tools: t.tools, schedule: t.schedule, memory: [], createdAt: new Date().toISOString(),
    };
}

export function blankBaarasseur(taken: string[]): Baarasseur {
    return { id: idFor("baarasseur", taken), name: "", role: "", mission: "", color: "clay", tools: [], schedule: null, memory: [], createdAt: new Date().toISOString() };
}

const DESCRIBE = [
    "You help a small business in West Africa recruit a « baarasseur »: a named AI colleague with one mission.",
    "From the user's sentence, answer ONLY with a JSON object, no prose, no code fence:",
    "{\"name\": a first name common in West Africa that fits, \"role\": 1 to 4 words, \"mission\": 2 to 4 sentences in the second person saying what to do, how, and what never to do without approval,",
    " \"tools\": a subset of $TOOLS, \"schedule\": null or {\"every\": \"day\"|\"weekday\"|\"week\"|\"month\", \"day\": 0-6 for week (0 = Sunday) or 1-28 for month, \"hour\": 0-23}}.",
    "Write name, role and mission in $LANG."
];
const LANGUAGES: Record<Lang, string> = { fr: "French, with « tu »", en: "English" };

/** Asks the model to fill the form from a sentence (llm:generate's system). */
export function describeSystem(lang: Lang): string {
    return DESCRIBE.join("\n").replace("$TOOLS", JSON.stringify(TOOLS)).replace("$LANG", LANGUAGES[lang]);
}

/** Reads the form the model filled, keeping only known tools and sane hours. */
export function parseDescribed(text: string): Partial<Baarasseur> | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const raw = JSON.parse(match[0]) as Record<string, unknown>;
        const out: Partial<Baarasseur> = {};
        if (typeof raw.name === "string") out.name = raw.name.slice(0, 40);
        if (typeof raw.role === "string") out.role = raw.role.slice(0, 60);
        if (typeof raw.mission === "string") out.mission = raw.mission.slice(0, 4000);
        if (Array.isArray(raw.tools)) out.tools = raw.tools.filter((t): t is string => (TOOLS as readonly string[]).includes(t as string));
        const s = raw.schedule as Record<string, unknown> | null | undefined;
        if (s === null) out.schedule = null;
        else if (s && ["day", "weekday", "week", "month"].includes(s.every as string) && typeof s.hour === "number") {
            out.schedule = {
                every: s.every as BaarasseurSchedule["every"],
                hour: Math.min(23, Math.max(0, Math.round(s.hour))),
                ...(typeof s.day === "number" ? { day: Math.min(28, Math.max(0, Math.round(s.day))) } : {}),
            };
        }
        return out;
    } catch {
        return null;
    }
}

/** Said to it during a try-out, after its persona: no tools, nothing sent. */
export const TRYOUT_NOTE = "## This is a try-out\nThe user is trying you out before recruiting you. You have no tools here: answer as you would, say what you would do and with which tool, but do not claim to have done it.";

/** Its scheduled run's first message, shown in its conversation. */
export const SCHEDULED_MESSAGES: Record<Lang, string> = {
    fr: "C’est l’heure de ton passage automatique. Fais ta mission maintenant, puis fais-moi un court rapport : ce que tu as fait, et ce qui attend mon accord.",
    en: SCHEDULED_MESSAGE,
};

/** The try-out's request: its persona, the note, and the exchange so far. */
export function tryoutRequest(b: Baarasseur, turns: Array<{ role: "user" | "assistant"; text: string }>) {
    const name = b.name.trim() || "Baarasseur";
    const transcript = turns.map((t) => `${t.role === "user" ? "USER" : name}: ${t.text}`).join("\n\n");
    return {
        prompt: `${transcript}\n\n${name}:`,
        system: `${personaInstructions({ ...b, name })}\n\n${TRYOUT_NOTE}`,
        ...(b.model ? { model: b.model, provider: b.provider } : {}),
    };
}

/** What the app's IPC or the phone's RPC offers: one call by channel. */
export type Invoke = (channel: string, args: unknown) => Promise<unknown>;

/**
 * Writes the team, then its hours: a removed one loses its schedule, a
 * changed one starts afresh. The file is read again first, so a rule a
 * baarasseur kept meanwhile (the core writes its memory) is not lost.
 * Returns the team as written.
 */
export async function saveTeam(
    invoke: Invoke,
    change: (current: Baarasseur[]) => Baarasseur[],
    touched: { id: string; removed?: boolean },
    lang: Lang,
): Promise<Baarasseur[]> {
    let current: Baarasseur[] = [];
    try {
        const r = await invoke("workspace:readFile", { path: BAARASSEURS_PATH, encoding: "utf8" }) as { data?: string };
        current = parseBaarasseurs(r?.data);
    } catch {
        // No file yet: the first recruit.
    }
    const next = change(current);
    await invoke("workspace:writeFile", {
        path: BAARASSEURS_PATH, data: JSON.stringify({ baarasseurs: next }, null, 2), opts: { mkdirp: true },
    });
    const agentName = baarasseurAgentId(touched.id);
    const b = next.find((x) => x.id === touched.id);
    await invoke("agent-schedule:deleteAgent", { agentName }).catch(() => {});
    if (!touched.removed && b?.schedule) {
        await invoke("agent-schedule:updateAgent", {
            agentName,
            entry: {
                schedule: { type: "cron", expression: scheduleCron(b.schedule) },
                enabled: true,
                startingMessage: SCHEDULED_MESSAGES[lang],
                description: `${b.name}${b.role ? ` · ${b.role}` : ""}`,
            },
        });
    }
    return next;
}

/** Saves one: rules kept since the form opened stay, unless the person removed them (`forgotten`). */
export function upsertChange(b: Baarasseur, forgotten: string[] = []) {
    return (current: Baarasseur[]): Baarasseur[] => {
        const stored = current.find((x) => x.id === b.id);
        if (!stored) return [...current, b];
        const memory = [...b.memory, ...stored.memory.filter((m) => !b.memory.includes(m) && !forgotten.includes(m))];
        return current.map((x) => (x.id === b.id ? { ...b, memory } : x));
    };
}
