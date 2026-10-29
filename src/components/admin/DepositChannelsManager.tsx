import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { WalletRulesCard } from './WalletRulesCard';
import { PaymentName } from '../finance/PaymentLogo';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { adminDeleteDepositChannel, adminListDepositChannels, adminSaveDepositChannel, type DepositChannelInput } from '../../services/wallet';
import type { DepositChannel } from '../../types';

const EMPTY: DepositChannelInput = {
  name: 'Airtel Money',
  account_number: '',
  account_name: '',
  ussd_code: '*501#',
  instructions: '',
  is_active: true,
  sort_order: 0,
};

/** Comptes affichés sur la page Dépôt des membres (numéro, nom, code USSD, guide). */
export function DepositChannelsManager() {
  const { notify } = useToast();
  const channels = useAsync(adminListDepositChannels, []);
  const [editing, setEditing] = useState<{ id?: string; form: DepositChannelInput } | null>(null);
  const [deleting, setDeleting] = useState<DepositChannel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof DepositChannelInput, value: string | boolean | number) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || busy) return;
    const f = editing.form;
    if (f.name.trim().length < 2) return setError('Indiquez le nom du moyen de paiement.');
    if (f.account_number.trim().length < 3) return setError('Indiquez le numéro du compte.');
    setBusy(true);
    setError(null);
    try {
      await adminSaveDepositChannel(
        {
          ...f,
          name: f.name.trim(),
          account_number: f.account_number.trim(),
          account_name: f.account_name?.trim() || null,
          ussd_code: f.ussd_code?.trim() || null,
          instructions: f.instructions?.trim() || null,
        },
        editing.id,
      );
      notify('success', 'Compte de dépôt enregistré.');
      setEditing(null);
      await channels.reload();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await adminDeleteDepositChannel(deleting.id);
      notify('success', 'Compte de dépôt supprimé.');
      setDeleting(null);
      await channels.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <WalletRulesCard title="Règles du dépôt" keys={['min_deposit']} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Comptes de dépôt</h2>
          <p className="text-sm text-slate-500">Numéros affichés aux membres sur la page Dépôt.</p>
        </div>
        <button className="btn bg-green-700 text-white hover:bg-green-800" onClick={() => { setEditing({ form: EMPTY }); setError(null); }}>
          <Plus className="h-4 w-4" /> Ajouter un compte
        </button>
      </div>

      {channels.loading ? <LoadingState /> : channels.error ? <ErrorState message={channels.error} onRetry={channels.reload} /> : !channels.data?.length ? (
        <EmptyState title="Aucun compte de dépôt" description="Ajoutez votre numéro Airtel Money : les membres ne peuvent pas déposer sans compte." />
      ) : (
        <ul className="space-y-3">
          {channels.data.map((c) => (
            <li key={c.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900"><PaymentName name={c.name} className="h-6 w-6" /></p>
                    <Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Visible' : 'Masqué'}</Badge>
                  </div>
                  <p className="font-mono text-lg font-bold text-green-800">{c.account_number}</p>
                  {c.account_name && <p className="text-sm text-slate-600">{c.account_name}</p>}
                  {c.ussd_code && <p className="font-mono text-sm text-slate-500">{c.ussd_code}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost px-3" aria-label={`Modifier ${c.name}`} onClick={() => { setEditing({ id: c.id, form: { ...c } }); setError(null); }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost px-3 text-red-600" aria-label={`Supprimer ${c.name}`} onClick={() => setDeleting(c)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing?.id ? 'Modifier le compte de dépôt' : 'Nouveau compte de dépôt'} onClose={() => !busy && setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Moyen de paiement" htmlFor="dc-name" required>
              <input id="dc-name" className="input" maxLength={60} value={editing.form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Numéro du compte" htmlFor="dc-number" required>
              <input id="dc-number" className="input font-mono" inputMode="tel" maxLength={40} placeholder="0990000000" value={editing.form.account_number} onChange={(e) => set('account_number', e.target.value)} />
            </Field>
            <Field label="Nom du titulaire" htmlFor="dc-holder">
              <input id="dc-holder" className="input" maxLength={120} value={editing.form.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} />
            </Field>
            <Field label="Code / procédure rapide" htmlFor="dc-ussd" hint="Ex. *501#">
              <input id="dc-ussd" className="input font-mono" maxLength={40} value={editing.form.ussd_code ?? ''} onChange={(e) => set('ussd_code', e.target.value)} />
            </Field>
            <Field label="Guide de paiement" htmlFor="dc-guide" hint="Les étapes que le membre doit suivre sur son téléphone.">
              <textarea id="dc-guide" rows={4} className="input" maxLength={2000} value={editing.form.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ordre d'affichage" htmlFor="dc-order">
                <input id="dc-order" type="number" className="input" value={editing.form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} />
              </Field>
              <label className="mt-7 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" checked={editing.form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                Visible par les membres
              </label>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={busy}>Annuler</button>
              <button className="btn bg-green-700 text-white hover:bg-green-800" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        title="Supprimer ce compte de dépôt ?"
        onClose={() => !busy && setDeleting(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)} disabled={busy}>Annuler</button>
            <button className="btn-danger" onClick={remove} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Supprimer</button>
          </>
        }
      >
        <p className="text-sm">{deleting?.name} · {deleting?.account_number} ne sera plus proposé aux membres. Pour le cacher temporairement, modifiez-le et décochez « Visible ».</p>
      </Modal>
    </>
  );
}
