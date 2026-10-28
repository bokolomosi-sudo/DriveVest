import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DepositChannelsManager } from '../../components/admin/DepositChannelsManager';
import { WalletOperations } from '../../components/admin/WalletOperations';
import { WithdrawalNetworksManager } from '../../components/admin/WithdrawalNetworksManager';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import { adminListUsers, type AdminUser } from '../../services/admin';
import { adminListCommissions } from '../../services/referral';
import { adminUserBalances, adminWalletAdjustment } from '../../services/wallet';

const TABS = [
  { key: 'depots', label: 'Dépôts' },
  { key: 'retraits', label: 'Retraits' },
  { key: 'comptes', label: 'Comptes de dépôt' },
  { key: 'reseaux', label: 'Réseaux de retrait' },
  { key: 'ajustement', label: 'Ajustement' },
  { key: 'parrainage', label: 'Commissions' },
] as const;

function AdjustmentTab() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const balances = useAsync(() => (selected ? adminUserBalances(selected.id) : Promise.resolve([])), [selected?.id]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(settings?.default_currency ?? 'CDF');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setUsers(await adminListUsers(search));
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminWalletAdjustment({ userId: selected.id, amount: Number(amount), currency, direction, reason });
      notify('success', 'Ajustement enregistré.');
      setAmount('');
      setReason('');
      await balances.reload();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <form onSubmit={find} className="flex gap-2">
          <input className="input" placeholder="Nom ou téléphone (097…)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un utilisateur" />
          <button className="btn-dark">Chercher</button>
        </form>
        <ul className="card divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id}>
              <button onClick={() => setSelected(u)} className={`w-full p-3 text-left text-sm hover:bg-slate-50 ${selected?.id === u.id ? 'bg-accent-50' : ''}`}>
                <p className="font-medium">{u.full_name ?? '—'}</p><p className="text-xs text-slate-500">{formatLocalPhone(u.phone)}</p>
              </button>
            </li>
          ))}
          {users.length === 0 && <li className="p-3 text-sm text-slate-500">Recherchez un utilisateur.</li>}
        </ul>
      </div>
      {selected && (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <p className="font-semibold">{selected.full_name ?? selected.email}</p>
          <div className="text-sm text-slate-600">
            {(balances.data ?? []).map((b) => <p key={b.currency}>Disponible : <strong>{formatPrice(b.available, b.currency)}</strong></p>)}
            {balances.data?.length === 0 && <p>Aucune opération de portefeuille.</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sens" htmlFor="adj-dir">
              <select id="adj-dir" className="input" value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}>
                <option value="credit">Crédit</option><option value="debit">Débit</option>
              </select>
            </Field>
            <Field label="Montant" htmlFor="adj-amount" required><input id="adj-amount" type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Devise" htmlFor="adj-cur"><input id="adj-cur" className="input uppercase bg-slate-50" maxLength={3} readOnly value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
          </div>
          <Field label="Motif et justificatif" htmlFor="adj-reason" required hint="Visible par le client et conservé dans le journal d'audit.">
            <textarea id="adj-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer l'ajustement</button>
        </form>
      )}
    </div>
  );
}

function CommissionsTab() {
  const { data, loading, error, reload } = useAsync(adminListCommissions, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState title="Aucune commission versée" />;
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Date</th><th>Parrain</th><th>Origine</th><th>Base</th><th>Commission</th><th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-xs">{formatDate(c.created_at, true)}</td>
              <td><p>{c.referrer?.full_name ?? '—'}</p><p className="text-xs text-slate-500">{c.referrer?.email}</p></td>
              <td>{c.source_type === 'order' ? 'Achat' : 'Participation'}</td>
              <td className="whitespace-nowrap">{formatPrice(Number(c.base_amount), c.currency)} × {Number(c.rate)} %</td>
              <td className="whitespace-nowrap font-semibold">{formatPrice(Number(c.amount), c.currency)}</td>
              <td>{c.reversed_at && <Badge tone="danger">Annulée</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminWalletPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('onglet') ?? 'depots';
  return (
    <>
      <PageMeta title="Portefeuilles — Administration" noindex />
      <PageHeader title="Portefeuilles" description="Dépôts et retraits à traiter, comptes de dépôt, ajustements justifiés et commissions." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams({ onglet: t.key })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.key ? 'border-accent-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'retraits' ? (
        <WalletOperations kind="withdrawal" />
      ) : tab === 'comptes' ? (
        <DepositChannelsManager />
      ) : tab === 'reseaux' ? (
        <WithdrawalNetworksManager />
      ) : tab === 'ajustement' ? (
        <AdjustmentTab />
      ) : tab === 'parrainage' ? (
        <CommissionsTab />
      ) : (
        <WalletOperations kind="deposit" />
      )}
    </>
  );
}
