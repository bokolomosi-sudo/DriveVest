import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ProofLink } from '../orders/OrderParts';
import { PaymentName } from '../finance/PaymentLogo';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import {
  adminListWalletOperations,
  adminProcessWithdrawal,
  adminReviewDeposit,
  adminWithdrawalFees,
} from '../../services/wallet';
import type { Transaction, TransactionStatus } from '../../types';

type Kind = 'deposit' | 'withdrawal';

const STATUS: Record<TransactionStatus, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'En traitement', tone: 'warning' },
  confirmed: { label: 'Validé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`break-words text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

function OperationCard({
  tx,
  kind,
  fee,
  onAction,
}: {
  tx: Transaction;
  kind: Kind;
  fee: number;
  onAction: (approve: boolean) => void;
}) {
  const name = tx.customer?.full_name?.trim() || formatLocalPhone(tx.customer?.phone) || 'Membre';
  const amount = Number(tx.amount);
  // Destination d'un retrait : « 0971234567 — Nom du bénéficiaire »
  const [number, beneficiary] = (tx.destination ?? '').split(' — ');
  const status = STATUS[tx.status];

  return (
    <li className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold uppercase tracking-wide text-slate-900">{name}</p>
          <p className="text-sm text-slate-500">Portefeuille Drivest</p>
          <Link to={`/admin/utilisateurs/${tx.user_id}`} className="text-sm font-medium text-green-700 underline underline-offset-2">
            Voir le profil complet
          </Link>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold text-green-700 sm:text-2xl">{formatPrice(amount, tx.currency)}</p>
          {kind === 'withdrawal' && fee > 0 && (
            <p className="text-xs text-slate-500">net (demandé {formatPrice(amount + fee, tx.currency)})</p>
          )}
          {tx.status !== 'pending' && <div className="mt-1"><Badge tone={status.tone}>{status.label}</Badge></div>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4">
        <Info label="Opérateur" value={tx.method && <PaymentName name={tx.method} className="h-5 w-5" />} />
        {kind === 'withdrawal' ? (
          <>
            <Info label="Numéro" value={<span className="underline underline-offset-2">{number}</span>} mono />
            <Info label="Bénéficiaire" value={beneficiary?.toUpperCase()} />
          </>
        ) : (
          <>
            <Info label="Référence" value={tx.external_reference} mono />
            <Info label="Téléphone du membre" value={formatLocalPhone(tx.customer?.phone)} mono />
          </>
        )}
        <Info label="Soumis le" value={formatDate(tx.created_at, true)} />
        {kind === 'deposit' && tx.proof_path && (
          <div className="col-span-2"><dt className="text-xs text-slate-500">Preuve de paiement</dt><dd><ProofLink path={tx.proof_path} /></dd></div>
        )}
        {tx.external_reference && kind === 'withdrawal' && <Info label="Référence de l'envoi" value={tx.external_reference} mono />}
        {tx.rejection_reason && (
          <div className="col-span-2"><dt className="text-xs text-slate-500">Motif du rejet</dt><dd className="text-sm text-red-700">{tx.rejection_reason}</dd></div>
        )}
      </dl>

      {tx.status === 'pending' && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn h-12 rounded-2xl border border-red-200 bg-white text-red-600 hover:bg-red-50" onClick={() => onAction(false)}>
            Rejeter
          </button>
          <button className="btn h-12 rounded-2xl bg-green-700 text-base text-white hover:bg-green-800" onClick={() => onAction(true)}>
            {kind === 'withdrawal' ? 'Marquer payé' : 'Valider'}
          </button>
        </div>
      )}
    </li>
  );
}

/** Dépôts ou retraits : « En traitement » (à valider) et « Historique ». */
export function WalletOperations({ kind }: { kind: Kind }) {
  const { notify } = useToast();
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const ops = useAsync(async () => {
    const list = await adminListWalletOperations(kind, view === 'pending' ? 'pending' : 'all');
    const items = view === 'pending' ? list : list.filter((t) => t.status !== 'pending');
    const fees = kind === 'withdrawal' ? await adminWithdrawalFees(items.map((t) => t.id)) : new Map<string, number>();
    return { items, fees };
  }, [kind, view]);
  const [action, setAction] = useState<{ tx: Transaction; approve: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const label = kind === 'withdrawal' ? 'retrait' : 'dépôt';
  const pendingCount = view === 'pending' ? ops.data?.items.length ?? 0 : null;

  const submit = async () => {
    if (!action || busy) return;
    if (!action.approve && !reason.trim()) return setActionError('Le motif du rejet est obligatoire.');
    setBusy(true);
    setActionError(null);
    try {
      if (kind === 'deposit') await adminReviewDeposit(action.tx.id, action.approve, reason);
      else await adminProcessWithdrawal(action.tx.id, action.approve, reason, payout);
      notify('success', action.approve ? (kind === 'deposit' ? 'Dépôt validé et crédité.' : 'Retrait marqué payé.') : `${kind === 'deposit' ? 'Dépôt' : 'Retrait'} rejeté.`);
      setAction(null);
      setReason('');
      setPayout('');
      await ops.reload();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-1">
        <h2 className="text-xl font-bold text-slate-900">{kind === 'withdrawal' ? 'Retraits en traitement' : 'Dépôts en traitement'}</h2>
        {pendingCount !== null && !ops.loading && <p className="text-sm text-slate-500">{pendingCount} {label}(s) à traiter.</p>}
      </div>
      <div className="my-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {(['pending', 'history'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-xl py-2.5 text-sm font-semibold transition ${view === v ? 'bg-white text-green-800 shadow' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {v === 'pending' ? 'En traitement' : 'Historique'}
          </button>
        ))}
      </div>

      {ops.loading ? <LoadingState /> : ops.error ? <ErrorState message={ops.error} onRetry={ops.reload} /> : !ops.data?.items.length ? (
        <EmptyState title={view === 'pending' ? `Aucun ${label} à traiter` : `Aucun ${label} traité`} />
      ) : (
        <ul className="space-y-3">
          {ops.data.items.map((t) => (
            <OperationCard
              key={t.id}
              tx={t}
              kind={kind}
              fee={ops.data!.fees.get(t.id) ?? 0}
              onAction={(approve) => { setAction({ tx: t, approve }); setActionError(null); setReason(''); setPayout(''); }}
            />
          ))}
        </ul>
      )}

      <Modal
        open={action !== null}
        title={action?.approve ? (kind === 'deposit' ? 'Valider le dépôt' : 'Marquer le retrait payé') : `Rejeter le ${label}`}
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAction(null)} disabled={busy}>Annuler</button>
            <button className={action?.approve ? 'btn bg-green-700 text-white hover:bg-green-800' : 'btn-danger'} onClick={submit} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Confirmer
            </button>
          </>
        }
      >
        {action && (
          <div className="space-y-4 text-sm">
            <p className="text-base font-semibold">
              {formatPrice(Number(action.tx.amount), action.tx.currency ?? CURRENCY)} · {action.tx.customer?.full_name ?? formatLocalPhone(action.tx.customer?.phone)}
            </p>
            {action.approve && kind === 'deposit' && (
              <Alert tone="warning">Validez uniquement après avoir constaté la réception de l'argent sur le compte (référence {action.tx.external_reference}). Le solde du membre sera crédité.</Alert>
            )}
            {action.approve && kind === 'withdrawal' && (
              <>
                <p>Envoyer vers : <strong>{action.tx.destination}</strong></p>
                <Alert tone="warning">Marquez payé seulement après avoir envoyé l'argent sur ce numéro {action.tx.method ?? 'Mobile Money'}.</Alert>
                <Field label="Référence de l'envoi (facultatif)" htmlFor="payout">
                  <input id="payout" className="input" value={payout} onChange={(e) => setPayout(e.target.value)} />
                </Field>
              </>
            )}
            {!action.approve && (
              <Field label="Motif du rejet" htmlFor="tx-reason" required hint={kind === 'withdrawal' ? 'Le membre verra ce motif. Le montant redevient disponible sur son solde.' : 'Le membre verra ce motif. Rien ne sera crédité.'}>
                <textarea id="tx-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
            {actionError && <Alert tone="danger">{actionError}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}
