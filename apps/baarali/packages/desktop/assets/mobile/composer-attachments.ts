import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Alert } from 'react-native';
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

export function useComposerAttachments(initial?: string) {
  const [files, setFiles] = useState(() => takeAttachments(initial));
  useEffect(() => { if (initial) handoffs.delete(initial); }, [initial]);
  const [picking, setPicking] = useState(false);
  const pickerBusy = useRef(false);
  // Successful transfers survive a message failure; retry does not create
  // duplicate workspace copies or shared assets.
  const uploaded = useRef(new Map<string, AttachmentPart | string>());
  const workspaceUploads = useRef(new WeakMap<RpcClient, Map<string, AttachmentPart | string>>());
  const pick = useCallback(async () => {
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
      if (result.canceled) return;
      const selected = result.assets.map(asset => {
        const file = new File(asset.uri);
        const id = Crypto.randomUUID();
        return { id, uri: asset.uri, name: asset.name, mime: asset.mimeType || file.type || 'application/octet-stream', size: file.size, path: `Attachments/mobile/${id}/${safeFilename(asset.name)}` };
      });
      if (files.length + selected.length > MAX_FILES || selected.some(file => file.size > MAX_FILE_BYTES) || [...files, ...selected].reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
        Alert.alert(translate('Attachments'), translate('Choose up to 5 files, 15 MB per file and 30 MB in total.'));
        return;
      }
      setFiles(prev => [...prev, ...selected]);
    } catch {
      Alert.alert(translate('Attachments'), translate('The files could not be added. Please try again.'));
    } finally {
      pickerBusy.current = false;
      setPicking(false);
    }
  }, [files]);
  const remove = (id: string) => { setFiles(prev => prev.filter(file => file.id !== id)); for (const key of uploaded.current.keys()) if (key.endsWith(`:${id}`)) uploaded.current.delete(key); };
  const clear = useCallback(() => { setFiles([]); uploaded.current.clear(); workspaceUploads.current = new WeakMap(); }, []);

  const toWorkspace = useCallback(async (rpc: RpcClient): Promise<AttachmentPart[]> => {
    let cache = workspaceUploads.current.get(rpc);
    if (!cache) { cache = new Map(); workspaceUploads.current.set(rpc, cache); }
    try { return await uploadWorkspaceAttachments(files, rpc, uri => new File(uri), cache); }
    catch (error) { throw new Error(translate(error instanceof Error ? error.message : String(error))); }
  }, [files]);

  const toSpace = useCallback(async (client: SpacesClient, org: string, space: string, threadRootId?: string): Promise<string[]> => {
    try { return await uploadSpaceAttachments(files, client, org, space, threadRootId, uri => new File(uri), uploaded.current); }
    catch (error) { throw new Error(translate(error instanceof Error ? error.message : String(error))); }
  }, [files]);
  return { files, picking, pick, remove, clear, toWorkspace, toSpace };
}
