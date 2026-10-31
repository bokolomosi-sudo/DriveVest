import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { sessionShouldExpire } from '../lib/rememberMe';
import { supabase } from '../lib/supabase';
import { setUserTimeZone } from '../lib/timezone';
import { getMyRoles, getProfile } from '../services/account';
import type { AppRole, Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  /** Indication d'interface uniquement : les droits réels sont vérifiés par RLS et les fonctions SQL. */
  isAdmin: boolean;
  /** Super administrateur : nomme les admins et règle les paramètres sensibles (vérifié aussi par la base). */
  isSuperAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_CACHE_KEY = 'drivest:profile-cache';

function readCachedProfile(userId: string): { profile: Profile; roles: AppRole[] } | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { userId: string; profile: Profile | null; roles: AppRole[] };
    return cached.userId === userId && cached.profile ? { profile: cached.profile, roles: cached.roles ?? [] } : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(userId: string, profile: Profile | null, roles: AppRole[]) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, roles }));
  } catch {
    // Stockage indisponible (navigation privée) : on s'en passe
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignoré
  }
}

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
      setUserTimeZone(null);
      setProfile(null);
      setRoles([]);
      return;
    }
    // Profil mémorisé : les pages s'ouvrent tout de suite, puis il est rafraîchi en arrière-plan.
    // (Affichage seulement : les droits réels restent vérifiés par la base.)
    const cached = readCachedProfile(id);
    if (cached) {
      setUserTimeZone(cached.profile.province);
      setProfile(cached.profile);
      setRoles(cached.roles);
    } else {
      setProfileLoading(true);
    }
    try {
      const [p, r] = await Promise.all([getProfile(id), getMyRoles(id)]);
      setUserTimeZone(p?.province);
      setProfile(p);
      setRoles(r);
      writeCachedProfile(id, p, r);
    } catch {
      if (!cached) {
        setProfile(null);
        setRoles([]);
      }
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
      isSuperAdmin: roles.includes('super_admin'),
      loading: !sessionLoaded || profileLoading,
      refreshProfile: () => loadProfile(userId),
      signOut: async () => {
        clearCachedProfile();
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
