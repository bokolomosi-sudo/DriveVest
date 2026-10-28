import { useState } from 'react';
import { CheckCircle2, Copy, Gift, MapPin, MessageCircle, Phone, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { listMyCommissions, listMyTeam, listMyTeamRewards, referralLink } from '../../services/referral';
import type { TeamMember, TeamReward } from '../../types';

const LEVEL_TABS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'Tous' },
  { value: 1, label: 'Niveau 1' },
  { value: 2, label: 'Niveau 2' },
  { value: 3, label: 'Niveau 3' },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white px-2 py-4 text-center shadow-sm ring-1 ring-slate-100">
      <p className="truncate text-xs text-slate-500 min-[360px]:text-sm">{label}</p>
      <p className="mt-1 break-words text-base font-bold text-slate-900 min-[360px]:text-lg">{value}</p>
    </div>
  );
}

function TeamList({ title, members, empty }: { title: string; members: TeamMember[]; empty: string }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">{title} ({members.length})</h2>
      {members.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m, i) => <MemberCard key={`${m.joined_at}-${i}`} member={m} />)}
        </ul>
      )}
    </section>
  );
}

function MemberCard({ member: m }: { member: TeamMember }) {
  // Les numéros complets (niveau 1) commencent par 0 : on propose l'appel et WhatsApp
  const callable = m.phone && /^0\d{9}$/.test(m.phone);
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${m.has_invested ? 'bg-accent-100 text-accent-800' : 'bg-slate-100 text-slate-500'}`}>
          {m.display_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{m.display_name}</p>
            <Badge tone={m.level === 1 ? 'success' : m.level === 2 ? 'info' : 'neutral'}>Niveau {m.level}</Badge>
          </div>
          {m.phone && <p className="font-mono text-sm text-slate-600">{m.phone}</p>}
          {(m.city || m.province) && (
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /> {[m.city, m.province].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="text-xs text-slate-500">Inscrit le {formatDate(m.joined_at)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center">
        <div><dt className="text-[11px] text-slate-500">Produits</dt><dd className="text-sm font-semibold">{m.products_count}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] text-slate-500">Investi</dt><dd className="break-words text-sm font-semibold">{formatPrice(m.invested_amount, CURRENCY)}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] text-slate-500">Vos gains</dt><dd className="break-words text-sm font-semibold text-accent-700">{formatPrice(m.commissions, CURRENCY)}</dd></div>
      </dl>
      {callable && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:+243${m.phone!.slice(1)}`} className="btn-secondary rounded-xl py-2.5"><Phone className="h-4 w-4" /> Appeler</a>
          <a href={`https://wa.me/243${m.phone!.slice(1)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary rounded-xl py-2.5"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
        </div>
      )}
    </li>
  );
}

/** Récompenses d'équipe : progression vers chaque palier (invités directs ayant acheté). */
function TeamRewards({ rewards }: { rewards: TeamReward[] }) {
  if (rewards.length === 0) return null;
  const invested = rewards[0].invested_invitees;
  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-accent-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-900">Récompenses d'équipe</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Seuls vos invités directs ayant déjà acheté au moins un produit comptent. La récompense est versée automatiquement sur votre compte Drivest.
      </p>
      <ul className="mt-4 space-y-4">
        {rewards.map((r) => {
          const done = Boolean(r.granted_at);
          const progress = Math.min(invested, r.invited_count);
          return (
            <li key={r.tier_id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <p className="font-medium text-slate-900">{r.invited_count} invités ayant investi</p>
                <p className={done ? 'font-semibold text-accent-700' : 'text-slate-500'}>
                  {done ? (
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {formatPrice(r.amount, CURRENCY)} reçus</span>
                  ) : (
                    <>{progress}/{r.invited_count} · {formatPrice(r.amount, CURRENCY)}</>
                  )}
                </p>
              </div>
              <div
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={r.invited_count}
                aria-valuenow={done ? r.invited_count : progress}
                aria-label={`${r.invited_count} invités ayant investi`}
              >
                <div
                  className={`h-full rounded-full transition-all ${done ? 'bg-accent-600' : 'bg-accent-400'}`}
                  style={{ width: `${done ? 100 : Math.max((progress / r.invited_count) * 100, progress > 0 ? 4 : 0)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ReferralPage() {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const team = useAsync(listMyTeam, []);
  const rewards = useAsync(listMyTeamRewards, []);
  const [level, setLevel] = useState<0 | 1 | 2 | 3>(0);
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

  const members = team.data ?? [];
  const countLevel = (n: number) => members.filter((m) => m.level === n).length;
  const totalCommissions = members.reduce((sum, m) => sum + m.commissions, 0);
  const shown = level === 0 ? members : members.filter((m) => m.level === level);
  const invested = shown.filter((m) => m.has_invested);
  const notInvested = shown.filter((m) => !m.has_invested);

  return (
    <>
      <PageMeta title="Mon équipe" noindex />
      <PageHeader title="Mon équipe" description="Invitez vos proches et suivez votre équipe." />

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
                    <p className="text-lg font-bold text-accent-700 min-[360px]:text-xl">{rates[i]} %</p>
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

      <div className="mt-6 grid grid-cols-3 gap-2 min-[360px]:gap-3">
        <Stat label="Niveau 1" value={String(countLevel(1))} />
        <Stat label="Niveau 2" value={String(countLevel(2))} />
        <Stat label="Commissions" value={formatPrice(totalCommissions, CURRENCY)} />
      </div>

      {rewards.data && <TeamRewards rewards={rewards.data} />}

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100" role="tablist" aria-label="Niveau">
        {LEVEL_TABS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={level === value}
            onClick={() => setLevel(value)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${level === value ? 'bg-accent-500 text-night-950' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {team.loading ? <LoadingState /> : team.error ? <ErrorState message={team.error} onRetry={team.reload} /> : !team.data?.length ? (
        <div className="mt-6">
          <EmptyState icon={<Users className="h-10 w-10" />} title="Aucun invité pour le moment" description="Partagez votre lien d'invitation." />
        </div>
      ) : (
        <>
          <TeamList title="Invités ayant investi" members={invested} empty="Aucun invité n'a encore acheté de produit." />
          <TeamList title="Inscrits sans investissement" members={notInvested} empty="Tous vos invités ont déjà acheté un produit." />
        </>
      )}

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
