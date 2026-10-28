import { OperationsList, WithdrawalForm, WithdrawalSetup } from '../../components/finance/WalletForms';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatPrice } from '../../lib/format';
import { cancelMyWithdrawal, getMyBalances, getMyWithdrawalAccount, listMyWalletTransactions } from '../../services/wallet';

export default function WithdrawalPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const { notify } = useToast();
  const account = useAsync(getMyWithdrawalAccount, []);
  const balances = useAsync(getMyBalances, []);
  const history = useAsync(() => listMyWalletTransactions(userId), [userId]);
  const withdrawals = (history.data ?? []).filter((t) => t.type === 'withdrawal');
  const available = balances.data?.find((b) => b.currency === CURRENCY)?.available ?? 0;

  const reload = () => {
    void balances.reload();
    void history.reload();
  };

  const cancel = async (id: string) => {
    try {
      await cancelMyWithdrawal(id);
      notify('success', 'Retrait annulé.');
      reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Retrait" noindex />
      <PageHeader title="Retrait" />
      <div className="mb-5 rounded-2xl bg-night-900 p-4 text-white">
        <p className="text-xs text-night-200">Solde disponible</p>
        <p className="mt-1 text-2xl font-bold">{balances.loading ? '…' : formatPrice(available, CURRENCY)}</p>
      </div>

      {account.loading || balances.loading ? (
        <LoadingState />
      ) : account.error ? (
        <ErrorState message={account.error} onRetry={account.reload} />
      ) : account.data ? (
        <WithdrawalForm account={account.data} available={available} onDone={reload} />
      ) : (
        // Premier retrait : configuration du portefeuille de paiement
        <WithdrawalSetup onDone={account.reload} />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mes retraits</h2>
        {history.loading ? <LoadingState /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : (
          <OperationsList operations={withdrawals} emptyTitle="Aucun retrait" onCancel={cancel} />
        )}
      </section>
    </div>
  );
}
