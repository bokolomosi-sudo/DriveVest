import type { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  Copy,
  Gift,
  LifeBuoy,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Receipt,
  Shield,
  ShoppingBag,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { CertifiedBadge } from '../../components/account/Certification';
import { AppDownloadCard } from '../../components/AppDownloadCard';
import { PageMeta } from '../../components/PageMeta';
import { PushOptIn } from '../../components/PushOptIn';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY, formatPrice } from '../../lib/format';
import { formatPhone } from '../../lib/phoneAuth';
import { countUnreadNotifications } from '../../services/account';
import { getMyBalances, getTodayGains, iAmCertified } from '../../services/wallet';

type Icon = ComponentType<{ className?: string }>;

function Shortcut({ to, label, icon: Icon, tone }: { to: string; label: string; icon: Icon; tone: string }) {
  return (
    <Link to={to} className="flex min-w-0 flex-col items-center gap-2 rounded-xl p-1 text-center hover:bg-slate-50 min-[360px]:p-2">
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl min-[360px]:h-12 min-[360px]:w-12 ${tone}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-[11px] font-semibold leading-tight text-slate-800 min-[360px]:text-xs sm:text-sm">{label}</span>
    </Link>
  );
}

function MenuRow({ label, icon: Icon, tone, to, onClick, badge }: { label: string; icon: Icon; tone: string; to?: string; onClick?: () => void; badge?: number }) {
  const content = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-left text-base font-semibold text-slate-800">{label}</span>
      {badge ? <span className="rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-night-950">{badge}</span> : null}
      <ChevronRight className="h-5 w-5 text-slate-300" />
    </>
  );
  const className = 'flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 hover:bg-slate-50';
  return to ? <Link to={to} className={className}>{content}</Link> : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

export default function DashboardPage() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const navigate = useNavigate();
  const userId = user!.id;
  const walletEnabled = Boolean(settings?.feature_wallet);
  const certified = useAsync(iAmCertified, []);

  // Les revenus sont versés par le serveur (tâche planifiée) : rien à attendre ici
  const { data, loading, error, reload } = useAsync(async () => {
    const [balances, todayGains, unread] = await Promise.all([
      walletEnabled ? getMyBalances() : Promise.resolve([]),
      walletEnabled ? getTodayGains(userId) : Promise.resolve(0),
      countUnreadNotifications(userId),
    ]);
    return { balance: balances.find((b) => b.currency === CURRENCY), todayGains, unread };
  }, [userId, walletEnabled]);

  const phone = formatPhone(profile?.phone || user?.phone);
  const code = profile?.referral_code ?? '';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify('success', 'Identifiant copié.');
    } catch {
      notify('error', 'Copie impossible.');
    }
  };

  const logout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Moi" noindex />

      <section className="-mx-4 rounded-b-[2.5rem] bg-gradient-to-br from-night-800 to-night-950 px-5 pb-20 pt-6 text-white sm:mx-0 sm:rounded-3xl">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-lg">
            <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#0b1a36" />
              <path d="M9 8h6.5a8 8 0 0 1 0 16H9z" fill="none" stroke="#14b897" strokeWidth="3" strokeLinejoin="round" />
              <path d="M13 16h4" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-xl font-bold">
              <span className="truncate">{profile?.full_name || phone}</span>
              {certified.data && <CertifiedBadge />}
            </p>
            {profile?.full_name && <p className="text-sm text-night-200">{phone}</p>}
            {certified.data === false && (
              <Link to="/produits" className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200 hover:bg-white/20">
                Compte non certifié · Acheter un produit Prestige
              </Link>
            )}
            {(profile?.province || profile?.city) && (
              <p className="flex items-center gap-1 text-sm text-night-200">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{[profile.city, profile.province].filter(Boolean).join(', ')}</span>
              </p>
            )}
            {code && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-night-200">
                ID : <span className="font-mono font-semibold text-white">{code}</span>
                <button onClick={copyCode} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/25">
                  <Copy className="h-3 w-3" /> Copier
                </button>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="relative -mt-14 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-100">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : walletEnabled ? (
          <>
            <p className="text-sm text-slate-500">Solde total</p>
            <p className="mt-1 break-words text-3xl font-extrabold tracking-tight text-slate-900 min-[360px]:text-4xl">{formatPrice(data?.balance?.available ?? 0, CURRENCY)}</p>
            {(data?.balance?.pending_in ?? 0) > 0 && (
              <p className="mt-1 text-xs text-slate-500">+{formatPrice(data!.balance!.pending_in, CURRENCY)} de dépôt en cours de vérification</p>
            )}
            <p className="mt-4 text-sm text-slate-500">Gains du jour</p>
            <p className="text-xl font-bold text-accent-600">+{formatPrice(data?.todayGains ?? 0, CURRENCY)}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
              <Link to="/compte/depot" className="btn-primary rounded-2xl py-3.5 text-base">Dépôt</Link>
              <Link to="/compte/retrait" className="btn rounded-2xl border-2 border-accent-200 bg-accent-50 py-3.5 text-base text-accent-800 hover:bg-accent-100">Retirer</Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Le portefeuille n'est pas activé.</p>
        )}
      </section>

      <div className="mt-6">
        <AppDownloadCard />
        <PushOptIn />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Mes actifs</h2>
        <div className="grid grid-cols-4 gap-1 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <Shortcut to="/compte/transactions" label="Facture" icon={Receipt} tone="bg-accent-50 text-accent-700" />
          <Shortcut to="/compte/portefeuille" label="Portefeuille" icon={Wallet} tone="bg-night-50 text-night-700" />
          <Shortcut to="/compte/produits" label="Mes produits" icon={ShoppingBag} tone="bg-amber-50 text-amber-700" />
          <Shortcut to="/compte/securite" label="Mot de passe" icon={Lock} tone="bg-purple-50 text-purple-700" />
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Centre personnel</h2>
        {walletEnabled && <MenuRow to="/compte/bonus" label="Bonus surprise" icon={Gift} tone="bg-pink-50 text-pink-600" />}
        {settings?.feature_referral && <MenuRow to="/compte/parrainage" label="Mon équipe" icon={Users} tone="bg-orange-50 text-orange-600" />}
        <MenuRow to="/messages" label="Messages" icon={MessageSquare} tone="bg-violet-50 text-violet-600" />
        <MenuRow to="/compte/notifications" label="Notifications" icon={Bell} tone="bg-night-50 text-night-600" badge={data?.unread} />
        <MenuRow to="/compte/profil" label="Mon profil" icon={User} tone="bg-sky-50 text-sky-600" />
        <MenuRow to="/service-client" label="Service client" icon={LifeBuoy} tone="bg-accent-50 text-accent-600" />
        {isAdmin && <MenuRow to="/admin" label="Administration" icon={Shield} tone="bg-night-900 text-white" />}
        <MenuRow onClick={logout} label="Déconnexion" icon={LogOut} tone="bg-slate-100 text-slate-600" />
      </section>
    </div>
  );
}
