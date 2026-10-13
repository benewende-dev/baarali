import { describe, expect, it, vi } from 'vitest';
import { attachmentContent, safeFilename, uploadSpaceAttachments, uploadWorkspaceAttachments, MAX_FILE_BYTES, type ComposerAttachment } from '../assets/mobile/attachment-content.js';

const file: ComposerAttachment = { id: 'id-1', uri: 'file:///cache/brief.pdf', name: 'Brief.pdf', mime: 'application/pdf', size: 3, path: 'Attachments/mobile/id-1/Brief.pdf' };
const bytes = new Uint8Array([0, 128, 255]);
const read = () => ({ size: 3, base64: async () => 'AID/', bytes: async () => bytes });

describe('mobile attachments', () => {
  it('transfers binary bytes to the instance, then sends its absolute path with the original display name', async () => {
    const call = vi.fn(async (name: string) => name === 'workspace:getRoot' ? { root: '/data/' } : {});
    const parts = await uploadWorkspaceAttachments([file], { call } as never, read, new Map());
    expect(call).toHaveBeenCalledWith('workspace:writeFile', { path: file.path, data: 'AID/', opts: { encoding: 'base64', mkdirp: true, atomic: true } });
    expect(attachmentContent('Analysez ce document.', parts)).toEqual([
      { type: 'text', text: 'Analysez ce document.' },
      { type: 'attachment', path: '/data/Attachments/mobile/id-1/Brief.pdf', filename: 'Brief.pdf', mimeType: 'application/pdf', size: 3 },
    ]);
    expect(attachmentContent('', parts)).toEqual(parts);
  });

  it('keeps completed transfers after a partial failure so a retry only uploads the missing file', async () => {
    const second = { ...file, id: 'id-2', path: 'Attachments/mobile/id-2/Brief.pdf' };
    let fail = true;
    const call = vi.fn(async (name: string, input?: { path?: string }) => {
      if (name === 'workspace:getRoot') return { root: '/data' };
      if (input?.path === second.path && fail) { fail = false; throw new Error('offline'); }
      return {};
    });
    const cache = new Map();
    await expect(uploadWorkspaceAttachments([file, second], { call } as never, read, cache)).rejects.toThrow('offline');
    const parts = await uploadWorkspaceAttachments([file, second], { call } as never, read, cache);
    expect(parts).toHaveLength(2);
    expect(call.mock.calls.filter(([name, input]) => name === 'workspace:writeFile' && input?.path === file.path)).toHaveLength(1);
  });

  it('creates a shared asset with thread provenance and reuses its canonical link after a message failure', async () => {
    const client = { uploadBlob: vi.fn(async () => ({ hash: 'sha256' })), createAsset: vi.fn(async () => ({ asset: { id: 'asset-1' } })) };
    const cache = new Map();
    const links = await uploadSpaceAttachments([file], client as never, 'team.spaces.baarali.com', 'space-1', 'root-1', read, cache);
    expect(client.uploadBlob).toHaveBeenCalledWith('space-1', bytes, { declaredMime: 'application/pdf' });
    expect(client.createAsset).toHaveBeenCalledWith('space-1', { path: file.path, blob: 'sha256', threadRootId: 'root-1', actingMode: 'direct' });
    expect(links).toEqual(['[Brief.pdf](https://team.spaces.baarali.com/s/space-1/a/asset-1)']);
    await uploadSpaceAttachments([file], client as never, 'team.spaces.baarali.com', 'space-1', 'root-1', read, cache);
    expect(client.createAsset).toHaveBeenCalledTimes(1);
  });

  it('rejects files that grew past the limit before reading them into memory', async () => {
    const base64 = vi.fn();
    const rpc = { call: vi.fn(async () => ({ root: '/data' })) };
    await expect(uploadWorkspaceAttachments([file], rpc as never, () => ({ size: MAX_FILE_BYTES + 1, base64, bytes: vi.fn() }), new Map())).rejects.toThrow('15 MB');
    expect(base64).not.toHaveBeenCalled();
    expect(rpc.call).toHaveBeenCalledTimes(1);
    expect(safeFilename('../préparation/brief.pdf')).toBe('-préparation-brief.pdf');
  });
});
