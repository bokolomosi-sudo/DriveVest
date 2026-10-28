import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Phone, Wallet } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { PasswordField } from '../ui/PhoneField';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { transactionStatus, type Tone } from '../../lib/labels';
import { formatLocalPhone, parseLocalPhone } from '../../lib/phoneAuth';
import {
  requestDeposit,
  requestWithdrawal,
  setWithdrawalAccount,
  withdrawalFee,
  type WithdrawalAccount,
} from '../../services/wallet';
import type { Transaction } from '../../types';

// --- Dépôt --------------------------------------------------------------------

export function DepositForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { settings } = useSettings();
  const { notify } = useToast();
  const methods = settings?.accepted_payment_methods ?? [];
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(methods[0] ?? '');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError('Montant invalide.');
    setBusy(true);
    try {
      await requestDeposit({ userId, amount: value, currency: CURRENCY, method, reference, proof, idempotencyKey: key.current });
      key.current = crypto.randomUUID();
      setAmount('');
      setReference('');
      setProof(null);
      notify('success', 'Dépôt déclaré. Il sera crédité après vérification.');
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      {settings?.deposit_instructions ? (
        <div className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{settings.deposit_instructions}</div>
      ) : (
        <Alert tone="warning">Les instructions de dépôt n'ont pas encore été publiées. Contactez le service client avant tout versement.</Alert>
      )}
      <Field label="Montant (FC)" htmlFor="dep-amount" required hint={settings?.min_deposit ? `Minimum : ${formatPrice(Number(settings.min_deposit), CURRENCY)}` : undefined}>
        <input id="dep-amount" type="number" min={0} step="1" inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Moyen de paiement" htmlFor="dep-method" required>
        {methods.length > 0 ? (
          <select id="dep-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input id="dep-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)} />
        )}
      </Field>
      <Field label="Référence de la transaction" htmlFor="dep-ref" required>
        <input id="dep-ref" className="input" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Field label="Justificatif" htmlFor="dep-proof" hint="Facultatif — image ou PDF, 5 Mo maximum.">
        <input id="dep-proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Déclarer le dépôt</button>
    </form>
  );
}

// --- Portefeuille de paiement (compte de retrait) -----------------------------

export function WithdrawalSetup({ onDone }: { onDone: () => void }) {
  const { notify } = useToast();
  const [holderName, setHolderName] = useState('');
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const airtelNumber = parseLocalPhone(number);
    if (holderName.trim().length < 2) return setError('Indiquez le nom du titulaire du compte Airtel Money.');
    if (!airtelNumber) return setError('Numéro Airtel Money invalide : 10 chiffres commençant par 0 (ex. 0971234567).');
    if (password.length < 4) return setError('Le mot de passe de retrait doit contenir au moins 4 caractères.');
    if (password !== confirm) return setError('Les mots de passe de retrait ne correspondent pas.');
    setBusy(true);
    try {
      await setWithdrawalAccount({ holderName, airtelNumber, password });
      notify('success', 'Portefeuille de paiement enregistré.');
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Configurer mon portefeuille de paiement</h2>
      <p className="text-sm text-slate-500">À faire une seule fois : ce compte recevra vos retraits.</p>
      <Field label="Nom du titulaire" htmlFor="wa-name" required>
        <input id="wa-name" className="input" maxLength={120} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
      </Field>
      <Field label="Numéro Airtel Money" htmlFor="wa-number" required>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/30">
          <Phone className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            id="wa-number"
            type="tel"
            inputMode="tel"
            maxLength={13}
            className="h-12 w-full bg-transparent text-base focus:outline-none sm:text-sm"
            placeholder="0971234567"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      </Field>
      <Field label="Mot de passe de retrait" htmlFor="wa-password" required hint="4 caractères minimum. Il vous sera demandé à chaque retrait.">
        <PasswordField id="wa-password" value={password} onChange={setPassword} placeholder="Mot de passe de retrait" autoComplete="new-password" />
      </Field>
      <Field label="Confirmer le mot de passe de retrait" htmlFor="wa-confirm" required>
        <PasswordField id="wa-confirm" value={confirm} onChange={setConfirm} placeholder="Confirmez le mot de passe" autoComplete="new-password" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
    </form>
  );
}

export function WithdrawalAccountCard({ account }: { account: WithdrawalAccount }) {
  return (
    <div className="card space-y-3 p-5">
      <p className="text-sm text-slate-500">Compte Airtel Money</p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Titulaire</dt><dd className="font-semibold">{account.holder_name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Numéro</dt><dd className="font-semibold">{formatLocalPhone(account.airtel_number)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Mot de passe de retrait</dt><dd className="font-semibold">Configuré</dd></div>
      </dl>
    </div>
  );
}

// --- Retrait ------------------------------------------------------------------

/** Conditions de retrait, cochées lorsqu'elles sont remplies. */
export function WithdrawalConditions({ purchased, hasAccount }: { purchased: boolean; hasAccount: boolean }) {
  const { settings } = useSettings();
  const minimum = Number(settings?.min_withdrawal ?? 0);
  const feePercent = Number(settings?.withdrawal_fee_percent ?? 0);
  const items: { label: string; met?: boolean }[] = [
    { label: 'Avoir acheté au moins un produit', met: purchased },
    ...(minimum > 0 ? [{ label: `Montant minimum : ${formatPrice(minimum, CURRENCY)}` }] : []),
    { label: 'Mobile Money et mot de passe de retrait configurés', met: hasAccount },
    ...(feePercent > 0 ? [{ label: `Frais uniques de ${feePercent} % appliqués à chaque retrait` }] : []),
    { label: 'Retrait définitif une fois soumis' },
  ];
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <p className="font-semibold text-slate-900">Conditions</p>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
        {items.map(({ label, met }) => (
          <li key={label} className="flex items-start gap-2">
            {met === undefined ? (
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
            ) : met ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-label="Rempli" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-label="Non rempli" />
            )}
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WithdrawalForm({
  account,
  available,
  purchased,
  onDone,
}: {
  account: WithdrawalAccount;
  available: number;
  purchased: boolean;
  onDone: () => void;
}) {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'amount' | 'confirm'>('amount');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  const value = Number(amount);
  const minimum = Number(settings?.min_withdrawal ?? 0);
  const feePercent = Number(settings?.withdrawal_fee_percent ?? 0);
  const fee = withdrawalFee(value, settings);
  // Vérifications en temps réel, pendant la saisie
  const liveError =
    amount === '' || !Number.isFinite(value) || value <= 0
      ? null
      : value > available
        ? `Solde insuffisant : vous ne pouvez pas retirer plus que votre solde (${formatPrice(available, CURRENCY)}).`
        : value < minimum
          ? `Le montant minimum de retrait est de ${formatPrice(minimum, CURRENCY)}.`
          : null;
  const amountValid = purchased && amount !== '' && value > 0 && !liveError;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === 'amount') {
      if (amountValid) setStep('confirm');
      return;
    }
    if (!password) return setError('Saisissez votre mot de passe de retrait.');
    setError(null);
    setBusy(true);
    try {
      await requestWithdrawal({ amount: value, password, idempotencyKey: key.current });
      key.current = crypto.randomUUID();
      setAmount('');
      setPassword('');
      setStep('amount');
      notify('success', 'Demande de retrait envoyée : traitement bancaire en cours.');
      onDone();
    } catch (err) {
      key.current = crypto.randomUUID();
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-semibold text-slate-600">
        Solde disponible : {formatPrice(available, CURRENCY)}
      </p>

      {step === 'amount' ? (
        <>
          {!purchased && (
            <Alert tone="warning">
              Achetez au moins un produit pour pouvoir retirer.{' '}
              <Link to="/produits" className="font-semibold underline">Voir les produits</Link>
            </Alert>
          )}
          <div>
            <label htmlFor="wd-amount" className="label text-base">Montant à retirer (FC)</label>
            <input
              id="wd-amount"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              disabled={!purchased}
              placeholder={minimum > 0 ? `Minimum ${formatPrice(minimum, CURRENCY)}` : 'Montant'}
              aria-invalid={Boolean(liveError)}
              className={`input h-14 rounded-2xl ${liveError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30' : ''}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {liveError && <p className="-mt-2 text-sm font-medium text-red-600" role="alert">{liveError}</p>}
          {amountValid && fee > 0 && (
            <p className="-mt-2 text-sm text-slate-500">
              Vous recevrez <strong className="text-slate-900">{formatPrice(value - fee, CURRENCY)}</strong> (frais {feePercent} % : {formatPrice(fee, CURRENCY)})
            </p>
          )}
          <button className="btn-primary h-14 w-full rounded-2xl text-base" disabled={!amountValid}>Continuer</button>
        </>
      ) : (
        <>
          <dl className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Montant demandé</dt><dd className="font-semibold">{formatPrice(value, CURRENCY)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Frais ({feePercent} %)</dt><dd>−{formatPrice(fee, CURRENCY)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base font-bold"><dt>Vous recevez</dt><dd className="text-accent-700">{formatPrice(value - fee, CURRENCY)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Vers</dt><dd className="text-right font-medium">{account.holder_name} · {formatLocalPhone(account.airtel_number)}</dd></div>
          </dl>
          <Field label="Mot de passe de retrait" htmlFor="wd-password" required>
            <PasswordField id="wd-password" value={password} onChange={setPassword} placeholder="Mot de passe de retrait" autoComplete="current-password" autoFocus />
          </Field>
          <p className="text-xs text-slate-500">Une fois soumis, le retrait ne peut plus être annulé.</p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary h-12 rounded-2xl" disabled={busy} onClick={() => { setStep('amount'); setError(null); }}>Retour</button>
            <button className="btn-primary h-12 rounded-2xl" disabled={busy || !password}>{busy && <Spinner className="h-4 w-4" />} Confirmer</button>
          </div>
        </>
      )}
    </form>
  );
}

const WITHDRAWAL_STATUS: Record<Transaction['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Traitement bancaire', tone: 'warning' },
  confirmed: { label: 'Payé', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

/** Historique des retraits : montant demandé, net reçu (après frais) et statut. */
export function WithdrawalHistory({ transactions }: { transactions: Transaction[] }) {
  const withdrawals = transactions.filter((t) => t.type === 'withdrawal');
  if (withdrawals.length === 0) return <EmptyState icon={<Wallet className="h-10 w-10" />} title="Aucun retrait" />;
  const feeOf = (id: string) =>
    transactions.filter((t) => t.type === 'fee' && t.related_transaction_id === id).reduce((sum, t) => sum + Number(t.amount), 0);
  return (
    <ul className="space-y-2">
      {withdrawals.map((t) => {
        const net = Number(t.amount);
        const status = WITHDRAWAL_STATUS[t.status];
        return (
          <li key={t.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900">{formatPrice(net + feeOf(t.id), t.currency)}</p>
              <p className="text-sm text-slate-500">Net {formatPrice(net, t.currency)} · {formatDate(t.created_at, true)}</p>
              {t.rejection_reason && <p className="mt-1 text-xs text-red-700">Motif : {t.rejection_reason}</p>}
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

// --- Historique ---------------------------------------------------------------

export function OperationsList({ operations, emptyTitle }: { operations: Transaction[]; emptyTitle: string }) {
  if (operations.length === 0) return <EmptyState icon={<Wallet className="h-10 w-10" />} title={emptyTitle} />;
  return (
    <ul className="space-y-2">
      {operations.map((t) => (
        <li key={t.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="min-w-0 text-sm">
            <p className={`text-base font-bold ${t.direction === 'credit' ? 'text-accent-700' : 'text-slate-900'}`}>
              {t.direction === 'credit' ? '+' : '−'}{formatPrice(Number(t.amount), t.currency)}
            </p>
            <p className="text-xs text-slate-500">{formatDate(t.created_at, true)}</p>
            {t.method && <p className="text-xs text-slate-500">{t.method}{t.destination ? ` · ${t.destination}` : ''}</p>}
            {t.type === 'deposit' && t.external_reference && <p className="font-mono text-xs text-slate-500">Réf. {t.external_reference}</p>}
            {t.rejection_reason && <p className="mt-1 text-xs text-red-700">Motif : {t.rejection_reason}</p>}
          </div>
          <Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge>
        </li>
      ))}
    </ul>
  );
}
