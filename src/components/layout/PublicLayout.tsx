import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { LoadingState } from '../ui/Feedback';
import { Footer } from './Footer';
import { MobileTabBar } from './MobileTabBar';
import { Navbar } from './Navbar';
import { PageErrorBoundary } from '../PageErrorBoundary';

export function PublicLayout() {
  const { pathname } = useLocation();
  // Visiteur sans compte (guide, pages légales) : pas d'onglets vers l'espace membre
  const { user } = useAuth();
  return (
    <div className={`flex min-h-screen flex-col md:pb-0 ${user ? 'pb-[calc(4.25rem+env(safe-area-inset-bottom))]' : ''}`}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Aller au contenu
      </a>
      {!isSupabaseConfigured && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900" role="status">
          Mode configuration : la base de données Supabase n'est pas connectée (variables VITE_SUPABASE_URL et
          VITE_SUPABASE_ANON_KEY manquantes). Aucune donnée ne peut être chargée.
        </div>
      )}
      <Navbar />
      <main id="contenu" className="flex-1">
        {/* Une nouvelle page = un nouvel essai (key) */}
        <PageErrorBoundary key={pathname}>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </main>
      <Footer />
      {user && <MobileTabBar />}
    </div>
  );
}
