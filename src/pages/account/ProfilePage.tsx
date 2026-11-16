import { CertificationCard, CertifiedBadge } from '../../components/account/Certification';
import { MemberInfoForm } from '../../components/account/MemberInfoForm';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { iAmCertified } from '../../services/wallet';
import { formatDate } from '../../lib/format';
import { formatPhone } from '../../lib/phoneAuth';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const { notify } = useToast();
  const certified = useAsync(iAmCertified, []);

  return (
    <>
      <PageMeta title="Mon profil" noindex />
      <PageHeader
        title={<span className="inline-flex items-center gap-2">Profil personnel {certified.data && <CertifiedBadge className="h-6 w-6" />}</span>}
        description={profile ? `Membre depuis le ${formatDate(profile.created_at)}` : undefined}
      />
      {certified.data !== null && !certified.loading && (
        <div className="mb-4 max-w-2xl"><CertificationCard certified={certified.data === true} /></div>
      )}
      <div className="card max-w-2xl space-y-4 p-5 sm:p-6">
        <Field label="Numéro de téléphone (identifiant de connexion)" htmlFor="p-phone" hint="Pour changer de numéro, contactez le service client.">
          <input id="p-phone" className="input" value={formatPhone(user?.phone || profile?.phone)} disabled />
        </Field>
        {/* key : le formulaire reprend les valeurs du profil une fois chargé */}
        <MemberInfoForm key={profile?.updated_at ?? 'vide'} submitLabel="Enregistrer" onDone={() => notify('success', 'Profil mis à jour.')} />
      </div>
    </>
  );
}
