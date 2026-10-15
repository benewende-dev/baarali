import { AsyncLocalStorage } from 'node:async_hooks';

// BAARALI(15/10/2026): REA retains one active native target and Evidence
// ledger per connection. Sharing it between chats can answer against the
// wrong binary, so keep a chat scope and bound concurrent retained engines.
const scope = new AsyncLocalStorage<string>();
const opening = new Map<string, Promise<unknown>>();
const isRea = (key: string) => key === 'baarali-rea' || key.startsWith('baarali-rea:');
export const hasReaScope = (context: { sessionId?: string | null; runId: string }) => scope.getStore() === (context.sessionId || context.runId);
export const reaScopeKey = (server: string): string => server === 'baarali-rea' && scope.getStore() !== undefined ? `${server}:${scope.getStore()}` : server;
export function withReaScope<T>(context: { sessionId?: string | null; runId: string }, action: () => T): T {
  return scope.run(context.sessionId || context.runId, action);
}

export function reaConnection<T>(key: string, activeKeys: string[], connect: () => Promise<T>): Promise<T> {
  if (!isRea(key)) return connect();
  const pending = opening.get(key);
  if (pending) return pending as Promise<T>;
  const occupied = new Set([...activeKeys.filter(isRea), ...opening.keys()]);
  if (!occupied.has(key) && occupied.size >= 2) {
    return Promise.reject(new Error('Two REA investigations are already open. Export their evidence and close a session before starting another.'));
  }
  const request = Promise.resolve().then(connect).finally(() => {
    if (opening.get(key) === request) opening.delete(key);
  });
  opening.set(key, request);
  return request;
}
