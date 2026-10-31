import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Réglages réservés au super administrateur : un admin simple les voit, mais ne peut
 * pas les modifier. (Affichage seulement : la base refuse aussi la modification.)
 */
export function SuperAdminLock({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useAuth();
  if (isSuperAdmin) return <>{children}</>;
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 rounded-2xl bg-night-50 px-4 py-3 text-sm text-night-800">
        <Lock className="h-4 w-4 shrink-0" /> Réservé au super administrateur : vous pouvez consulter ces réglages, pas les modifier.
      </p>
      <fieldset disabled className="opacity-70">
        {children}
      </fieldset>
    </div>
  );
}
