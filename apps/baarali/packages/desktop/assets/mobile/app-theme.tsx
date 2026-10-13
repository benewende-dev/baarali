import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

type Theme = 'system' | 'light' | 'dark';
const Context = createContext<{ theme: Theme; choose: (theme: Theme) => Promise<void> } | null>(null);
const KEY = 'baarali.appearance';

// BAARALI(13/10/2026): the mobile settings mirror the desktop's three
// appearance choices. The override affects this app only, including pickers.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(KEY).then(value => {
      if (!alive) return;
      const next = value === 'light' || value === 'dark' ? value : 'system';
      setTheme(next); Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const choose = async (next: Theme) => {
    await AsyncStorage.setItem(KEY, next);
    setTheme(next); Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  };
  return <Context.Provider value={{ theme, choose }}>{children}</Context.Provider>;
}

export function useAppTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('app_theme_context_missing');
  return value;
}
