import { Link } from 'react-router-dom';
import { Gem } from 'lucide-react';
import { WithdrawalConditions, WithdrawalForm, WithdrawalHistory, WithdrawalSetup } from '../../components/finance/WalletForms';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY } from '../../lib/format';
import { getMyBalances, getMyWithdrawalAccount, iAmCertified, iHaveApprovedDeposit, listMyWalletTransactions } from '../../services/wallet';

export default function WithdrawalPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const account = useAsync(getMyWithdrawalAccount, []);
  const balances = useAsync(getMyBalances, []);
  // Retrait réservé aux comptes certifiés (au moins un produit Prestige)
  const purchased = useAsync(iAmCertified, []);
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
          {purchased.data === false && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <Gem className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-bold text-amber-900">Retrait non autorisé pour le moment</p>
                <p className="text-sm text-amber-800">
                  Pour effectuer un retrait, vous devez avoir acheté au moins un produit Prestige. Une fois votre
                  produit Prestige acheté, votre compte est certifié et le retrait est débloqué.
                </p>
                <Link to="/produits" className="mt-2 inline-block text-sm font-semibold text-amber-900 underline">
                  Acheter un produit Prestige
                </Link>
              </div>
            </div>
          )}
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
