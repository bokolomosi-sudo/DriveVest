import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { formatPhone } from '../../lib/phoneAuth';
import { updatePassword, validatePassword } from '../../services/account';

export default function SecurityPage() {
  const { user, signOut } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const pwError = validatePassword(password);
    if (pwError) return setError(pwError);
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      notify('success', 'Mot de passe modifié.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Sécurité" noindex />
      <PageHeader title="Paramètres de sécurité" />
      <div className="max-w-2xl space-y-6">
        <div className="card p-5 text-sm">
          <p><span className="text-slate-500">Numéro de téléphone : </span><span className="font-medium">{formatPhone(user?.phone)}</span></p>
          <p className="mt-1"><span className="text-slate-500">Dernière connexion : </span>{formatDate(user?.last_sign_in_at, true)}</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Changer de mot de passe</h2>
          <Field label="Nouveau mot de passe" htmlFor="new-pw" hint="4 caractères minimum.">
            <input id="new-pw" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirmer" htmlFor="confirm-pw">
            <input id="confirm-pw" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Mettre à jour</button>
        </form>

        <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">Se déconnecter de cet appareil.</p>
          <button
            className="btn-secondary"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </div>
    </>
  );
}
