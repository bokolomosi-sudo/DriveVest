import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { ProofLink } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import { TRANSACTION_STATUS_LABELS, entries, transactionStatus } from '../../lib/labels';
import { adminListUsers, type AdminUser } from '../../services/admin';
import { adminListCommissions } from '../../services/referral';
import {
  adminListWalletOperations,
  adminProcessWithdrawal,
  adminReviewDeposit,
  adminUserBalances,
  adminWalletAdjustment,
} from '../../services/wallet';
import type { Transaction, TransactionStatus } from '../../types';

const TABS = [
  { key: 'depots', label: 'Dépôts' },
  { key: 'retraits', label: 'Retraits' },
  { key: 'ajustement', label: 'Ajustement' },
  { key: 'parrainage', label: 'Commissions' },
] as const;

function OperationsTab({ type }: { type: 'deposit' | 'withdrawal' }) {
  const { notify } = useToast();
  const [status, setStatus] = useState<TransactionStatus | 'all'>('pending');
  const { data, loading, error, reload } = useAsync(() => adminListWalletOperations(type, status), [type, status]);
  const [action, setAction] = useState<{ tx: Transaction; approve: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (type === 'deposit') await adminReviewDeposit(action.tx.id, action.approve, reason);
      else await adminProcessWithdrawal(action.tx.id, action.approve, reason, payout);
      notify('success', 'Opération traitée.');
      setAction(null);
      setReason('');
      setPayout('');
      await reload();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <select className="input mb-4 w-auto" value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus | 'all')} aria-label="Filtrer">
        <option value="all">Tous</option>
        {entries(TRANSACTION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState title={status === 'pending' ? 'Aucune opération à traiter' : 'Aucune opération'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Client</th><th>Montant</th><th>{type === 'deposit' ? 'Moyen / Réf.' : 'Moyen / Destination'}</th><th>Statut</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-xs">{formatDate(t.created_at, true)}</td>
                  <td><p>{t.customer?.full_name ?? '—'}</p><p className="text-xs text-slate-500">{t.customer?.email}</p></td>
                  <td className="whitespace-nowrap font-semibold">{formatPrice(Number(t.amount), t.currency)}</td>
                  <td className="text-xs">
                    <p>{t.method}</p>
                    <p className="font-mono text-slate-500">{type === 'deposit' ? t.external_reference : t.destination}</p>
                    {type === 'withdrawal' && t.external_reference && <p className="text-slate-500">Versé : {t.external_reference}</p>}
                    {t.proof_path && <ProofLink path={t.proof_path} />}
                    {t.rejection_reason && <p className="text-red-700">{t.rejection_reason}</p>}
                  </td>
                  <td><Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge></td>
                  <td>
                    {t.status === 'pending' && (
                      <div className="flex gap-1.5">
                        <button className="btn-primary btn-sm" onClick={() => { setAction({ tx: t, approve: true }); setActionError(null); }}>
                          {type === 'deposit' ? 'Créditer' : 'Confirmer'}
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => { setAction({ tx: t, approve: false }); setActionError(null); }}>Refuser</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={action !== null}
        title={action?.approve ? (type === 'deposit' ? 'Créditer le dépôt' : 'Confirmer le retrait') : 'Refuser'}
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAction(null)} disabled={busy}>Annuler</button>
            <button className={action?.approve ? 'btn-primary' : 'btn-danger'} onClick={submit} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Confirmer</button>
          </>
        }
      >
        {action && (
          <div className="space-y-4 text-sm">
            <p className="font-semibold">{formatPrice(Number(action.tx.amount), action.tx.currency)} · {action.tx.customer?.full_name ?? action.tx.customer?.email}</p>
            {action.approve && type === 'deposit' && (
              <Alert tone="warning">Créditez uniquement après avoir constaté la réception effective des fonds. Action journalisée.</Alert>
            )}
            {action.approve && type === 'withdrawal' && (
              <>
                <p>Vers : <strong>{action.tx.destination}</strong></p>
                <Alert tone="warning">Confirmez après avoir envoyé l'argent sur ce compte Airtel Money.</Alert>
                <Field label="Référence de l'envoi (facultatif)" htmlFor="payout">
                  <input id="payout" className="input" value={payout} onChange={(e) => setPayout(e.target.value)} />
                </Field>
              </>
            )}
            {!action.approve && (
              <Field label="Motif du refus" htmlFor="tx-reason" required>
                <textarea id="tx-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
            {actionError && <Alert tone="danger">{actionError}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}

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
          <input className="input" placeholder="Nom, e-mail ou téléphone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un utilisateur" />
          <button className="btn-dark">Chercher</button>
        </form>
        <ul className="card divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id}>
              <button onClick={() => setSelected(u)} className={`w-full p-3 text-left text-sm hover:bg-slate-50 ${selected?.id === u.id ? 'bg-accent-50' : ''}`}>
                <p className="font-medium">{u.full_name ?? '—'}</p><p className="text-xs text-slate-500">{u.email}</p>
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
          <div className="grid grid-cols-3 gap-3">
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
      <PageHeader title="Portefeuilles" description="Vérification des dépôts, traitement des retraits, ajustements justifiés et commissions." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams({ onglet: t.key })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.key ? 'border-accent-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'retraits' ? <OperationsTab type="withdrawal" /> : tab === 'ajustement' ? <AdjustmentTab /> : tab === 'parrainage' ? <CommissionsTab /> : <OperationsTab type="deposit" />}
    </>
  );
}
