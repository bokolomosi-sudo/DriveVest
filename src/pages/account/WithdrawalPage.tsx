import { WithdrawalConditions, WithdrawalForm, WithdrawalHistory, WithdrawalSetup } from '../../components/finance/WalletForms';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY } from '../../lib/format';
import { getMyBalances, getMyWithdrawalAccount, iHaveApprovedDeposit, iHavePurchased, listMyWalletTransactions } from '../../services/wallet';

export default function WithdrawalPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const account = useAsync(getMyWithdrawalAccount, []);
  const balances = useAsync(getMyBalances, []);
  const purchased = useAsync(iHavePurchased, []);
  const deposited = useAsync(iHaveApprovedDeposit, []);
  const history = useAsync(() => listMyWalletTransactions(userId), [userId]);
  const available = balances.data?.find((b) => b.currency === CURRENCY)?.available ?? 0;

  const reload = () => {
    void balances.reload();
    void history.reload();
  };

  const loading = account.loading || balances.loading || purchased.loading || deposited.loading;
  const error = account.error ?? balances.error ?? purchased.error ?? deposited.error;

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Retrait" noindex />
      <PageHeader title="Retrait" description="Retirez vos gains vers votre compte Mobile Money." />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { void account.reload(); void balances.reload(); void purchased.reload(); void deposited.reload(); }} />
      ) : (
        <div className="space-y-5">
          <WithdrawalConditions purchased={purchased.data === true} deposited={deposited.data === true} hasAccount={Boolean(account.data)} />
          {account.data ? (
            <WithdrawalForm account={account.data} available={available} purchased={purchased.data === true} deposited={deposited.data === true} onDone={reload} />
          ) : (
            // Premier retrait : configuration du portefeuille de paiement
            <WithdrawalSetup onDone={account.reload} />
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Historique des retraits</h2>
        {history.loading ? <LoadingState /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : (
          <WithdrawalHistory transactions={history.data ?? []} />
        )}
      </section>
    </div>
  );
}
