import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Alert, Platform } from 'react-native';
import type { RpcClient } from '@x/client';
import type { SpacesClient } from '@/lib/spaces/client';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, safeFilename, uploadWorkspaceAttachments, uploadSpaceAttachments, type AttachmentPart, type ComposerAttachment } from './attachment-content';
export type { ComposerAttachment } from './attachment-content';

// BAARALI(12/10/2026): home hands cached files to the chat in memory, rather
// than putting device paths or file bytes into navigation URLs.
const handoffs = new Map<string, ComposerAttachment[]>();
export function stageAttachments(files: ComposerAttachment[]): string | undefined {
  if (!files.length) return undefined;
  const key = Crypto.randomUUID();
  handoffs.set(key, files);
  setTimeout(() => handoffs.delete(key), 60_000);
  return key;
}
export function takeAttachments(key?: string): ComposerAttachment[] {
  if (!key) return [];
  const files = handoffs.get(key) ?? [];
  return files;
}

// BAARALI(09/11/2026): in the browser a picked, dropped or pasted file is the
// browser's own File: kept here by its address, read from memory to send it
// (the phone reads its copies on disk).
const webBlobs = new Map<string, Blob>();
const web = Platform.OS === 'web';
function readLocal(uri: string) {
  if (!web) return new File(uri);
  const blob = webBlobs.get(uri);
  if (!blob) throw new Error('The files could not be added. Please try again.');
  return {
    size: blob.size,
    bytes: async () => new Uint8Array(await blob.arrayBuffer()),
    base64: async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
  };
}
/** An alert that also shows in a browser (Alert does nothing there). */
function warn(title: string, message: string) {
  if (web) globalThis.alert?.(`${title}\n${message}`);
  else Alert.alert(title, message);
}
/** The kinds the « + » menu offers, as the desktop's: images, documents, any file. */
export const DOCUMENT_TYPES = ['application/pdf', 'text/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/csv'];

export function useComposerAttachments(initial?: string) {
  const [files, setFiles] = useState(() => takeAttachments(initial));
  useEffect(() => { if (initial) handoffs.delete(initial); }, [initial]);
  const [picking, setPicking] = useState(false);
  const pickerBusy = useRef(false);
  // Successful transfers survive a message failure; retry does not create
  // duplicate workspace copies or shared assets.
  const uploaded = useRef(new Map<string, AttachmentPart | string>());
  const workspaceUploads = useRef(new WeakMap<RpcClient, Map<string, AttachmentPart | string>>());
  const accept = useCallback((selected: ComposerAttachment[]) => {
    if (files.length + selected.length > MAX_FILES || selected.some(file => file.size > MAX_FILE_BYTES) || [...files, ...selected].reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      warn(translate('Attachments'), translate('Choose up to 5 files, 15 MB per file and 30 MB in total.'));
      return false;
    }
    setFiles(prev => [...prev, ...selected]);
    return true;
  }, [files]);
  /** In the browser: files dropped on the composer or pasted into it. */
  const addFiles = useCallback((list: Array<Blob & { name?: string }>) => {
    if (!web || !list.length) return;
    accept(list.map(blob => {
      const id = Crypto.randomUUID();
      const uri = URL.createObjectURL(blob);
      webBlobs.set(uri, blob);
      const name = blob.name || 'document';
      return { id, uri, name, mime: blob.type || 'application/octet-stream', size: blob.size, path: `Attachments/mobile/${id}/${safeFilename(name)}` };
    }));
  }, [accept]);
  const pick = useCallback(async (type: string | string[] = '*/*') => {
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type });
      if (result.canceled) return;
      const selected = result.assets.map(asset => {
        const id = Crypto.randomUUID();
        if (web) {
          const blob = (asset as { file?: Blob }).file;
          if (blob) webBlobs.set(asset.uri, blob);
          return { id, uri: asset.uri, name: asset.name, mime: asset.mimeType || blob?.type || 'application/octet-stream', size: asset.size ?? blob?.size ?? 0, path: `Attachments/mobile/${id}/${safeFilename(asset.name)}` };
        }
        const file = new File(asset.uri);
        return { id, uri: asset.uri, name: asset.name, mime: asset.mimeType || file.type || 'application/octet-stream', size: file.size, path: `Attachments/mobile/${id}/${safeFilename(asset.name)}` };
      });
      accept(selected);
    } catch {
      warn(translate('Attachments'), translate('The files could not be added. Please try again.'));
    } finally {
      pickerBusy.current = false;
      setPicking(false);
    }
  }, [accept]);
  const remove = (id: string) => { setFiles(prev => prev.filter(file => file.id !== id)); for (const key of uploaded.current.keys()) if (key.endsWith(`:${id}`)) uploaded.current.delete(key); };
  const clear = useCallback(() => { setFiles([]); uploaded.current.clear(); workspaceUploads.current = new WeakMap(); }, []);

  const toWorkspace = useCallback(async (rpc: RpcClient): Promise<AttachmentPart[]> => {
    let cache = workspaceUploads.current.get(rpc);
    if (!cache) { cache = new Map(); workspaceUploads.current.set(rpc, cache); }
    try { return await uploadWorkspaceAttachments(files, rpc, readLocal, cache); }
    catch (error) { throw new Error(translate(error instanceof Error ? error.message : String(error))); }
  }, [files]);

  const toSpace = useCallback(async (client: SpacesClient, org: string, space: string, threadRootId?: string): Promise<string[]> => {
    try { return await uploadSpaceAttachments(files, client, org, space, threadRootId, readLocal, uploaded.current); }
    catch (error) { throw new Error(translate(error instanceof Error ? error.message : String(error))); }
  }, [files]);
  return { files, picking, pick, addFiles, remove, clear, toWorkspace, toSpace };
}
