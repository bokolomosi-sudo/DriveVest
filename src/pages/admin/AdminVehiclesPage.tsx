import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import { dailyRevenueAmount } from '../../lib/productYield';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_TONES,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
  entries,
} from '../../lib/labels';
import { adminDeleteVehicle, adminListVehicles, adminSetVehicleStatus, vehicleImageUrl } from '../../services/vehicles';
import type { PublicationStatus, Vehicle } from '../../types';

export default function AdminVehiclesPage() {
  const { notify } = useToast();
  const [status, setStatus] = useState<PublicationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data, loading, error, reload } = useAsync(() => adminListVehicles(status, query), [status, query]);

  const changeStatus = async (id: string, next: PublicationStatus) => {
    try {
      await adminSetVehicleStatus(id, next);
      notify('success', `Annonce : ${PUBLICATION_STATUS_LABELS[next].toLowerCase()}.`);
      await reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  const deleteVehicle = async () => {
    if (!vehicleToDelete || deleting) return;
    setDeleting(true);
    try {
      await adminDeleteVehicle(vehicleToDelete.id);
      notify('success', 'Produit supprimé.');
      setVehicleToDelete(null);
      await reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageMeta title="Véhicules — Administration" noindex />
      <PageHeader
        title="Véhicules"
        description="Créez, modifiez, publiez, désactivez ou archivez les annonces."
        actions={<Link to="/admin/vehicules/nouveau" className="btn-primary"><Plus className="h-4 w-4" /> Nouveau véhicule</Link>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Marque, modèle ou référence" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
        </form>
        <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as PublicationStatus | 'all')} aria-label="Filtrer par statut">
          <option value="all">Tous les statuts</option>
          {entries(PUBLICATION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Car className="h-10 w-10" />} title="Aucun véhicule" action={<Link to="/admin/vehicules/nouveau" className="btn-primary">Ajouter un véhicule</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Véhicule</th>
                <th>Prix & Rendement</th>
                <th>Disponibilité</th>
                <th>Publication</th>
                <th>Mis à jour</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((v) => {
                const daily = dailyRevenueAmount(v.price, v.daily_revenue_percent);
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-slate-100">
                          {v.images?.[0] && <img src={vehicleImageUrl(v.images[0], 200)} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{v.brand} {v.model} {v.year ?? ''}</p>
                          <p className="text-xs text-slate-500">{v.reference} · {v.category?.name ?? 'Sans catégorie'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <p className="font-bold text-slate-900">{formatPrice(v.price, v.currency)}</p>
                      {daily > 0 ? (
                        <p className="text-xs font-semibold text-accent-700">
                          +{formatPrice(daily, v.currency)}/j ({v.daily_revenue_percent} %) · {v.duration_days ?? 0}j
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">Pas de revenu</p>
                      )}
                    </td>
                    <td><Badge tone={AVAILABILITY_TONES[v.availability]}>{AVAILABILITY_LABELS[v.availability]}</Badge></td>
                    <td><Badge tone={PUBLICATION_STATUS_TONES[v.status]}>{PUBLICATION_STATUS_LABELS[v.status]}</Badge></td>
                    <td className="whitespace-nowrap text-xs">{formatDate(v.updated_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Link to={`/admin/vehicules/${v.id}`} className="btn-secondary btn-sm"><Pencil className="h-3.5 w-3.5" /> Modifier</Link>
                        {v.status !== 'published' && v.status !== 'archived' && (
                          <button className="btn-primary btn-sm" onClick={() => changeStatus(v.id, 'published')}>Publier</button>
                        )}
                        {v.status === 'published' && (
                          <button className="btn-secondary btn-sm" onClick={() => changeStatus(v.id, 'inactive')}>Désactiver</button>
                        )}
                        {v.status !== 'archived' ? (
                          <button className="btn-ghost btn-sm" onClick={() => changeStatus(v.id, 'archived')}>Archiver</button>
                        ) : (
                          <button className="btn-ghost btn-sm" onClick={() => changeStatus(v.id, 'draft')}>Restaurer</button>
                        )}
                        <button
                          className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Supprimer"
                          onClick={() => setVehicleToDelete(v)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(vehicleToDelete)}
        title="Supprimer le produit"
        onClose={() => !deleting && setVehicleToDelete(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setVehicleToDelete(null)} disabled={deleting}>Annuler</button>
            <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={deleteVehicle} disabled={deleting}>
              {deleting && <Spinner className="h-4 w-4" />} Supprimer
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Voulez-vous vraiment supprimer le produit <strong>{vehicleToDelete?.brand} {vehicleToDelete?.model}</strong> ?
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Si ce produit a déjà été commandé par un client, la suppression sera bloquée pour préserver l&apos;historique financier (dans ce cas, archivez-le).
        </p>
      </Modal>
    </>
  );
}
