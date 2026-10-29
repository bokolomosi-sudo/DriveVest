import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { adminDistributeRevenue, adminListDistributions, adminRevenuePreview, todayInKinshasa } from '../../services/revenue';
import { adminListVehicles } from '../../services/vehicles';

/** Ce que l'acheteur recevra : le revenu partagé entre les unités, jamais au-delà du plafond. */
function perUnit(amount: number, units: number, cap: number): number {
  if (units <= 0 || amount <= 0) return 0;
  return Math.min(cap, Math.floor((amount / units) * 100) / 100);
}

export default function AdminRevenuePage() {
  const { notify } = useToast();
  const vehicles = useAsync(() => adminListVehicles('all'), []);
  const history = useAsync(adminListDistributions, []);
  const products = (vehicles.data ?? []).filter((v) => Number(v.daily_revenue_cap) > 0);

  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(todayInKinshasa());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = products.find((v) => v.id === vehicleId) ?? null;
  const preview = useAsync(
    () => (vehicleId && date ? adminRevenuePreview(vehicleId, date) : Promise.resolve(null)),
    [vehicleId, date],
  );
  const value = Number(amount);
  const cap = Number(selected?.daily_revenue_cap ?? 0);
  const units = preview.data?.units ?? 0;
  const share = perUnit(value, units, cap);
  const paid = share * units;

  const open = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) return setError('Choisissez un produit.');
    if (!(value > 0)) return setError('Indiquez le revenu réellement encaissé.');
    if (preview.data?.already_declared) return setError('Le revenu de ce produit est déjà déclaré pour ce jour.');
    if (units === 0) return setError("Aucun acheteur n'a ce produit actif à cette date.");
    if (share <= 0) return setError('Revenu trop faible pour être partagé.');
    setConfirming(true);
  };

  const submit = async () => {
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const d = await adminDistributeRevenue({ vehicleId: selected.id, date, amount: value, note });
      notify('success', `${formatPrice(Number(d.paid_total), CURRENCY)} versés à ${d.units} produit(s) actif(s).`);
      setConfirming(false);
      setAmount('');
      setNote('');
      await Promise.all([history.reload(), preview.reload()]);
    } catch (err) {
      setError(toErrorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageMeta title="Revenus des produits — Administration" noindex />
      <PageHeader
        title="Revenus des produits"
        description="Déclarez chaque jour ce qu'un produit a réellement rapporté : le site le partage entre ses acheteurs, sans dépasser le plafond journalier."
      />

      <form onSubmit={open} className="mb-6 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {vehicles.loading ? <LoadingState /> : vehicles.error ? <ErrorState message={vehicles.error} onRetry={vehicles.reload} /> : products.length === 0 ? (
          <Alert tone="warning">
            Aucun produit n'a de plafond de revenu journalier. Fixez-le dans la fiche du produit (
            <Link to="/admin/vehicules" className="font-semibold underline">Véhicules</Link>), champ « Plafond de revenu journalier ».
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Produit" htmlFor="rv-product" required>
                <select id="rv-product" className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Choisir…</option>
                  {products.map((v) => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} — plafond {formatPrice(Number(v.daily_revenue_cap), CURRENCY)}/jour</option>
                  ))}
                </select>
              </Field>
              <Field label="Jour du revenu" htmlFor="rv-date" required>
                <input id="rv-date" type="date" className="input" max={todayInKinshasa()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Revenu réellement encaissé (FC)" htmlFor="rv-amount" required hint="Le montant total que ce produit a rapporté ce jour-là.">
                <input id="rv-amount" type="number" min={0} step="1" inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Justificatif / note" htmlFor="rv-note" hint="Ex. : recette de location du jour, reçu n°…">
                <input id="rv-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>

            {selected && (
              <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">Produits actifs</dt><dd className="font-semibold">{preview.loading ? '…' : units}</dd></div>
                <div><dt className="text-xs text-slate-500">Par produit</dt><dd className="font-semibold text-green-700">{formatPrice(share, CURRENCY)}</dd></div>
                <div><dt className="text-xs text-slate-500">Total versé</dt><dd className="font-semibold">{formatPrice(paid, CURRENCY)}</dd></div>
                <div><dt className="text-xs text-slate-500">Gardé par Drivest</dt><dd className="font-semibold">{formatPrice(Math.max(value - paid, 0), CURRENCY)}</dd></div>
              </dl>
            )}
            {preview.data?.already_declared && <Alert tone="info">Le revenu de ce produit est déjà déclaré pour ce jour.</Alert>}
            {error && <Alert tone="danger">{error}</Alert>}
            <button className="btn bg-green-700 text-white hover:bg-green-800" disabled={busy}>Distribuer le revenu</button>
          </>
        )}
      </form>

      <h2 className="mb-3 text-lg font-semibold">Historique des distributions</h2>
      {history.loading ? <LoadingState /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : !history.data?.length ? (
        <EmptyState title="Aucun revenu distribué" />
      ) : (
        <ul className="space-y-2">
          {history.data.map((d) => (
            <li key={d.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{d.vehicle ? `${d.vehicle.brand} ${d.vehicle.model}` : 'Produit'}</p>
                  <p className="text-xs text-slate-500">Revenu du {formatDate(d.revenue_date)}{d.note ? ` · ${d.note}` : ''}</p>
                </div>
                <p className="text-right text-sm">
                  <span className="font-bold text-green-700">{formatPrice(d.paid_total, CURRENCY)} versés</span>
                  <br />
                  <span className="text-xs text-slate-500">{d.units} × {formatPrice(d.per_unit, CURRENCY)} · déclaré {formatPrice(d.declared_amount, CURRENCY)} · gardé {formatPrice(d.retained, CURRENCY)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirming}
        title="Confirmer la distribution"
        onClose={() => !busy && setConfirming(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>Annuler</button>
            <button className="btn bg-green-700 text-white hover:bg-green-800" onClick={submit} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Distribuer
            </button>
          </>
        }
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <p><strong>{selected.brand} {selected.model}</strong> — revenu du {formatDate(date)}</p>
            <p>
              Revenu déclaré {formatPrice(value, CURRENCY)} : {units} produit(s) actif(s) recevront chacun{' '}
              <strong>{formatPrice(share, CURRENCY)}</strong>, soit {formatPrice(paid, CURRENCY)} au total.
            </p>
            <Alert tone="warning">Déclarez uniquement un revenu réellement encaissé. Une distribution ne peut pas être annulée.</Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}
