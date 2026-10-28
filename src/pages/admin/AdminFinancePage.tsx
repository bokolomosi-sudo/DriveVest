import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PaymentReviewDialog } from '../../components/admin/ReviewDialogs';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { ProofLink } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice } from '../../lib/format';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  TRANSACTION_TYPE_LABELS,
  entries,
  transactionStatus,
} from '../../lib/labels';
import { adminListPayments, adminListTransactions } from '../../services/orders';
import type { Payment, PaymentStatus } from '../../types';

const TABS = [
  { key: 'paiements', label: 'Paiements' },
  { key: 'transactions', label: 'Transactions' },
] as const;

function PaymentsTab() {
  const [status, setStatus] = useState<PaymentStatus | 'all'>('submitted');
  const { data, loading, error, reload } = useAsync(() => adminListPayments(status), [status]);
  const [review, setReview] = useState<{ payment: Payment; approve: boolean } | null>(null);
  return (
    <>
      <select className="input mb-4 w-auto" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | 'all')} aria-label="Filtrer">
        <option value="all">Tous</option>
        {entries(PAYMENT_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState title={status === 'submitted' ? 'Aucun paiement à vérifier' : 'Aucun paiement'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Commande</th><th>Client</th><th>Montant</th><th>Moyen / Réf.</th><th>Statut</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-xs">{formatDate(p.created_at, true)}</td>
                  <td><Link to={`/admin/commandes/${p.order_id}`} className="font-semibold text-night-700 hover:underline">{p.order?.order_number}</Link></td>
                  <td><p>{p.customer?.full_name ?? '—'}</p><p className="text-xs text-slate-500">{p.customer?.email}</p></td>
                  <td className="whitespace-nowrap font-semibold">{formatPrice(Number(p.amount), p.currency)}</td>
                  <td><p>{p.method}</p><p className="font-mono text-xs text-slate-500">{p.reference}</p>{p.proof_path && <ProofLink path={p.proof_path} />}</td>
                  <td><Badge tone={PAYMENT_STATUS_TONES[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge></td>
                  <td>
                    {p.status === 'submitted' && (
                      <div className="flex gap-1.5">
                        <button className="btn-primary btn-sm" onClick={() => setReview({ payment: p, approve: true })}>Vérifier</button>
                        <button className="btn-secondary btn-sm" onClick={() => setReview({ payment: p, approve: false })}>Refuser</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaymentReviewDialog payment={review?.payment ?? null} approve={review?.approve ?? true} onClose={() => setReview(null)} onDone={reload} />
    </>
  );
}

function TransactionsTab() {
  const { data, loading, error, reload } = useAsync(adminListTransactions, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState title="Aucune transaction" />;
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Date</th><th>Référence</th><th>Client</th><th>Type</th><th>Montant</th><th>Statut</th><th>Motif</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap text-xs">{formatDate(t.created_at, true)}</td>
              <td className="font-mono text-xs">{t.reference}</td>
              <td>{t.customer?.full_name ?? t.customer?.email ?? '—'}</td>
              <td className="whitespace-nowrap">{TRANSACTION_TYPE_LABELS[t.type]}</td>
              <td className="whitespace-nowrap font-semibold">{formatPrice(Number(t.amount), t.currency)}</td>
              <td><Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge></td>
              <td className="text-xs">{t.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminFinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('onglet') ?? 'paiements';
  return (
    <>
      <PageMeta title="Finances — Administration" noindex />
      <PageHeader title="Paiements et transactions" description="Vérification manuelle des paiements déclarés et journal des transactions." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ onglet: t.key })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.key ? 'border-accent-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'transactions' ? <TransactionsTab /> : <PaymentsTab />}
    </>
  );
}
