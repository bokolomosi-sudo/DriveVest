import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { formatPhone } from '../../lib/phoneAuth';
import { updateMyProfile, type ProfileInput } from '../../services/account';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { notify } = useToast();
  const [form, setForm] = useState<ProfileInput>({ full_name: '', phone: '', city: '', country: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', city: profile.city ?? '', country: profile.country ?? '' });
    }
  }, [profile]);

  const set = (key: keyof ProfileInput) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !user) return;
    setBusy(true);
    setError(null);
    try {
      await updateMyProfile(user.id, {
        full_name: form.full_name?.trim() || null,
        phone: profile?.phone ?? null,
        city: form.city?.trim() || null,
        country: form.country?.trim() || null,
      });
      await refreshProfile();
      notify('success', 'Profil mis à jour.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Mon profil" noindex />
      <PageHeader title="Profil personnel" description={profile ? `Membre depuis le ${formatDate(profile.created_at)}` : undefined} />
      <form onSubmit={onSubmit} className="card max-w-2xl space-y-4 p-5 sm:p-6">
        <Field label="Numéro de téléphone (identifiant de connexion)" htmlFor="p-phone" hint="Pour changer de numéro, contactez le service client.">
          <input id="p-phone" className="input" value={formatPhone(user?.phone || profile?.phone)} disabled />
        </Field>
        <Field label="Nom complet" htmlFor="p-name">
          <input id="p-name" className="input" maxLength={120} value={form.full_name ?? ''} onChange={(e) => set('full_name')(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville" htmlFor="p-city">
            <input id="p-city" className="input" maxLength={80} value={form.city ?? ''} onChange={(e) => set('city')(e.target.value)} />
          </Field>
          <Field label="Pays" htmlFor="p-country">
            <input id="p-country" className="input" maxLength={80} value={form.country ?? ''} onChange={(e) => set('country')(e.target.value)} />
          </Field>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
      </form>
    </>
  );
}
