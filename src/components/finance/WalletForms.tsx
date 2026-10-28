import { useRef, useState, type FormEvent } from 'react';
import { Phone, Wallet } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { PasswordField } from '../ui/PhoneField';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { transactionStatus } from '../../lib/labels';
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
            className="h-12 w-full bg-transparent text-sm focus:outline-none"
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

export function WithdrawalForm({ account, available, onDone }: { account: WithdrawalAccount; available: number; onDone: () => void }) {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  const value = Number(amount);
  const minimum = Number(settings?.min_withdrawal ?? 0);
  const fee = withdrawalFee(value, settings);
  // Vérifications en temps réel, pendant la saisie
  const liveError =
    amount === '' || !Number.isFinite(value) || value <= 0
      ? null
      : value + fee > available
        ? `Solde insuffisant : vous ne pouvez pas retirer plus que votre solde (${formatPrice(available, CURRENCY)}).`
        : value < minimum
          ? `Le montant minimum de retrait est de ${formatPrice(minimum, CURRENCY)}.`
          : null;
  const canSubmit = amount !== '' && value > 0 && !liveError && password.length > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await requestWithdrawal({ amount: value, password, idempotencyKey: key.current });
      key.current = crypto.randomUUID();
      setAmount('');
      setPassword('');
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
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-slate-500">Vers Airtel Money</p>
        <p className="font-semibold">{account.holder_name} · {formatLocalPhone(account.airtel_number)}</p>
      </div>
      <Field label="Montant (FC)" htmlFor="wd-amount" required hint={minimum > 0 ? `Minimum : ${formatPrice(minimum, CURRENCY)}` : undefined}>
        <input
          id="wd-amount"
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          aria-invalid={Boolean(liveError)}
          className={`input ${liveError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30' : ''}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {liveError && <p className="-mt-2 text-sm font-medium text-red-600" role="alert">{liveError}</p>}
      {value > 0 && fee > 0 && !liveError && (
        <dl className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Frais de retrait</dt><dd>{formatPrice(fee, CURRENCY)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total débité</dt><dd>{formatPrice(value + fee, CURRENCY)}</dd></div>
        </dl>
      )}
      <Field label="Mot de passe de retrait" htmlFor="wd-password" required>
        <PasswordField id="wd-password" value={password} onChange={setPassword} placeholder="Mot de passe de retrait" autoComplete="current-password" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-dark w-full" disabled={busy || !canSubmit}>{busy && <Spinner className="h-4 w-4" />} Soumettre le retrait</button>
    </form>
  );
}

// --- Historique ---------------------------------------------------------------

export function OperationsList({ operations, emptyTitle, onCancel }: { operations: Transaction[]; emptyTitle: string; onCancel?: (id: string) => void }) {
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
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge>
            {onCancel && t.type === 'withdrawal' && t.status === 'pending' && (
              <button className="btn-ghost btn-sm" onClick={() => onCancel(t.id)}>Annuler</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
