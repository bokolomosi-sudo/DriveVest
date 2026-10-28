import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MemberInfoForm } from '../../components/account/MemberInfoForm';
import { PageMeta } from '../../components/PageMeta';
import { useAuth } from '../../context/AuthContext';
import { isProfileComplete } from '../../services/account';
import { AuthShell } from './AuthShell';

/** Deuxième étape après la première connexion : nom, province et ville. */
export default function WelcomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isProfileComplete(profile)) navigate('/compte', { replace: true });
  }, [profile, navigate]);

  return (
    <AuthShell title="Bienvenue sur Drivest" subtitle="Complétez vos informations pour accéder à votre compte.">
      <PageMeta title="Mes informations" noindex />
      <MemberInfoForm submitLabel="Continuer" onDone={() => navigate('/compte', { replace: true })} />
    </AuthShell>
  );
}
