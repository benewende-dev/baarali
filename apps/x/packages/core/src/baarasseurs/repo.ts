import fs from "fs/promises";
import path from "path";
import { WorkDir } from "../config/config.js";
import {
    BAARASSEURS_PATH,
    MEMORY_LIMIT,
    parseBaarasseurs,
    type Baarasseur,
} from "@x/shared/dist/baarasseur.js";

// BAARALI(06/10/2026): the baarasseurs file, read on every turn so an edit in
// the app applies to the next message. The app writes it whole; the core only
// adds a rule to one baarasseur's memory.

const filePath = () => path.join(WorkDir, BAARASSEURS_PATH);

export async function listBaarasseurs(): Promise<Baarasseur[]> {
    try {
        return parseBaarasseurs(await fs.readFile(filePath(), "utf8"));
    } catch {
        return [];
    }
}

export async function findBaarasseur(id: string): Promise<Baarasseur | null> {
    return (await listBaarasseurs()).find((b) => b.id === id) ?? null;
}

/** Adds one rule to its memory; the oldest goes when it is full. Returns the memory. */
export async function rememberFor(id: string, note: string): Promise<string[] | null> {
    const line = note.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!line) return null;
    let raw: { baarasseurs?: unknown[] } & Record<string, unknown>;
    try {
        raw = JSON.parse(await fs.readFile(filePath(), "utf8"));
    } catch {
        return null;
    }
    const list = Array.isArray(raw.baarasseurs) ? raw.baarasseurs : [];
    const entry = list.find((b) => (b as { id?: unknown })?.id === id) as { memory?: unknown } | undefined;
    if (!entry) return null;
    const memory = Array.isArray(entry.memory) ? entry.memory.filter((m): m is string => typeof m === "string") : [];
    if (!memory.includes(line)) memory.push(line);
    entry.memory = memory.slice(-MEMORY_LIMIT);
    await fs.writeFile(filePath(), JSON.stringify(raw, null, 2));
    return entry.memory as string[];
}
