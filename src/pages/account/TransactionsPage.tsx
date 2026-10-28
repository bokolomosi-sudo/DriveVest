import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice } from '../../lib/format';
import { TRANSACTION_TYPE_LABELS, transactionStatus } from '../../lib/labels';
import { listMyTransactions } from '../../services/orders';

export default function TransactionsPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listMyTransactions(user!.id), [user!.id]);
  return (
    <>
      <PageMeta title="Mes transactions" noindex />
      <PageHeader
        title="Historique des transactions"
        description="Paiements de vos commandes. Une transaction « En attente » n'est pas encore vérifiée."
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Receipt className="h-10 w-10" />} title="Aucune transaction" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Référence</th><th>Motif</th><th>Montant</th><th>Statut</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{formatDate(t.created_at, true)}</td>
                  <td className="whitespace-nowrap">{TRANSACTION_TYPE_LABELS[t.type]}</td>
                  <td className="font-mono text-xs">{t.reference}</td>
                  <td>
                    {t.order_id ? <Link to={`/compte/commandes/${t.order_id}`} className="text-night-700 hover:underline">{t.reason ?? 'Commande'}</Link> : t.reason ?? '—'}
                  </td>
                  <td className={`whitespace-nowrap font-semibold ${t.type === 'refund' ? 'text-accent-700' : ''}`}>
                    {t.type === 'refund' ? '+' : ''}{formatPrice(Number(t.amount), t.currency)}
                  </td>
                  <td><Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
