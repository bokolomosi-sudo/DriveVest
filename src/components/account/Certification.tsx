import { Link } from 'react-router-dom';
import { BadgeCheck, Gem } from 'lucide-react';

/** Badge bleu « compte certifié » : le membre a acheté au moins un produit Prestige. */
export function CertifiedBadge({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <BadgeCheck
      className={`inline-block shrink-0 fill-sky-500 text-white ${className}`}
      aria-label="Compte certifié"
      role="img"
    />
  );
}

/** Encadré du profil : statut de certification et, sinon, comment l'obtenir. */
export function CertificationCard({ certified }: { certified: boolean }) {
  if (certified) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <CertifiedBadge className="h-7 w-7" />
        <div>
          <p className="font-bold text-sky-900">Compte certifié</p>
          <p className="text-sm text-sky-800">Vous possédez un produit Prestige : votre compte est certifié.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <Gem className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
      <div>
        <p className="font-bold text-amber-900">Compte non certifié</p>
        <p className="text-sm text-amber-800">
          Vous devez acheter un produit Prestige pour que votre compte soit certifié. La certification est aussi
          nécessaire pour effectuer un retrait.
        </p>
        <Link to="/produits" className="mt-2 inline-block text-sm font-semibold text-amber-900 underline">
          Voir les produits Prestige
        </Link>
      </div>
    </div>
  );
}
