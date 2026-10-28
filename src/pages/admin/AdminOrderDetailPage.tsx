import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { PaymentReviewDialog } from '../../components/admin/ReviewDialogs';
import { OrderStatusBadge, OrderSummary, OrderTimeline, PaymentRow } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { Alert, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { ADMIN_ORDER_TRANSITIONS, ORDER_STATUS_LABELS } from '../../lib/labels';
import { adminSetOrderStatus, getOrder } from '../../services/orders';
import type { OrderStatus, Payment } from '../../types';

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const { notify } = useToast();
  const { data: order, loading, error, reload } = useAsync(() => getOrder(id), [id]);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [review, setReview] = useState<{ payment: Payment; approve: boolean } | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!order) return <ErrorState message="Commande introuvable." />;

  const transitions = ADMIN_ORDER_TRANSITIONS[order.status] ?? [];

  const applyStatus = async () => {
    if (!nextStatus || busy) return;
    if (nextStatus === 'cancelled' && !note.trim()) return setStatusError("Un motif d'annulation est obligatoire.");
    setBusy(true);
    setStatusError(null);
    try {
      await adminSetOrderStatus(order.id, nextStatus, note);
      notify('success', `Statut : ${ORDER_STATUS_LABELS[nextStatus]}.`);
      setNextStatus('');
      setNote('');
      await reload();
    } catch (err) {
      setStatusError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title={`Commande ${order.order_number} — Administration`} noindex />
      <Link to="/admin/commandes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Commandes
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
          {order.cancel_reason && <Alert tone="warning" title="Motif d'annulation">{order.cancel_reason}</Alert>}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Paiements</h2>
            {(order.payments ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Aucun paiement déclaré.</p>
            ) : (
              <ul className="card divide-y divide-slate-100">
                {(order.payments ?? []).map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    actions={
                      p.status === 'submitted' && (
                        <>
                          <button className="btn-primary btn-sm" onClick={() => setReview({ payment: p, approve: true })}>Vérifier</button>
                          <button className="btn-secondary btn-sm" onClick={() => setReview({ payment: p, approve: false })}>Refuser</button>
                        </>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>

        </div>

        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 text-base font-semibold">Client</h2>
            <p className="font-medium">{order.customer?.full_name ?? '—'}</p>
            {order.customer?.email && <p className="mt-1 flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4" />{order.customer.email}</p>}
            {order.customer?.phone && <p className="mt-1 flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" />{order.customer.phone}</p>}
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">Faire avancer la commande</h2>
            {transitions.length === 0 ? (
              <p className="text-sm text-slate-500">
                {order.status === 'payment_verification'
                  ? 'Traitez le paiement en attente pour faire avancer la commande.'
                  : 'Aucune action manuelle disponible pour ce statut.'}
              </p>
            ) : (
              <>
                <Field label="Nouveau statut" htmlFor="next-status">
                  <select id="next-status" className="input" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus)}>
                    <option value="">— Choisir —</option>
                    {transitions.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label={nextStatus === 'cancelled' ? "Motif d'annulation" : 'Note (visible dans l\'historique)'} htmlFor="status-note" required={nextStatus === 'cancelled'}>
                  <textarea id="status-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                {statusError && <Alert tone="danger">{statusError}</Alert>}
                <button className="btn-dark w-full" onClick={applyStatus} disabled={!nextStatus || busy}>
                  {busy && <Spinner className="h-4 w-4" />} Appliquer
                </button>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-base font-semibold">Historique</h2>
            <OrderTimeline order={order} />
          </section>
        </aside>
      </div>

      <PaymentReviewDialog payment={review?.payment ?? null} approve={review?.approve ?? true} onClose={() => setReview(null)} onDone={reload} />
    </>
  );
}
