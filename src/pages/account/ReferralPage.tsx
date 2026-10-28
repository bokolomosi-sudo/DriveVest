import { Copy, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice } from '../../lib/format';
import { listMyCommissions, listMyReferrals, referralLink } from '../../services/referral';

export default function ReferralPage() {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const team = useAsync(listMyReferrals, []);
  const commissions = useAsync(() => listMyCommissions(user!.id), [user!.id]);
  const code = profile?.referral_code ?? '';
  const link = code ? referralLink(code) : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'Copié dans le presse-papiers.');
    } catch {
      notify('error', 'Copie impossible : sélectionnez le texte manuellement.');
    }
  };

  const rates = [
    Number(settings?.referral_commission_percent ?? 0),
    Number(settings?.referral_level2_percent ?? 0),
    Number(settings?.referral_level3_percent ?? 0),
  ];
  const bases = [settings?.referral_on_orders && 'achats de véhicules payés'].filter(Boolean);
  const totalByCurrency = new Map<string, number>();
  for (const c of commissions.data ?? []) {
    if (!c.reversed_at) totalByCurrency.set(c.currency, (totalByCurrency.get(c.currency) ?? 0) + Number(c.amount));
  }

  return (
    <>
      <PageMeta title="Parrainage" noindex />
      <PageHeader title="Parrainage" description="Invitez vos proches sur Drivest." />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <p className="text-sm text-slate-500">Votre code</p>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-night-900 px-4 py-2 font-mono text-lg font-bold tracking-widest text-white">{code || '—'}</span>
            {code && <button className="btn-secondary btn-sm" onClick={() => copy(code)}><Copy className="h-3.5 w-3.5" /> Copier</button>}
          </div>
          <p className="text-sm text-slate-500">Lien d'invitation</p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={link} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
            <button className="btn-secondary" onClick={() => copy(link)} aria-label="Copier le lien"><Copy className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="card p-5 text-sm">
          <p className="font-semibold">Règles de rémunération</p>
          {rates.some((r) => r > 0) && bases.length > 0 ? (
            <div className="mt-2 space-y-2 text-slate-600">
              <p>Sur les {bases.join(' et les ')} confirmés de votre équipe, vous recevez :</p>
              <ul className="grid grid-cols-3 gap-2 text-center">
                {['Vos invités', 'Leurs invités', 'Niveau 3'].map((label, i) => (
                  <li key={label} className="rounded-lg bg-accent-50 p-2">
                    <p className="text-xl font-bold text-accent-700">{rates[i]} %</p>
                    <p className="text-xs">{label}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs">L'inscription seule n'est pas rémunérée.</p>
            </div>
          ) : (
            <p className="mt-2 text-slate-600">Aucune commission n'est actuellement versée au titre du parrainage.</p>
          )}
          {totalByCurrency.size > 0 && (
            <div className="mt-4">
              <p className="text-slate-500">Commissions perçues</p>
              {[...totalByCurrency].map(([cur, total]) => <p key={cur} className="text-xl font-bold text-accent-700">{formatPrice(total, cur)}</p>)}
            </div>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mon équipe {team.data && `(${team.data.length})`}</h2>
        {team.loading ? <LoadingState /> : team.error ? <ErrorState message={team.error} onRetry={team.reload} /> : !team.data?.length ? (
          <EmptyState icon={<Users className="h-10 w-10" />} title="Aucun filleul pour le moment" description="Partagez votre lien d'invitation." />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {team.data.map((m, i) => (
              <li key={i} className="flex items-center justify-between p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Badge tone={m.level === 1 ? 'success' : m.level === 2 ? 'info' : 'neutral'}>Niveau {m.level}</Badge>
                  <div><p className="font-medium">{m.display_name}</p><p className="text-xs text-slate-500">Inscrit le {formatDate(m.joined_at)}</p></div>
                </div>
                {m.commissions > 0 && <span className="font-semibold text-accent-700">{formatPrice(m.commissions, 'CDF')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Historique des commissions</h2>
        {commissions.loading ? <LoadingState /> : commissions.error ? <ErrorState message={commissions.error} onRetry={commissions.reload} /> : !commissions.data?.length ? (
          <EmptyState title="Aucune commission" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Date</th><th>Origine</th><th>Niveau</th><th>Base</th><th>Taux</th><th>Commission</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {commissions.data.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-xs">{formatDate(c.created_at, true)}</td>
                    <td>{c.source_type === 'order' ? 'Achat de véhicule' : 'Participation'}</td>
                    <td>{c.level}</td>
                    <td className="whitespace-nowrap">{formatPrice(Number(c.base_amount), c.currency)}</td>
                    <td>{Number(c.rate)} %</td>
                    <td className="whitespace-nowrap font-semibold">{formatPrice(Number(c.amount), c.currency)}</td>
                    <td>{c.reversed_at && <Badge tone="danger">Annulée</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
