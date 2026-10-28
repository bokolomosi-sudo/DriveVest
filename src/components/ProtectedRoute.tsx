import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState } from './ui/Feedback';

/**
 * Garde de navigation côté interface. Elle n'est PAS une mesure de sécurité :
 * l'accès réel aux données est contrôlé par RLS et les fonctions SQL.
 */
export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, isAdmin, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Vérification de la session…" />;
  if (!user) {
    // Un visiteur qui ouvre le site arrive directement sur l'inscription
    if (location.pathname === '/') return <Navigate to="/inscription" replace />;
    return <Navigate to={`/connexion?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (profile?.is_blocked) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10" />}
          title="Compte suspendu"
          description="Votre compte a été suspendu par l'administration. Contactez le service client pour plus d'informations."
        />
      </div>
    );
  }
  if (requireAdmin && !isAdmin) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<ShieldAlert className="h-10 w-10" />} title="Accès refusé" description="Cet espace est réservé aux administrateurs." />
      </div>
    );
  }
  return <>{children}</>;
}
