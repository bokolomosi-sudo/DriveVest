import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Phone, Wallet } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { PasswordField } from '../ui/PhoneField';
import { PaymentLogo, PaymentName } from './PaymentLogo';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { transactionStatus, type Tone } from '../../lib/labels';
import { formatLocalPhone, parseLocalPhone } from '../../lib/phoneAuth';
import {
  changeWithdrawalPassword,
  listDepositChannels,
  listWithdrawalNetworks,
  requestDeposit,
  requestWithdrawal,
  setWithdrawalAccount,
  withdrawalFee,
  type WithdrawalAccount,
} from '../../services/wallet';
import type { Transaction } from '../../types';

// --- Dépôt --------------------------------------------------------------------

function CopyButton({ value, label, solid }: { value: string; label: string; solid?: boolean }) {
  const { notify } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify('success', `${label} copié.`);
    } catch {
      notify('error', 'Copie impossible : sélectionnez le texte manuellement.');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`btn shrink-0 rounded-xl px-4 py-2 ${solid ? 'bg-accent-700 text-white hover:bg-accent-800' : 'border border-accent-700 bg-white text-accent-800 hover:bg-accent-50'}`}
    >
      Copier
    </button>
  );
}

export function DepositForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { settings } = useSettings();
  const { notify } = useToast();
  const channels = useAsync(listDepositChannels, []);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  const list = channels.data ?? [];
  const channel = list.find((c) => c.id === channelId) ?? list[0] ?? null;
  const value = Number(amount);
  const minimum = Number(settings?.min_deposit ?? 0);
  const validAmount = amount !== '' && Number.isFinite(value) && value > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !channel) return;
    setError(null);
    if (!validAmount) return setError('Indiquez le montant de votre dépôt.');
    if (value < minimum) return setError(`Le dépôt minimum est de ${formatPrice(minimum, CURRENCY)}.`);
    if (reference.trim().length < 3) return setError('Indiquez la référence de la transaction reçue par SMS.');
    setBusy(true);
    try {
      // Pas de capture d'écran : l'admin vérifie le paiement sur le relevé du compte de dépôt
      await requestDeposit({ userId, amount: value, currency: CURRENCY, method: channel.name, reference: reference.trim(), idempotencyKey: key.current });
      key.current = crypto.randomUUID();
      setAmount('');
      setReference('');
      notify('success', 'Dépôt envoyé. Il sera crédité après vérification.');
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (channels.loading) return <LoadingState />;
  if (channels.error) return <ErrorState message={channels.error} onRetry={channels.reload} />;
  if (!channel) {
    return <Alert tone="warning">Aucun compte de dépôt n'est disponible pour le moment. Contactez le service client.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
      {/* Moyens de paiement */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Moyen de paiement">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === channel.id}
            onClick={() => setChannelId(c.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${c.id === channel.id ? 'bg-white text-accent-800 shadow' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <PaymentLogo name={c.name} className="h-6 w-6" />
            {c.name}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="dep-amount" className="label text-base">Montant (FC)</label>
        <input
          id="dep-amount"
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          className="input h-14 rounded-2xl"
          placeholder={minimum > 0 ? `Ex : 20000 (minimum ${formatPrice(minimum, CURRENCY)})` : 'Ex : 20000'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* Instructions de paiement */}
      <div className="space-y-4 rounded-2xl border border-accent-200 bg-accent-50/60 p-4">
        <p className="flex items-center gap-2 text-base font-bold text-accent-900">
          <PaymentLogo name={channel.name} className="h-7 w-7" /> Effectuez le paiement vers {channel.name}
        </p>
        <div>
          <p className="text-sm text-slate-500">Montant total payable</p>
          <p className="text-2xl font-extrabold text-accent-900">{validAmount ? formatPrice(value, CURRENCY) : '— FC'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Compte {channel.name}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="break-all text-2xl font-extrabold tracking-wide text-accent-900">{channel.account_number}</p>
            <CopyButton value={channel.account_number} label="Numéro" solid />
          </div>
          {channel.account_name && <p className="text-sm text-slate-600">{channel.account_name}</p>}
        </div>
        {channel.ussd_code && (
          <div>
            <p className="text-sm text-slate-500">Code / procédure rapide</p>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xl font-bold text-accent-900">{channel.ussd_code}</p>
              <CopyButton value={channel.ussd_code} label="Code" />
            </div>
          </div>
        )}
        {(channel.instructions || settings?.deposit_instructions) && (
          <div>
            <p className="text-sm text-slate-500">Guide de paiement</p>
            <p className="whitespace-pre-line text-sm text-slate-700">{channel.instructions || settings?.deposit_instructions}</p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="dep-ref" className="label text-base">Référence de la transaction</label>
        <input
          id="dep-ref"
          className="input h-14 rounded-2xl"
          maxLength={120}
          placeholder="Ex : MP240912.1234.A56789"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn h-14 w-full rounded-2xl bg-accent-700 text-base text-white hover:bg-accent-800" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />} Confirmer le dépôt
      </button>
    </form>
  );
}

// --- Portefeuille de paiement (compte de retrait) -----------------------------

export function WithdrawalSetup({ onDone }: { onDone: () => void }) {
  const { notify } = useToast();
  const networks = useAsync(listWithdrawalNetworks, []);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const network = networkName ?? networks.data?.[0]?.name ?? null;
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
    const phone = parseLocalPhone(number);
    if (!network) return setError('Choisissez votre réseau.');
    if (holderName.trim().length < 2) return setError(`Indiquez le nom du titulaire du compte ${network}.`);
    if (!phone) return setError(`Numéro ${network} invalide : 10 chiffres commençant par 0 (ex. 0971234567).`);
    if (password.length < 4) return setError('Le mot de passe de retrait doit contenir au moins 4 caractères.');
    if (password !== confirm) return setError('Les mots de passe de retrait ne correspondent pas.');
    setBusy(true);
    try {
      await setWithdrawalAccount({ network, holderName, number: phone, password });
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
      {networks.loading ? <LoadingState /> : networks.error ? <ErrorState message={networks.error} onRetry={networks.reload} /> : !networks.data?.length ? (
        <Alert tone="warning">Aucun réseau de retrait n'est disponible pour le moment. Contactez le service client.</Alert>
      ) : (
        <div>
          <p className="label">Réseau</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Réseau de retrait">
            {networks.data.map((n) => (
              <button
                key={n.id}
                type="button"
                role="radio"
                aria-checked={network === n.name}
                onClick={() => setNetworkName(n.name)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${network === n.name ? 'border-accent-600 bg-accent-50 text-accent-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <PaymentLogo name={n.name} className="h-5 w-5" /> {n.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label="Nom du titulaire" htmlFor="wa-name" required>
        <input id="wa-name" className="input" maxLength={120} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
      </Field>
      <Field label={`Numéro ${network ?? 'Mobile Money'}`} htmlFor="wa-number" required>
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
      <p className="text-sm text-slate-500"><PaymentName name={account.network} className="h-5 w-5" /></p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Titulaire</dt><dd className="font-semibold">{account.holder_name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Numéro</dt><dd className="font-semibold">{formatLocalPhone(account.airtel_number)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Mot de passe de retrait</dt><dd className="font-semibold">Configuré</dd></div>
      </dl>
    </div>
  );
}

export function ChangeWithdrawalPasswordForm() {
  const { notify } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!oldPassword) return setError('Indiquez votre ancien mot de passe de retrait.');
    if (password.length < 4) return setError('Le nouveau mot de passe de retrait doit contenir au moins 4 caractères.');
    if (password !== confirm) return setError('Les nouveaux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await changeWithdrawalPassword(oldPassword, password);
      setOldPassword('');
      setPassword('');
      setConfirm('');
      notify('success', 'Mot de passe de retrait modifié.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Changer mon mot de passe de retrait</h2>
      <Field label="Ancien mot de passe de retrait" htmlFor="cw-old" required>
        <PasswordField id="cw-old" value={oldPassword} onChange={setOldPassword} placeholder="Ancien mot de passe" autoComplete="current-password" />
      </Field>
      <Field label="Nouveau mot de passe de retrait" htmlFor="cw-new" required hint="4 caractères minimum.">
        <PasswordField id="cw-new" value={password} onChange={setPassword} placeholder="Nouveau mot de passe" autoComplete="new-password" />
      </Field>
      <Field label="Confirmer le nouveau mot de passe" htmlFor="cw-confirm" required>
        <PasswordField id="cw-confirm" value={confirm} onChange={setConfirm} placeholder="Confirmez le nouveau mot de passe" autoComplete="new-password" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Changer le mot de passe</button>
    </form>
  );
}

// --- Retrait ------------------------------------------------------------------

/** Conditions de retrait, cochées lorsqu'elles sont remplies. */
export function WithdrawalConditions({ purchased, deposited, hasAccount }: { purchased: boolean; deposited: boolean; hasAccount: boolean }) {
  const { settings } = useSettings();
  const minimum = Number(settings?.min_withdrawal ?? 0);
  const feePercent = Number(settings?.withdrawal_fee_percent ?? 0);
  const items: { label: string; met?: boolean }[] = [
    { label: 'Avoir fait au moins un dépôt validé', met: deposited },
    { label: 'Avoir acheté au moins un produit Prestige (compte certifié)', met: purchased },
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
  deposited,
  onDone,
}: {
  account: WithdrawalAccount;
  available: number;
  purchased: boolean;
  deposited: boolean;
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
  const allowed = purchased && deposited;
  const amountValid = allowed && amount !== '' && value > 0 && !liveError;

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
          {!deposited ? (
            <Alert tone="warning">
              Faites au moins un dépôt validé par l&apos;administration pour pouvoir retirer.{' '}
              <Link to="/compte/depot" className="font-semibold underline">Faire un dépôt</Link>
            </Alert>
          ) : !purchased && (
            <Alert tone="warning">
              Pour effectuer un retrait, vous devez avoir acheté au moins un produit Prestige.{' '}
              <Link to="/produits" className="font-semibold underline">Voir les produits Prestige</Link>
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
              disabled={!allowed}
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
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Vers</dt><dd className="text-right font-medium"><PaymentName name={account.network} className="h-4 w-4" /> · {account.holder_name} · {formatLocalPhone(account.airtel_number)}</dd></div>
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
            {t.method && <p className="text-xs text-slate-500"><PaymentName name={t.method} className="h-4 w-4" />{t.destination ? ` · ${t.destination}` : ''}</p>}
            {t.type === 'deposit' && t.external_reference && <p className="font-mono text-xs text-slate-500">Réf. {t.external_reference}</p>}
            {t.rejection_reason && <p className="mt-1 text-xs text-red-700">Motif : {t.rejection_reason}</p>}
          </div>
          <Badge tone={transactionStatus(t).tone}>{transactionStatus(t).label}</Badge>
        </li>
      ))}
    </ul>
  );
}
