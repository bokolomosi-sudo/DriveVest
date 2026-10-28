import { createContext, useContext, type ReactNode } from 'react';
import { useAsync } from '../hooks/useAsync';
import { isSupabaseConfigured } from '../lib/supabase';
import { getSettings } from '../services/content';
import type { PlatformSettings } from '../types';

interface SettingsContextValue {
  settings: PlatformSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useAsync(
    () => (isSupabaseConfigured ? getSettings() : Promise.resolve(null)),
    [],
  );
  return (
    <SettingsContext.Provider value={{ settings: data, loading, error, reload }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
}
