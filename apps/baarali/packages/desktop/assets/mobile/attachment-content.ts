import type { message } from '@x/shared';
import type { z } from 'zod';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
export type AttachmentPart = z.infer<typeof message.UserAttachmentPart>;

export function safeFilename(name: string): string {
  return name.normalize('NFC').replace(/[\\/\x00-\x1f:*?"<>|]/g, '-').replace(/^\.+/, '').trim().slice(0, 160) || 'document';
}

export function attachmentContent(text: string, files: AttachmentPart[]): z.infer<typeof message.UserMessageContent> {
  return files.length ? [...(text ? [{ type: 'text' as const, text }] : []), ...files] : text;
}

export function assetMessageLink(org: string, space: string, id: string, filename: string): string {
  const label = filename.replace(/[\\\[\]\n\r]/g, '-');
  return `[${label}](https://${org}/s/${encodeURIComponent(space)}/a/${encodeURIComponent(id)})`;
}

export type ComposerAttachment = { id: string; uri: string; name: string; mime: string; size: number; path: string };
type LocalFile = { size: number; base64(): Promise<string>; bytes(): Promise<Uint8Array> };
type ReadFile = (uri: string) => LocalFile;
type UploadCache = Map<string, AttachmentPart | string>;
import type { RpcClient } from '@x/client';
import type { SpacesClient } from '@/lib/spaces/client';

export async function uploadWorkspaceAttachments(files: ComposerAttachment[], rpc: RpcClient, read: ReadFile, cache: UploadCache): Promise<AttachmentPart[]> {
  if (!files.length) return [];
  const { root } = await rpc.call('workspace:getRoot', null);
  const parts: AttachmentPart[] = [];
  for (const file of files) {
    const key = `${root}:${file.id}`;
    let part = cache.get(key) as AttachmentPart | undefined;
    if (!part) {
      const local = read(file.uri);
      if (local.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 15 MB limit.');
      await rpc.call('workspace:writeFile', { path: file.path, data: await local.base64(), opts: { encoding: 'base64', mkdirp: true, atomic: true } });
      part = { type: 'attachment', path: `${root.replace(/\/$/, '')}/${file.path}`, filename: file.name, mimeType: file.mime, size: file.size };
      cache.set(key, part);
    }
    parts.push(part);
  }
  return parts;
}

export async function uploadSpaceAttachments(files: ComposerAttachment[], client: SpacesClient, org: string, space: string, threadRootId: string | undefined, read: ReadFile, cache: UploadCache): Promise<string[]> {
  const links: string[] = [];
  for (const file of files) {
    const key = `${org}:${space}:${file.id}`;
    let link = cache.get(key) as string | undefined;
    if (!link) {
      const local = read(file.uri);
      if (local.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 15 MB limit.');
      const blob = await client.uploadBlob(space, await local.bytes(), { declaredMime: file.mime });
      const { asset } = await client.createAsset(space, { path: file.path, blob: blob.hash, threadRootId, actingMode: 'direct' });
      link = assetMessageLink(org, space, asset.id, file.name);
      cache.set(key, link);
    }
    links.push(link);
  }
  return links;
}
