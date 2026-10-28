import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { PasswordField, PhoneField } from '../../components/ui/PhoneField';
import { useAuth } from '../../context/AuthContext';
import { toErrorMessage } from '../../lib/errors';
import { DEFAULT_COUNTRY_CODE, MIN_PASSWORD_LENGTH, normalizePhone, validatePassword } from '../../lib/phoneAuth';
import { signUp } from '../../services/account';
import { AuthShell } from './AuthShell';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referralCode, setReferralCode] = useState((params.get('ref') ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pendant l'inscription, la session ouverte par Supabase ne doit pas rediriger vers l'application
  const registering = useRef(false);

  useEffect(() => {
    if (user && !registering.current) navigate('/', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const phone = normalizePhone(DEFAULT_COUNTRY_CODE, number);
    if (!phone) return setError('Numéro de téléphone invalide.');
    const pwError = validatePassword(password);
    if (pwError) return setError(pwError);
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');

    setBusy(true);
    registering.current = true;
    try {
      await signUp({ phone, password, referralCode });
      await signOut();
      navigate('/connexion', { replace: true, state: { registeredPhone: number } });
    } catch (err) {
      registering.current = false;
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Bienvenue"
      subtitle="Créez votre compte en quelques secondes."
      footer={
        <>
          Déjà inscrit ?{' '}
          <Link to="/connexion" className="font-semibold text-accent-700 hover:text-accent-800">Se connecter</Link>
        </>
      }
    >
      <PageMeta title="Créer un compte" noindex />
      <form onSubmit={onSubmit} className="space-y-4">
        <PhoneField id="reg-phone" number={number} onNumberChange={setNumber} />
        <PasswordField id="reg-password" value={password} onChange={setPassword} placeholder={`Mot de passe (min. ${MIN_PASSWORD_LENGTH})`} autoComplete="new-password" />
        <PasswordField id="reg-confirm" value={confirm} onChange={setConfirm} placeholder="Confirmer le mot de passe" autoComplete="new-password" />
        {referralCode && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/30">
            <Gift className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <input
              aria-label="Code de parrainage"
              className="h-12 w-full bg-transparent font-mono text-base uppercase focus:outline-none sm:text-sm"
              maxLength={12}
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            />
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <button className="btn-primary h-12 w-full rounded-xl text-base shadow-md" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Créer mon compte
        </button>
      </form>
    </AuthShell>
  );
}
