import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CreditCard, Wallet } from 'lucide-react';
import { OrderStatusBadge, OrderSummary, OrderTimeline, PaymentRow, paidAmount } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import { cancelMyOrder, getOrder, submitPayment } from '../../services/orders';
import { getMyBalances, payOrderWithWallet } from '../../services/wallet';
import type { Order } from '../../types';

function WalletPayCard({ order, remaining, onDone }: { order: Order; remaining: number; onDone: () => void }) {
  const { notify } = useToast();
  const balances = useAsync(getMyBalances, []);
  const [busy, setBusy] = useState(false);
  const available = balances.data?.find((b) => b.currency === order.currency)?.available ?? 0;

  const pay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await payOrderWithWallet(order.id);
      notify('success', 'Commande payée depuis votre portefeuille.');
      onDone();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-night-600" /> Payer avec mon portefeuille</p>
        <p className="mt-1 text-slate-500">Disponible : {balances.loading ? '…' : formatPrice(available, order.currency)} · à payer : {formatPrice(remaining, order.currency)}</p>
      </div>
      {available >= remaining ? (
        <button className="btn-primary" onClick={pay} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Payer {formatPrice(remaining, order.currency)}</button>
      ) : (
        <Link to="/compte/depot" className="btn-secondary">Approvisionner</Link>
      )}
    </section>
  );
}

function PaymentForm({ order, userId, onDone }: { order: Order; userId: string; onDone: () => void }) {
  const { settings } = useSettings();
  const { notify } = useToast();
  const remaining = Math.max(0, Number(order.total_amount) - paidAmount(order));
  const methods = settings?.accepted_payment_methods ?? [];
  const [method, setMethod] = useState(methods[0] ?? '');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(String(remaining));
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const value = Number(amount);
    if (!method.trim()) return setError('Indiquez le moyen de paiement utilisé.');
    if (reference.trim().length < 3) return setError('Indiquez la référence de la transaction.');
    if (!Number.isFinite(value) || value <= 0 || value > remaining) {
      return setError(`Le montant doit être compris entre 0 et ${formatPrice(remaining, order.currency)}.`);
    }
    setBusy(true);
    try {
      await submitPayment({ userId, orderId: order.id, method, reference, amount: value, proof });
      notify('success', 'Paiement déclaré. Il sera vérifié par notre équipe.');
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Moyen de paiement" htmlFor="pay-method" required>
          {methods.length > 0 ? (
            <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input id="pay-method" className="input" maxLength={60} value={method} onChange={(e) => setMethod(e.target.value)} />
          )}
        </Field>
        <Field label={`Montant (${order.currency})`} htmlFor="pay-amount" required>
          <input id="pay-amount" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Référence de la transaction" htmlFor="pay-ref" required hint="Numéro figurant sur votre reçu ou votre confirmation de virement.">
        <input id="pay-ref" className="input" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Field label="Justificatif" htmlFor="pay-proof" hint="Facultatif — image ou PDF, 5 Mo maximum.">
        <input
          id="pay-proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-night-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-night-700"
          onChange={(e) => setProof(e.target.files?.[0] ?? null)}
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Déclarer le paiement</button>
    </form>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const { data: order, loading, error, reload } = useAsync(() => getOrder(id), [id]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!order || !user || order.user_id !== user.id) {
    return <EmptyState title="Commande introuvable" action={<Link to="/compte/produits" className="btn-primary">Mes produits</Link>} />;
  }

  const payments = order.payments ?? [];
  const hasPending = payments.some((p) => p.status === 'submitted');
  const paid = paidAmount(order);
  const remaining = Number(order.total_amount) - paid;
  const canPay = ['pending_confirmation', 'payment_verification'].includes(order.status) && !hasPending && remaining > 0;
  const canCancel = ['draft', 'pending_confirmation', 'payment_verification'].includes(order.status) && paid === 0;

  const runAction = async (fn: () => Promise<void>, success: string, close: () => void) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      notify('success', success);
      close();
      setReason('');
      await reload();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title={`Commande ${order.order_number}`} noindex />
      <Link to="/compte/produits" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Mes produits
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commande {order.order_number}</h1>
          <p className="text-sm text-slate-500">Créée le {formatDate(order.created_at, true)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <OrderSummary order={order} />

          {order.status === 'cancelled' && order.cancel_reason && (
            <Alert tone="warning" title="Commande annulée">{order.cancel_reason}</Alert>
          )}

          {settings?.feature_wallet && order.status === 'pending_confirmation' && !hasPending && remaining > 0 && (
            <WalletPayCard order={order} remaining={remaining} onDone={reload} />
          )}

          {canPay && (
            <section className="card space-y-4 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="h-5 w-5 text-night-600" /> Paiement</h2>
              {settings?.payment_instructions ? (
                <div className="whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{settings.payment_instructions}</div>
              ) : (
                <Alert tone="warning" title="Instructions de paiement non publiées">
                  Drivest n'a pas encore publié ses instructions de paiement. Contactez le service client avant
                  d'effectuer tout paiement.
                </Alert>
              )}
              <Alert tone="info">
                Après avoir payé, déclarez ici la référence de votre transaction. La déclaration ne vaut pas
                confirmation : votre paiement sera considéré comme reçu uniquement après vérification par notre équipe.
              </Alert>
              <PaymentForm order={order} userId={user.id} onDone={reload} />
            </section>
          )}

          {payments.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Paiements déclarés</h2>
              <ul className="card divide-y divide-slate-100">
                {payments.map((p) => <PaymentRow key={p.id} payment={p} />)}
              </ul>
            </section>
          )}

        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-base font-semibold">Suivi</h2>
            <OrderTimeline order={order} />
          </section>
          {canCancel && (
            <section className="card space-y-2 p-5">
              <button className="btn-secondary w-full" onClick={() => { setActionError(null); setCancelOpen(true); }}>
                <Ban className="h-4 w-4" /> Annuler la commande
              </button>
            </section>
          )}
          <Link to="/service-client" className="btn-ghost w-full">Une question ? Service client</Link>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        title="Annuler la commande"
        onClose={() => !busy && setCancelOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCancelOpen(false)} disabled={busy}>Retour</button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => runAction(() => cancelMyOrder(order.id, reason), 'Commande annulée.', () => setCancelOpen(false))}
            >
              {busy && <Spinner className="h-4 w-4" />} Confirmer l'annulation
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Cette action est définitive. Les paiements en attente de vérification seront annulés.</p>
          <Field label="Motif (facultatif)" htmlFor="cancel-reason">
            <textarea id="cancel-reason" rows={3} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {actionError && <Alert tone="danger">{actionError}</Alert>}
        </div>
      </Modal>

    </>
  );
}
