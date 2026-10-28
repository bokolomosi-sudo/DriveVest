import { WithdrawalAccountCard, WithdrawalSetup } from '../../components/finance/WalletForms';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { getMyWithdrawalAccount } from '../../services/wallet';

/** Portefeuille de paiement : uniquement le compte qui reçoit les retraits. */
export default function WalletPage() {
  const account = useAsync(getMyWithdrawalAccount, []);

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Portefeuille" noindex />
      <PageHeader title="Portefeuille de paiement" description="Le compte sur lequel vous recevez vos retraits." />
      {account.loading ? (
        <LoadingState />
      ) : account.error ? (
        <ErrorState message={account.error} onRetry={account.reload} />
      ) : account.data ? (
        <div className="space-y-4">
          <WithdrawalAccountCard account={account.data} />
          <Alert tone="info">Pour modifier ces informations, contactez le service client.</Alert>
        </div>
      ) : (
        <WithdrawalSetup onDone={account.reload} />
      )}
    </div>
  );
}
