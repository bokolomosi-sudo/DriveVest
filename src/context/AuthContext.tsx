import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { sessionShouldExpire } from '../lib/rememberMe';
import { supabase } from '../lib/supabase';
import { getMyRoles, getProfile } from '../services/account';
import type { AppRole, Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  /** Indication d'interface uniquement : les droits réels sont vérifiés par RLS et les fonctions SQL. */
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(!supabase);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void (async () => {
      // « Se souvenir de moi » non coché et navigateur fermé depuis : déconnexion
      if (sessionShouldExpire()) await client.auth.signOut({ scope: 'local' });
      const { data } = await client.auth.getSession();
      setSession(data.session);
      setSessionLoaded(true);
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setRoles([]);
      return;
    }
    setProfileLoading(true);
    try {
      const [p, r] = await Promise.all([getProfile(id), getMyRoles(id)]);
      setProfile(p);
      setRoles(r);
    } catch {
      setProfile(null);
      setRoles([]);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isAdmin: roles.includes('admin') || roles.includes('super_admin'),
      loading: !sessionLoaded || profileLoading,
      refreshProfile: () => loadProfile(userId),
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [session, profile, roles, sessionLoaded, profileLoading, loadProfile, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
