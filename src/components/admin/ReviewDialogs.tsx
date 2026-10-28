import { useState } from 'react';
import { Alert, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { formatPrice } from '../../lib/format';
import { adminReviewPayment } from '../../services/orders';
import type { Payment } from '../../types';

/** Validation / refus d'un paiement déclaré, avec motif obligatoire en cas de refus. */
export function PaymentReviewDialog({ payment, approve, onClose, onDone }: { payment: Payment | null; approve: boolean; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!payment || busy) return;
    if (!approve && !reason.trim()) return setError('Un motif de refus est obligatoire.');
    setBusy(true);
    setError(null);
    try {
      await adminReviewPayment(payment.id, approve, reason);
      notify('success', approve ? 'Paiement vérifié.' : 'Paiement refusé.');
      setReason('');
      onDone();
      onClose();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={payment !== null}
      title={approve ? 'Confirmer la réception du paiement' : 'Refuser le paiement'}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className={approve ? 'btn-primary' : 'btn-danger'} onClick={submit} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} {approve ? 'Confirmer' : 'Refuser'}
          </button>
        </>
      }
    >
      {payment && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold">{formatPrice(Number(payment.amount), payment.currency)} · {payment.method}</p>
            <p className="text-slate-600">Référence : {payment.reference}</p>
          </div>
          {approve ? (
            <Alert tone="warning">
              Ne confirmez qu'après avoir constaté la réception effective des fonds sur le compte de Drivest
              (relevé, opérateur…). Une capture d'écran du client ne suffit pas. Cette action est journalisée.
            </Alert>
          ) : (
            <Field label="Motif du refus" htmlFor="reject-reason" required>
              <textarea id="reject-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
