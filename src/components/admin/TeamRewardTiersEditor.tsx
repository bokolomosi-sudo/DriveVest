import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, ErrorState, LoadingState, Spinner } from '../ui/Feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { adminListTeamRewardTiers, adminSetTeamRewardTiers } from '../../services/referral';

interface Row {
  key: number;
  invited_count: string;
  amount: string;
}

/** Paliers de récompense d'équipe : nombre d'invités ayant investi => montant versé automatiquement. */
export function TeamRewardTiersEditor() {
  const { notify } = useToast();
  const tiers = useAsync(adminListTeamRewardTiers, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tiers.data) {
      setRows(tiers.data.map((t, i) => ({ key: i, invited_count: String(t.invited_count), amount: String(t.amount) })));
    }
  }, [tiers.data]);

  const update = (key: number, field: 'invited_count' | 'amount', value: string) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  const add = () => setRows((r) => [...r, { key: Date.now(), invited_count: '', amount: '' }]);
  const remove = (key: number) => setRows((r) => r.filter((row) => row.key !== key));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const parsed = rows.map((r) => ({ invited_count: Number(r.invited_count), amount: Number(r.amount) }));
    if (parsed.some((t) => !Number.isInteger(t.invited_count) || t.invited_count < 1 || !(t.amount > 0))) {
      return setError('Chaque palier doit avoir un nombre d\'invités (1 minimum) et un montant positif.');
    }
    if (new Set(parsed.map((t) => t.invited_count)).size !== parsed.length) {
      return setError('Deux paliers ne peuvent pas avoir le même nombre d\'invités.');
    }
    setBusy(true);
    try {
      await adminSetTeamRewardTiers(parsed.sort((a, b) => a.invited_count - b.invited_count));
      await tiers.reload();
      notify('success', 'Paliers enregistrés. Les membres qui les atteignent déjà ont été crédités.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Récompenses d'équipe</h2>
        <p className="mt-1 text-sm text-slate-500">
          Montant versé automatiquement quand un membre atteint ce nombre d'invités directs ayant acheté au moins un produit. Chaque palier n'est versé qu'une fois par membre.
        </p>
      </div>
      {tiers.loading ? (
        <LoadingState />
      ) : tiers.error ? (
        <ErrorState message={tiers.error} onRetry={tiers.reload} />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((row, i) => (
              <li key={row.key} className="flex items-end gap-2 rounded-xl bg-slate-50 p-3">
                <label className="min-w-0 flex-1">
                  <span className="label text-xs">Invités ayant investi</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    inputMode="numeric"
                    aria-label={`Palier ${i + 1} : nombre d'invités`}
                    className="input"
                    value={row.invited_count}
                    onChange={(e) => update(row.key, 'invited_count', e.target.value)}
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="label text-xs">Récompense (FC)</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    inputMode="numeric"
                    aria-label={`Palier ${i + 1} : montant`}
                    className="input"
                    value={row.amount}
                    onChange={(e) => update(row.key, 'amount', e.target.value)}
                  />
                </label>
                <button type="button" onClick={() => remove(row.key)} className="btn-ghost h-[42px] shrink-0 px-3 text-red-600" aria-label={`Supprimer le palier ${i + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="text-sm text-slate-500">Aucun palier : aucune récompense d'équipe n'est versée.</p>}
          <button type="button" onClick={add} className="btn-secondary"><Plus className="h-4 w-4" /> Ajouter un palier</button>
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer les paliers</button>
          </div>
        </>
      )}
    </form>
  );
}
