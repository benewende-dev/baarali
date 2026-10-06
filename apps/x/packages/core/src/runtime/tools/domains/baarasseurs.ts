// BAARALI(06/10/2026): the one tool only a baarasseur gets — keeping a rule
// of its mission. Attached by loadAgent to baarasseur agents, never to the
// copilot itself; it writes to the user's own workspace, hence no approval.

import { z } from "zod";
import { BuiltinToolsSchema } from "../types.js";
import { rememberFor } from "../../../baarasseurs/repo.js";

export const baarasseurTools: z.infer<typeof BuiltinToolsSchema> = {
    "baarasseur-remember": {
        permission: "none",
        description: "Keep a lasting rule or fact for your mission as a baarasseur (one short line, e.g. « Livraison offerte au-delà de 50 sacs »). It joins « What you remember » in every later conversation. Only for what the user asked you to keep or clearly stated as a rule.",
        inputSchema: z.object({
            id: z.string().describe("Your baarasseur id, as your instructions give it."),
            note: z.string().describe("The rule or fact, in one short line, in the user's language."),
        }),
        execute: async ({ id, note }: { id: string; note: string }) => {
            const memory = await rememberFor(id, note);
            return memory
                ? { success: true, remembered: note, count: memory.length }
                : { success: false, error: "Unknown baarasseur or empty note." };
        },
    },
};
