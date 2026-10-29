import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, MapPin, Phone, ShieldCheck, Unlock, Wallet } from 'lucide-react';
import { OperationsList } from '../../components/finance/WalletForms';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '../../lib/labels';
import { formatLocalPhone } from '../../lib/phoneAuth';
import {
  adminGetUser,
  adminResetUserPassword,
  adminResetWithdrawalAccount,
  adminSetUserBlocked,
  adminUserOverview,
} from '../../services/admin';
import { listMyOrders } from '../../services/orders';
import { adminWalletAdjustment, listMyWalletTransactions } from '../../services/wallet';

type Action = 'password' | 'withdrawal' | 'block' | 'adjust' | null;

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 break-words text-base font-bold ${tone ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Mot de passe provisoire facile à dicter par téléphone : 6 chiffres. */
function randomPassword(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

export default function AdminUserDetailPage() {
  const { id = '' } = useParams();
  const { user: me } = useAuth();
  const { notify } = useToast();
  const member = useAsync(() => adminGetUser(id), [id]);
  const overview = useAsync(() => adminUserOverview(id), [id]);
  const history = useAsync(() => listMyWalletTransactions(id), [id]);
  const orders = useAsync(() => listMyOrders(id), [id]);

  const [action, setAction] = useState<Action>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (a: Action) => {
    setAction(a);
    setError(null);
    setReason('');
    setAmount('');
    setPassword(a === 'password' ? randomPassword() : '');
  };

  // Lien « Créditer / Débiter » de la liste des membres : la fenêtre s'ouvre directement
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('action') === 'solde') {
      open('adjust');
      setParams({}, { replace: true });
    }
    // open est recréée à chaque rendu ; seul le paramètre compte ici
  }, [params, setParams]);

  const reloadAll = async () => {
    await Promise.all([member.reload(), overview.reload(), history.reload()]);
  };

  const submit = async () => {
    const u = member.data;
    if (!u || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (action === 'password') {
        if (password.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
        await adminResetUserPassword(u.id, password);
        notify('success', `Mot de passe réinitialisé. Communiquez-le au membre : ${password}`);
      } else if (action === 'withdrawal') {
        await adminResetWithdrawalAccount(u.id, reason);
        notify('success', 'Portefeuille de retrait réinitialisé.');
      } else if (action === 'block') {
        if (!reason.trim()) throw new Error('Un motif est obligatoire.');
        await adminSetUserBlocked(u.id, !u.is_blocked, reason);
        notify('success', u.is_blocked ? 'Compte débloqué.' : 'Compte bloqué.');
      } else if (action === 'adjust') {
        await adminWalletAdjustment({ userId: u.id, amount: Number(amount), currency: CURRENCY, direction, reason });
        notify('success', 'Solde ajusté.');
      }
      setAction(null);
      await reloadAll();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (member.loading) return <LoadingState />;
  if (member.error) return <ErrorState message={member.error} onRetry={member.reload} />;
  const u = member.data;
  if (!u) return <EmptyState title="Utilisateur introuvable" />;
  const o = overview.data;
  const isMe = u.id === me?.id;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageMeta title={`${u.full_name ?? 'Membre'} — Administration`} noindex />
      <Link to="/admin/utilisateurs" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Utilisateurs
      </Link>

      {/* Identité */}
      <section className="rounded-3xl bg-gradient-to-br from-night-800 to-night-950 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-xl font-extrabold uppercase tracking-wide">{u.full_name || 'Nom non renseigné'}</p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-night-100"><Phone className="h-4 w-4" /> {formatLocalPhone(u.phone)}</p>
            {(u.city || u.province) && (
              <p className="flex items-center gap-1.5 text-sm text-night-200"><MapPin className="h-4 w-4" /> {[u.city, u.province].filter(Boolean).join(', ')}</p>
            )}
            <p className="mt-1 text-sm text-night-200">Inscrit le {formatDate(u.created_at)} · Code {u.referral_code}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {u.is_blocked ? <Badge tone="danger">Bloqué</Badge> : <Badge tone="success">Actif</Badge>}
            {u.roles.includes('admin') || u.roles.includes('super_admin') ? <Badge tone="info">Administrateur</Badge> : null}
          </div>
        </div>
        {u.is_blocked && u.blocked_reason && <p className="mt-3 rounded-xl bg-red-500/20 p-2 text-sm">Motif du blocage : {u.blocked_reason}</p>}
        {o?.sponsor && (
          <p className="mt-3 text-sm text-night-200">
            Parrain :{' '}
            <Link to={`/admin/utilisateurs/${o.sponsor.id}`} className="font-semibold text-white underline underline-offset-2">
              {o.sponsor.full_name || 'Membre'} · {o.sponsor.phone}
            </Link>
          </p>
        )}
      </section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button className="btn-secondary h-auto flex-col gap-1 rounded-2xl py-3" onClick={() => open('password')}>
          <KeyRound className="h-5 w-5" /> <span className="text-xs">Réinitialiser le mot de passe</span>
        </button>
        <button className="btn-secondary h-auto flex-col gap-1 rounded-2xl py-3" onClick={() => open('adjust')}>
          <Wallet className="h-5 w-5" /> <span className="text-xs">Créditer / Débiter</span>
        </button>
        <button className="btn-secondary h-auto flex-col gap-1 rounded-2xl py-3" onClick={() => open('withdrawal')} disabled={!o?.withdrawal_account}>
          <ShieldCheck className="h-5 w-5" /> <span className="text-xs">Réinitialiser le retrait</span>
        </button>
        <button
          className={`btn h-auto flex-col gap-1 rounded-2xl py-3 ${u.is_blocked ? 'bg-green-700 text-white hover:bg-green-800' : 'border border-red-200 bg-white text-red-600 hover:bg-red-50'}`}
          onClick={() => open('block')}
          disabled={isMe}
        >
          {u.is_blocked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          <span className="text-xs">{u.is_blocked ? 'Débloquer le compte' : 'Bloquer le compte'}</span>
        </button>
      </div>

      {/* Chiffres */}
      {overview.loading ? <LoadingState /> : overview.error ? <ErrorState message={overview.error} onRetry={overview.reload} /> : o && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Solde disponible" value={formatPrice(o.balance, CURRENCY)} tone="text-green-700" />
          <Stat label="Dépôts validés" value={formatPrice(o.total_deposits, CURRENCY)} />
          <Stat label="Retraits payés" value={formatPrice(o.total_withdrawals, CURRENCY)} />
          <Stat label="Commissions" value={formatPrice(o.total_commissions, CURRENCY)} />
          <Stat label="Récompenses d'équipe" value={formatPrice(o.total_rewards, CURRENCY)} />
          <Stat label="Équipe niveau 1" value={String(o.team_level1)} />
          <Stat label="Équipe niveau 2" value={String(o.team_level2)} />
          <Stat label="Invités ayant investi" value={String(o.invested_invitees)} />
        </div>
      )}

      {/* Portefeuille de retrait */}
      <Section title="Portefeuille de retrait">
        {o?.withdrawal_account ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">Bénéficiaire</dt><dd className="font-semibold">{o.withdrawal_account.holder_name}</dd></div>
            <div><dt className="text-xs text-slate-500">Numéro {o.withdrawal_account.network}</dt><dd className="font-mono font-semibold">{o.withdrawal_account.airtel_number}</dd></div>
            <div><dt className="text-xs text-slate-500">Configuré le</dt><dd>{formatDate(o.withdrawal_account.created_at)}</dd></div>
            <div>
              <dt className="text-xs text-slate-500">Mot de passe de retrait</dt>
              <dd>
                {o.withdrawal_account.locked_until && new Date(o.withdrawal_account.locked_until) > new Date()
                  ? <Badge tone="danger">Bloqué (trop d'essais)</Badge>
                  : <Badge tone="success">Configuré</Badge>}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Pas encore configuré.</p>
        )}
      </Section>

      {/* Produits */}
      <Section title={`Produits achetés${orders.data ? ` (${orders.data.length})` : ''}`}>
        {orders.loading ? <LoadingState /> : orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : !orders.data?.length ? (
          <p className="text-sm text-slate-500">Aucun achat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.data.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link to={`/admin/commandes/${order.id}`} className="font-medium text-slate-900 hover:underline">
                    {order.items?.map((i) => `${i.vehicle?.brand ?? ''} ${i.vehicle?.model ?? ''}`.trim()).join(', ') || order.order_number}
                  </Link>
                  <p className="text-xs text-slate-500">{formatDate(order.created_at, true)} · {formatPrice(Number(order.total_amount), order.currency)}</p>
                </div>
                <Badge tone={ORDER_STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Opérations */}
      <Section title="Historique du portefeuille">
        {history.loading ? <LoadingState /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : (
          <OperationsList operations={history.data ?? []} emptyTitle="Aucune opération" />
        )}
      </Section>

      <Modal
        open={action !== null}
        title={
          action === 'password' ? 'Réinitialiser le mot de passe'
            : action === 'withdrawal' ? 'Réinitialiser le portefeuille de retrait'
              : action === 'adjust' ? 'Créditer ou débiter le compte'
                : u.is_blocked ? 'Débloquer le compte' : 'Bloquer le compte'
        }
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAction(null)} disabled={busy}>Annuler</button>
            <button className={action === 'block' && !u.is_blocked ? 'btn-danger' : 'btn bg-green-700 text-white hover:bg-green-800'} onClick={submit} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Confirmer
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {action === 'password' && (
            <>
              <p>Le membre a oublié son mot de passe : définissez un mot de passe provisoire et communiquez-le-lui. Ses sessions ouvertes seront fermées.</p>
              <Field label="Nouveau mot de passe" htmlFor="new-password" hint="6 caractères minimum. Le membre pourra le changer dans Sécurité.">
                <input id="new-password" className="input font-mono text-lg tracking-widest" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </>
          )}
          {action === 'withdrawal' && (
            <>
              <p>Le réseau, le numéro et le mot de passe de retrait de ce membre seront supprimés. Il devra les configurer de nouveau avant son prochain retrait.</p>
              <Field label="Motif" htmlFor="wd-reason" required>
                <input id="wd-reason" className="input" placeholder="Ex. : mot de passe de retrait oublié" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </>
          )}
          {action === 'adjust' && (
            <>
              {o && <p>Solde actuel : <strong>{formatPrice(o.balance, CURRENCY)}</strong>. Un débit ne peut pas dépasser ce solde.</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sens" htmlFor="adj-dir">
                  <select id="adj-dir" className="input" value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}>
                    <option value="credit">Créditer</option>
                    <option value="debit">Débiter</option>
                  </select>
                </Field>
                <Field label="Montant (FC)" htmlFor="adj-amount" required>
                  <input id="adj-amount" type="number" min={0} step="1" inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
              </div>
              <Field label="Motif" htmlFor="adj-reason" required hint="Visible par le membre et conservé dans le journal d'audit.">
                <textarea id="adj-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </>
          )}
          {action === 'block' && (
            <Field label={u.is_blocked ? 'Motif du déblocage' : 'Motif du blocage'} htmlFor="block-reason" required>
              <textarea id="block-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
