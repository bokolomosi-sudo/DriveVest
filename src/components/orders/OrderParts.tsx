import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '../../lib/labels';
import { getProofUrl } from '../../services/orders';
import type { Order, OrderStatus, Payment } from '../../types';
import { Badge } from '../ui/Badge';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function paidAmount(order: Order): number {
  return (order.payments ?? []).filter((p) => p.status === 'verified').reduce((sum, p) => sum + Number(p.amount), 0);
}

export function OrderSummary({ order }: { order: Order }) {
  const paid = paidAmount(order);
  return (
    <div className="card divide-y divide-slate-100">
      {(order.items ?? []).map((item) => (
        <div key={item.id} className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="font-semibold">{item.vehicle_label}</p>
            <p className="text-xs text-slate-500">Quantité : {item.quantity}</p>
          </div>
          <p className="font-semibold">{formatPrice(Number(item.unit_price), item.currency)}</p>
        </div>
      ))}
      <dl className="space-y-2 p-4 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Montant de la commande</dt><dd className="font-semibold">{formatPrice(Number(order.total_amount), order.currency)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Paiements vérifiés</dt><dd className="font-semibold text-accent-700">{formatPrice(paid, order.currency)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Reste à payer</dt><dd className="font-semibold">{formatPrice(Math.max(0, Number(order.total_amount) - paid), order.currency)}</dd></div>
      </dl>
      {(order.delivery_address || order.customer_note) && (
        <div className="space-y-2 p-4 text-sm">
          {order.delivery_address && <p><span className="text-slate-500">Livraison : </span>{order.delivery_address}</p>}
          {order.customer_note && <p className="whitespace-pre-line"><span className="text-slate-500">Message : </span>{order.customer_note}</p>}
        </div>
      )}
    </div>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  const history = order.history ?? [];
  if (history.length === 0) return null;
  return (
    <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
      {history.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-accent-500 ring-2 ring-accent-100" />
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={h.to_status} />
            <span className="text-xs text-slate-500">{formatDate(h.created_at, true)}</span>
          </div>
          {h.note && <p className="mt-1 text-sm text-slate-600">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function ProofLink({ path }: { path: string }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const url = await getProofUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={open} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-night-700 hover:text-night-900">
      <FileText className="h-3.5 w-3.5" /> Voir le justificatif
    </button>
  );
}

export function PaymentRow({ payment, actions }: { payment: Payment; actions?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="text-sm">
        <p className="font-semibold">{formatPrice(Number(payment.amount), payment.currency)} · {payment.method}</p>
        <p className="text-xs text-slate-500">Réf. {payment.reference} · déclaré le {formatDate(payment.created_at, true)}</p>
        {payment.rejection_reason && <p className="mt-1 text-xs text-red-700">Motif : {payment.rejection_reason}</p>}
        {payment.proof_path && <div className="mt-1"><ProofLink path={payment.proof_path} /></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PAYMENT_STATUS_TONES[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
        {actions}
      </div>
    </li>
  );
}
