import { z } from "zod";
import { RowboatApiConfig } from "@x/shared/dist/rowboat-account.js";
import { API_URL } from "./env.js";

/**
 * Kept 10 minutes, like remote-config.ts: a cloud instance sleeps and wakes
 * with its memory intact, so a copy kept for the whole process missed the
 * voice URL the api began serving (seen 06/10/2026: dictation sent nothing).
 */
const CACHE_MS = 10 * 60 * 1000;

let cached: { at: number; data: z.infer<typeof RowboatApiConfig> } | null = null;

export async function getRowboatConfig(): Promise<z.infer<typeof RowboatApiConfig>> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.data;
  }
  const response = await fetch(`${API_URL}/v1/config`);
  const data = RowboatApiConfig.parse(await response.json());
  cached = { at: Date.now(), data };
  return data;
}
