type Message = Record<string, unknown>;
type Listener = (message: Message, extra?: unknown) => void;

export interface ReaTransport {
  onmessage?: Listener;
  onerror?: (error: Error) => void;
  onclose?: () => void;
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: Message, options?: unknown): Promise<void>;
}

export const REA_ANALYSIS_HEAP_MIB = 256;
export const REA_ANALYSIS_TIMEOUT_MS = 300_000;
const record = (value: unknown): value is Message => !!value && typeof value === 'object' && !Array.isArray(value);

// BAARALI(15/10/2026): REA's JS worker has its own heap flag (1024 MiB by
// default). Bound that request at the transport seam, without forking REA or
// hiding any tools. The effective choices remain in REA's Evidence parameters.
export class BoundedReaTransport implements ReaTransport {
  onmessage?: Listener;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(private readonly inner: ReaTransport) {
    inner.onmessage = (message, extra) => {
      const params = message.params;
      if (message.method !== 'tools/call' || !record(params) || params.name !== 'analyze_javascript_application') {
        this.onmessage?.(message, extra);
        return;
      }
      const args = params.arguments ?? {};
      if (!record(args)) { this.onmessage?.(message, extra); return; }
      if (typeof args.max_heap_mb === 'number' && args.max_heap_mb > REA_ANALYSIS_HEAP_MIB ||
        typeof args.analysis_timeout_ms === 'number' && args.analysis_timeout_ms > REA_ANALYSIS_TIMEOUT_MS) {
        void inner.send({
          jsonrpc: '2.0', id: message.id,
          result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'baarali_resource_constraint', message: 'This analysis exceeds the instance budget. Narrow the supplied target; do not raise limits automatically.', limits: { max_heap_mb: REA_ANALYSIS_HEAP_MIB, analysis_timeout_ms: REA_ANALYSIS_TIMEOUT_MS } } }) }] },
        }).catch(error => this.onerror?.(error instanceof Error ? error : new Error('REA transport failed')));
        return;
      }
      this.onmessage?.({ ...message, params: { ...params, arguments: { ...args, max_heap_mb: args.max_heap_mb ?? REA_ANALYSIS_HEAP_MIB, analysis_timeout_ms: args.analysis_timeout_ms ?? REA_ANALYSIS_TIMEOUT_MS } } }, extra);
    };
    inner.onerror = error => this.onerror?.(error);
    inner.onclose = () => this.onclose?.();
  }

  start() { return this.inner.start(); }
  close() { return this.inner.close(); }
  send(message: Message, options?: unknown) { return this.inner.send(message, options); }
}
