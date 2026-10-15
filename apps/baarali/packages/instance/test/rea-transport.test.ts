import { describe, expect, it, vi } from 'vitest';
import { BoundedReaTransport, type ReaTransport } from '../src/rea-transport.js';

const fixture = () => {
  const inner: ReaTransport = { start: vi.fn(async () => {}), close: vi.fn(async () => {}), send: vi.fn(async () => {}) };
  const transport = new BoundedReaTransport(inner);
  const receive = vi.fn();
  transport.onmessage = receive;
  return { inner, transport, receive };
};

describe('REA transport resource boundary', () => {
  it('records bounded worker choices in the actual request, without changing the original input', () => {
    const { inner, receive } = fixture();
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'analyze_javascript_application', arguments: { input_path: '/project' } } };
    inner.onmessage!(message);
    expect(receive.mock.calls[0][0].params.arguments).toEqual({ input_path: '/project', max_heap_mb: 256, analysis_timeout_ms: 300_000 });
    expect(message.params.arguments).toEqual({ input_path: '/project' });
  });
  it('rejects oversized worker requests before they reach the engine', async () => {
    const { inner, receive } = fixture();
    inner.onmessage!({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_javascript_application', arguments: { input_path: '/project', max_heap_mb: 16_384 } } });
    expect(receive).not.toHaveBeenCalled();
    expect(inner.send).toHaveBeenCalledWith(expect.objectContaining({ id: 3, result: expect.objectContaining({ isError: true }) }));
  });
  it('passes the complete catalog, lifecycle, cancellation and other tools through unchanged', async () => {
    const { inner, transport, receive } = fixture();
    for (const message of [{ method: 'tools/list', id: 1 }, { method: 'notifications/cancelled', params: { requestId: 1 } }, { method: 'tools/call', params: { name: 'analyze_function', arguments: { procedure: 'main' } }, id: 2 }]) {
      inner.onmessage!(message);
      expect(receive).toHaveBeenLastCalledWith(message, undefined);
    }
    const result = { jsonrpc: '2.0', id: 2, result: { structuredContent: { evidence_id: 'example' } } };
    await transport.send(result);
    expect(inner.send).toHaveBeenCalledWith(result, undefined);
    await transport.close();
    expect(inner.close).toHaveBeenCalledOnce();
  });
});
