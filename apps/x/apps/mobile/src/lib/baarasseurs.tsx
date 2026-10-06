import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { baarasseurs as shared } from '@x/shared';

import { useConnection } from '@/lib/connection';

// BAARALI(06/10/2026): the baarasseurs on the phone — the same workspace file
// as the desktop, read and written over the Mac's RPC, with the shared
// recruiting kit (@x/shared baarasseur.ts) so both apps save alike.

export type Baarasseur = shared.Baarasseur;

let team: Baarasseur[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The phone's language, as the i18n layer set it. */
export function phoneLang(): shared.Lang {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** The team (null while loading), and how to change it. */
export function useBaarasseurs() {
  const { rpc, status } = useConnection();
  const list = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => team,
  );
  const reload = useCallback(async () => {
    if (!rpc) return;
    try {
      const r = (await rpc.call('workspace:readFile', { path: shared.BAARASSEURS_PATH, encoding: 'utf8' })) as { data?: string };
      team = shared.parseBaarasseurs(r.data);
    } catch {
      team = [];
    }
    emit();
  }, [rpc]);
  useEffect(() => {
    if (rpc && status === 'connected') void reload();
  }, [rpc, status, reload]);

  const invoke = useCallback((channel: string, args: unknown) => {
    if (!rpc) return Promise.reject(new Error('Not connected'));
    return rpc.call(channel as never, args as never) as Promise<unknown>;
  }, [rpc]);
  const upsert = useCallback(async (b: Baarasseur, forgotten: string[] = []) => {
    team = await shared.saveTeam(invoke, shared.upsertChange(b, forgotten), { id: b.id }, phoneLang());
    emit();
  }, [invoke]);
  const remove = useCallback(async (id: string) => {
    team = await shared.saveTeam(invoke, (current) => current.filter((x) => x.id !== id), { id, removed: true }, phoneLang());
    emit();
  }, [invoke]);
  /** The sentence → form step and the try-out: llm:generate on the Mac. */
  const generate = useCallback(async (req: { prompt: string; system?: string; model?: string; provider?: string }) => {
    return (await invoke('llm:generate', req)) as { text?: string; error?: string };
  }, [invoke]);
  return { team: list, reload, upsert, remove, generate };
}

/** The desktop's avatar tints, as light ground + dark ink (and the reverse at night). */
export const TINTS: Record<string, [string, string, string, string]> = {
  clay: ['#ffedd5', '#9a3412', 'rgba(249,115,22,0.2)', '#fdba74'],
  blue: ['#dbeafe', '#1e40af', 'rgba(59,130,246,0.2)', '#93c5fd'],
  green: ['#d1fae5', '#065f46', 'rgba(16,185,129,0.2)', '#6ee7b7'],
  violet: ['#ede9fe', '#5b21b6', 'rgba(139,92,246,0.2)', '#c4b5fd'],
  rose: ['#ffe4e6', '#9f1239', 'rgba(244,63,94,0.2)', '#fda4af'],
  amber: ['#fef3c7', '#78350f', 'rgba(245,158,11,0.2)', '#fcd34d'],
  teal: ['#ccfbf1', '#115e59', 'rgba(20,184,166,0.2)', '#5eead4'],
};

export function useTint(color: string): { bg: string; fg: string } {
  const dark = useColorScheme() === 'dark';
  const [bg, fg, bgDark, fgDark] = TINTS[color] ?? TINTS.clay;
  return dark ? { bg: bgDark, fg: fgDark } : { bg, fg };
}

export function BaarasseurAvatar({ b, size = 48 }: { b: Pick<Baarasseur, 'name' | 'color'>; size?: number }) {
  const { bg, fg } = useTint(b.color);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: fg }}>{(b.name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/** Wide enough for the list and the conversation side by side: a foldable opened, a tablet. */
export const TWO_PANES_AT = 600;
