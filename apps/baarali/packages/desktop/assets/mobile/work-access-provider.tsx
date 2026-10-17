import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useConnection } from '@/lib/connection';
import { canUseWork } from '@/lib/work-access';

type Access = 'checking' | 'paid' | 'free' | 'error';
type WorkAccess = { access: Access; verify: () => Promise<boolean> };
const Context = createContext<WorkAccess | null>(null);

// BAARALI(13/10/2026): one subscription check is shared across navigation
// and protected screens; changing account cannot reuse the previous access.
export function WorkAccessProvider({ children }: { children: ReactNode }) {
  const { rpc } = useConnection();
  const [snapshot, setSnapshot] = useState<{ client: typeof rpc; access: Access }>({ client: null, access: 'checking' });
  const current = useRef(rpc);
  current.current = rpc;
  const pending = useRef<{ client: typeof rpc; promise: Promise<boolean> } | null>(null);
  const verify = useCallback((): Promise<boolean> => {
    if (!rpc) { setSnapshot({ client: rpc, access: 'error' }); return Promise.resolve(false); }
    if (pending.current?.client === rpc) return pending.current.promise;
    // BAARALI(17/10/2026): keep the current screen and its draft mounted
    // during a same-account refresh; the result still revokes lost access.
    setSnapshot(previous => previous.client === rpc ? previous : { client: rpc, access: 'checking' });
    const promise = rpc.call('billing:getInfo', null).then(info => {
      const allowed = canUseWork(info);
      if (current.current === rpc) setSnapshot({ client: rpc, access: allowed ? 'paid' : 'free' });
      return current.current === rpc && allowed;
    }, () => { if (current.current === rpc) setSnapshot({ client: rpc, access: 'error' }); return false; }).finally(() => {
      if (pending.current?.promise === promise) pending.current = null;
    });
    pending.current = { client: rpc, promise };
    return promise;
  }, [rpc]);
  useEffect(() => { void verify(); }, [verify]);
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active') void verify(); }); return () => sub.remove(); }, [verify]);
  const access = snapshot.client === rpc ? snapshot.access : 'checking';
  return <Context.Provider value={{ access, verify }}>{children}</Context.Provider>;
}

export function useWorkAccess(): WorkAccess {
  const value = useContext(Context);
  if (!value) throw new Error('work_access_context_missing');
  return value;
}
