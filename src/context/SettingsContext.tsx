import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAsync } from '../hooks/useAsync';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
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
  const { data, loading, error, reload, setData } = useAsync(
    () => (isSupabaseConfigured ? getSettings() : Promise.resolve(null)),
    [],
  );

  // Les changements faits par l'admin arrivent chez tous les visiteurs sans recharger la page :
  // en temps réel (Supabase Realtime) et, en secours, au retour sur l'onglet.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // Mise à jour silencieuse, seulement si les paramètres ont réellement changé
    // (évite de réinitialiser un formulaire en cours de saisie).
    const refresh = () => {
      getSettings()
        .then((next) => setData((prev) => (next && prev?.updated_at === next.updated_at ? prev : next)))
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const channel = client
      .channel('platform_settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'platform_settings' }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      void client.removeChannel(channel);
    };
  }, [setData]);

  return (
    <SettingsContext.Provider value={{ settings: data, loading, error, reload }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
}
