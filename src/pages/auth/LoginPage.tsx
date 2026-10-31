import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageMeta } from '../../components/PageMeta';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { PasswordField, PhoneField } from '../../components/ui/PhoneField';
import { useAuth } from '../../context/AuthContext';
import { toErrorMessage } from '../../lib/errors';
import { DEFAULT_COUNTRY_CODE, normalizeLoginPhone } from '../../lib/phoneAuth';
import { setRememberMe } from '../../lib/rememberMe';
import { signIn } from '../../services/account';
import { AuthShell } from './AuthShell';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registeredPhone = (location.state as { registeredPhone?: string } | null)?.registeredPhone;
  const { user } = useAuth();
  const [number, setNumber] = useState(registeredPhone ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    // Après connexion, l'utilisateur arrive toujours sur son espace
    if (user) navigate('/compte', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const phone = normalizeLoginPhone(DEFAULT_COUNTRY_CODE, number);
    if (!phone) return setError('Numéro de téléphone invalide.');
    if (!password) return setError('Saisissez votre mot de passe.');
    setBusy(true);
    try {
      setRememberMe(remember);
      await signIn(phone, password);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Bon retour"
      subtitle="Connectez-vous pour accéder à votre espace."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-semibold text-accent-700 hover:text-accent-800">Créer un compte</Link>
        </>
      }
    >
      <PageMeta title="Connexion" noindex />
      <form onSubmit={onSubmit} className="space-y-4">
        {registeredPhone && <Alert tone="success">Votre compte a été créé. Connectez-vous avec votre mot de passe.</Alert>}
        <PhoneField id="login-phone" number={number} onNumberChange={setNumber} />
        <PasswordField
          id="login-password"
          value={password}
          onChange={setPassword}
          placeholder="Entrez votre mot de passe"
          autoComplete="current-password"
          autoFocus={Boolean(registeredPhone)}
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-accent-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Se souvenir de moi
          </label>
          <button type="button" className="font-medium text-slate-500 hover:text-slate-800" onClick={() => setForgot((f) => !f)}>
            Mot de passe oublié ?
          </button>
        </div>
        {forgot && (
          <Alert tone="info">Contactez le service client Drivest depuis votre numéro de téléphone pour réinitialiser votre mot de passe.</Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <button className="btn-primary h-12 w-full rounded-xl text-base shadow-md" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Connexion
        </button>
      </form>
    </AuthShell>
  );
}
