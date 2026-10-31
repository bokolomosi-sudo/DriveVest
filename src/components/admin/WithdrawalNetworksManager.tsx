import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../ui/Feedback';
import { Modal } from '../ui/Modal';
import { WalletRulesCard } from './WalletRulesCard';
import { PaymentLogo } from '../finance/PaymentLogo';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { adminDeleteWithdrawalNetwork, adminListWithdrawalNetworks, adminSaveWithdrawalNetwork } from '../../services/wallet';
import type { WithdrawalNetwork } from '../../types';
import { SuperAdminLock } from './SuperAdminLock';

/** Réseaux sur lesquels les membres peuvent recevoir leurs retraits. */
export function WithdrawalNetworksManager() {
  const { notify } = useToast();
  const networks = useAsync(adminListWithdrawalNetworks, []);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<WithdrawalNetwork | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = name.trim();
    if (value.length < 2) return setError('Indiquez le nom du réseau (ex. Orange Money).');
    setBusy(true);
    setError(null);
    try {
      await adminSaveWithdrawalNetwork({ name: value, is_active: true, sort_order: networks.data?.length ?? 0 });
      setName('');
      notify('success', `${value} ajouté : les membres peuvent le choisir pour leurs retraits.`);
      await networks.reload();
    } catch (err) {
      setError(toErrorMessage(err).includes('existe déjà') ? 'Ce réseau existe déjà.' : toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n: WithdrawalNetwork) => {
    try {
      await adminSaveWithdrawalNetwork({ name: n.name, is_active: !n.is_active, sort_order: n.sort_order }, n.id);
      notify('success', n.is_active ? `${n.name} masqué pour les nouveaux portefeuilles.` : `${n.name} de nouveau proposé.`);
      await networks.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await adminDeleteWithdrawalNetwork(deleting.id);
      notify('success', 'Réseau supprimé.');
      setDeleting(null);
      await networks.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SuperAdminLock>
      <WalletRulesCard title="Règles du retrait" keys={['min_withdrawal', 'withdrawal_fee_percent']} />
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">Réseaux de retrait</h2>
        <p className="text-sm text-slate-500">
          Réseaux proposés aux membres quand ils configurent leur portefeuille de retrait. Masquer un réseau ne touche pas les portefeuilles déjà configurés.
        </p>
      </div>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input className="input" placeholder="Ex. : Orange Money, M-Pesa" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du réseau" />
        <button className="btn shrink-0 bg-accent-700 text-white hover:bg-accent-800" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Ajouter
        </button>
      </form>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}

      {networks.loading ? <LoadingState /> : networks.error ? <ErrorState message={networks.error} onRetry={networks.reload} /> : !networks.data?.length ? (
        <EmptyState title="Aucun réseau" description="Ajoutez au moins un réseau : sans réseau, les membres ne peuvent pas configurer leur retrait." />
      ) : (
        <ul className="space-y-2">
          {networks.data.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex min-w-[10rem] flex-1 items-center gap-3">
                <PaymentLogo name={n.name} className="h-7 w-7" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{n.name}</p>
                  <Badge tone={n.is_active ? 'success' : 'neutral'}>{n.is_active ? 'Proposé' : 'Masqué'}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-secondary btn-sm" onClick={() => toggle(n)}>{n.is_active ? 'Masquer' : 'Proposer'}</button>
                <button className="btn-ghost btn-sm text-red-600" aria-label={`Supprimer ${n.name}`} onClick={() => setDeleting(n)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={deleting !== null}
        title="Supprimer ce réseau ?"
        onClose={() => !busy && setDeleting(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)} disabled={busy}>Annuler</button>
            <button className="btn-danger" onClick={remove} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Supprimer</button>
          </>
        }
      >
        <p className="text-sm">
          {deleting?.name} ne sera plus proposé aux nouveaux portefeuilles. Les membres déjà configurés sur ce réseau continuent de recevoir leurs retraits dessus.
        </p>
      </Modal>
    </SuperAdminLock>
  );
}
