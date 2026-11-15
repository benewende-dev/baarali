// BAARALI(14/11/2026): the copilot keeps the name the person gives it
// (shared agent-name.ts). Only the copilot gets this tool (assembly
// registry.ts), never a baarasseur, which has baarasseur-update.

import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { WorkDir } from "../../../config/config.js";
import { BuiltinToolsSchema } from "../types.js";
import { AGENT_NAME_FILE, agentNameFile, cleanAgentName, parseAgentName } from "@x/shared/dist/agent-name.js";

export async function readCopilotName(): Promise<string | null> {
    return parseAgentName(await fs.readFile(path.join(WorkDir, AGENT_NAME_FILE), "utf-8").catch(() => null));
}

export const copilotNameTools: z.infer<typeof BuiltinToolsSchema> = {
    "copilot-set-name": {
        permission: "none",
        description: "Keep the name the user gives you (« Je vais t'appeler Awa », or just « Awa » after you asked). From then on you are that name in every conversation, and the app shows it.",
        inputSchema: z.object({
            name: z.string().describe("Your new name, as the user wrote it (a first name, 1 to 3 words)."),
        }),
        execute: async ({ name }: { name: string }) => {
            const clean = cleanAgentName(name);
            if (!clean) return { success: false, error: "Empty name." };
            const file = path.join(WorkDir, AGENT_NAME_FILE);
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, agentNameFile(clean), "utf-8");
            return { success: true, name: clean };
        },
    },
};
