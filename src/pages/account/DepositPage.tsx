import { DepositForm, OperationsList } from '../../components/finance/WalletForms';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { listMyWalletTransactions } from '../../services/wallet';

export default function DepositPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const history = useAsync(() => listMyWalletTransactions(userId), [userId]);
  const deposits = (history.data ?? []).filter((t) => t.type === 'deposit');

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Dépôt" noindex />
      <PageHeader title="Dépôt" description="Rechargez votre compte Drivest par Mobile Money." />
      <DepositForm userId={userId} onDone={history.reload} />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mes dépôts</h2>
        {history.loading ? <LoadingState /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : (
          <OperationsList operations={deposits} emptyTitle="Aucun dépôt" />
        )}
      </section>
    </div>
  );
}
