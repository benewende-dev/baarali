import type { RpcClient } from '@x/client';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo } from 'react';

import { useConnection } from './connection';
import { workspacePath } from './motion-project';

// BAARALI(10/10/2026): the Studio Motion and the posters on the phone
// (mockup validated by the founder the same day). The agent's files live in
// the instance's workspace; the phone reads them over GET /workspace/<path>
// with the pairing's key, plays a motion project with HyperFrames' own
// player in a web view, and calls the instance's baarali-motion tools
// (render, poster, export_minutes) through mcp:executeTool, as the Mac does.

export const MOTION_SERVER = 'baarali-motion';

export * from './motion-project';

/** URLs of workspace files, with the pairing's key as a header (images, PDFs) or in the query (inside the player). */
export function useWorkspaceFiles() {
  const { pairing } = useConnection();
  const base = pairing?.url ?? '';
  const token = pairing?.token ?? '';
  const url = useCallback((path: string) => `${base}/workspace/${workspacePath(path).split('/').map(encodeURIComponent).join('/')}`, [base]);
  const headers = useMemo(() => ({ authorization: `Bearer ${token}` }), [token]);
  const signed = useCallback((path: string) => `${url(path)}?token=${encodeURIComponent(token)}`, [url, token]);
  return { ready: !!pairing, url, headers, signed };
}

/** What the baarali-motion tools answer as data (their structuredContent). */
export interface MotionAnswer {
  export?: { id: string; format: string; status: string; progress?: number; file?: string; error?: string };
  refused?: { code: string; message?: string };
  allowance?: { period: 'week' | 'month'; usedSeconds: number; totalSeconds: number; creditsPerMinute: number; balance: number };
  poster?: { files: Array<{ file: string; kind: 'pdf' | 'png'; label: string }>; print: { width: number; height: number } | null };
}

/** A baarali-motion tool, run by the instance; its data, or null when it gave none. The words, when it failed. */
export async function callMotionTool(rpc: RpcClient, toolName: string, input: Record<string, unknown>): Promise<{ data: MotionAnswer | null; text: string; failed: boolean }> {
  const { result } = (await rpc.call('mcp:executeTool', { serverName: MOTION_SERVER, toolName, input } as never)) as {
    result: { structuredContent?: MotionAnswer; content?: Array<{ text?: string }>; isError?: boolean } | null;
  };
  return { data: result?.structuredContent ?? null, text: result?.content?.[0]?.text ?? '', failed: !!result?.isError };
}

/** A workspace file downloaded to the cache, for the share sheet or Photos. */
export async function cachedCopy(url: string, headers: Record<string, string>, name: string): Promise<File> {
  const dest = new File(Paths.cache, `${Date.now()}-${name.replace(/[^\w.-]+/g, '-')}`);
  return File.downloadFileAsync(url, dest, { headers, idempotent: true });
}

export async function shareFile(url: string, headers: Record<string, string>, name: string): Promise<void> {
  const file = await cachedCopy(url, headers, name);
  await Sharing.shareAsync(file.uri, { dialogTitle: name });
}

/** Saves an image or a video to Photos; false when the person refused the access. */
export async function saveToPhotos(url: string, headers: Record<string, string>, name: string): Promise<boolean> {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true);
  if (!granted) return false;
  const file = await cachedCopy(url, headers, name);
  await MediaLibrary.saveToLibraryAsync(file.uri);
  return true;
}
