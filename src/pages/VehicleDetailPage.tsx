import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Clock, MapPin, Store, Truck, Wallet } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { Badge } from '../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { VehicleImagePlaceholder } from '../components/vehicles/VehicleImagePlaceholder';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { toErrorMessage } from '../lib/errors';
import { formatKm, formatPrice, vehicleTitle } from '../lib/format';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_TONES,
  CONDITION_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
} from '../lib/labels';
import { getVehicle, vehicleImageUrl } from '../services/vehicles';
import { buyVehicleWithWallet, getMyBalances } from '../services/wallet';
import type { Vehicle } from '../types';

function Specs({ vehicle }: { vehicle: Vehicle }) {
  const rows: [string, string | null][] = [
    ['Référence', vehicle.reference],
    ['Marque', vehicle.brand],
    ['Modèle', vehicle.model],
    ['Année', vehicle.year ? String(vehicle.year) : null],
    ['Catégorie', vehicle.category?.name ?? null],
    ['État', CONDITION_LABELS[vehicle.condition]],
    ['Kilométrage', formatKm(vehicle.mileage_km)],
    ['Carburant', vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : null],
    ['Transmission', vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission] : null],
    ['Moteur', vehicle.engine],
    ['Couleur', vehicle.color],
    ['Places', vehicle.seats ? String(vehicle.seats) : null],
    ['Durée', vehicle.duration_days ? `${vehicle.duration_days} jours` : null],
    ['Localisation', vehicle.location],
  ];
  return (
    <dl className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
      {rows
        .filter(([, v]) => v)
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5 sm:border-b sm:border-slate-100 sm:px-2">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Gallery({ vehicle }: { vehicle: Vehicle }) {
  const images = vehicle.images ?? [];
  const [index, setIndex] = useState(0);
  const current = images[index];
  const title = vehicleTitle(vehicle);
  return (
    <div>
      <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100">
        {current ? (
          <img src={vehicleImageUrl(current)} alt={current.alt ?? title} className="h-full w-full object-cover" />
        ) : (
          <VehicleImagePlaceholder label="Aucune photo disponible" />
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setIndex(i)}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ${i === index ? 'ring-accent-500' : 'ring-transparent opacity-75 hover:opacity-100'}`}
              aria-label={`Afficher la photo ${i + 1}`}
            >
              <img src={vehicleImageUrl(img, 300)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { data: vehicle, loading, error, reload } = useAsync(() => getVehicle(id), [id]);

  const { settings } = useSettings();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const buyKey = useRef<string>(crypto.randomUUID());

  const requireLogin = () => navigate(`/connexion?redirect=${encodeURIComponent(`/vehicules/${id}`)}`);



  // Bouton « Acheter » d'une carte produit : ouvre directement la confirmation d'achat
  useEffect(() => {
    if (searchParams.get('acheter') !== '1' || !vehicle || !settings?.feature_wallet) return;
    setSearchParams({}, { replace: true });
    void openBuy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vehicle, settings?.feature_wallet]);

  const openBuy = async () => {
    if (!user) return requireLogin();
    buyKey.current = crypto.randomUUID();
    setBuyError(null);
    setAvailable(null);
    setBuyOpen(true);
    try {
      const balances = await getMyBalances();
      setAvailable(balances.find((b) => b.currency === vehicle?.currency)?.available ?? 0);
    } catch {
      setAvailable(0);
    }
  };

  const confirmBuy = async () => {
    if (buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const order = await buyVehicleWithWallet(id, buyKey.current);
      notify('success', `Achat confirmé : commande ${order.order_number}.`);
      navigate(`/compte/commandes/${order.id}`);
    } catch (err) {
      setBuyError(toErrorMessage(err));
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <div className="container-page py-10">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }
  if (!vehicle) {
    return (
      <div className="container-page py-16">
        <PageMeta title="Véhicule introuvable" noindex />
        <EmptyState
          title="Véhicule introuvable"
          description="Cette annonce n'existe pas ou n'est plus publiée."
          action={<Link to="/produits" className="btn-primary">Retour aux produits</Link>}
        />
      </div>
    );
  }

  const title = vehicleTitle(vehicle);
  const orderable = vehicle.status === 'published' && vehicle.availability === 'available' && vehicle.price !== null;

  return (
    <div className="container-page py-6 lg:py-10">
      <PageMeta
        title={`${title} — ${formatPrice(vehicle.price, vehicle.currency)}`}
        description={(vehicle.description ?? `${title}, ${CONDITION_LABELS[vehicle.condition].toLowerCase()}, disponible sur Drivest.`).slice(0, 160)}
      />
      <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500" aria-label="Fil d'Ariane">
        <Link to="/produits" className="hover:text-slate-800">Produits</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="truncate text-slate-800">{vehicle.brand} {vehicle.model}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Gallery vehicle={vehicle} />

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={vehicle.condition === 'new' ? 'info' : 'neutral'}>{CONDITION_LABELS[vehicle.condition]}</Badge>
              <Badge tone={AVAILABILITY_TONES[vehicle.availability]}>{AVAILABILITY_LABELS[vehicle.availability]}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {vehicle.location && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4" /> {vehicle.location}
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="text-sm text-slate-500">Prix affiché</p>
            <p className="mt-1 break-words text-2xl font-extrabold text-night-900 min-[360px]:text-3xl">{formatPrice(vehicle.price, vehicle.currency)}</p>
            {vehicle.duration_days && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Clock className="h-4 w-4" /> Durée : {vehicle.duration_days} jours</p>
            )}
            <button className="btn-primary mt-5 w-full py-3 text-base" onClick={openBuy} disabled={!orderable}>
              <Wallet className="h-5 w-5" /> Acheter avec mon solde Drivest
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">Le paiement se fait uniquement avec le solde de votre compte Drivest.</p>
            {!orderable && (
              <p className="mt-3 text-xs text-slate-500">
                {vehicle.price === null
                  ? 'Prix non encore fixé : contactez le service client pour ce véhicule.'
                  : "Ce véhicule n'est pas disponible à la commande actuellement."}
              </p>
            )}
          </div>

          {vehicle.delivery_terms && (
            <div className="card p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-night-600" /> Conditions de livraison</p>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{vehicle.delivery_terms}</p>
            </div>
          )}
          {(vehicle.seller_name || vehicle.seller_details) && (
            <div className="card p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4 text-night-600" /> Vendeur</p>
              {vehicle.seller_name && <p className="mt-2 text-sm font-medium">{vehicle.seller_name}</p>}
              {vehicle.seller_details && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{vehicle.seller_details}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Caractéristiques</h2>
          <div className="mt-4"><Specs vehicle={vehicle} /></div>
        </section>
        {vehicle.description && (
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{vehicle.description}</p>
          </section>
        )}
      </div>

      <Modal
        open={buyOpen}
        title="Acheter avec mon portefeuille"
        onClose={() => !buying && setBuyOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBuyOpen(false)} disabled={buying}>Annuler</button>
            {available !== null && vehicle.price !== null && available < Number(vehicle.price) ? (
              <Link to="/compte/depot" className="btn-primary">Approvisionner mon portefeuille</Link>
            ) : (
              <button className="btn-primary" onClick={confirmBuy} disabled={buying || available === null}>
                {buying && <Spinner className="h-4 w-4" />} Confirmer l'achat
              </button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold">{title}</p>
            {vehicle.duration_days && <p className="text-slate-600">Durée : {vehicle.duration_days} jours</p>}
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt className="text-slate-500">Prix</dt><dd className="font-semibold">{formatPrice(vehicle.price, vehicle.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Solde disponible</dt><dd className="font-semibold">{available === null ? '…' : formatPrice(available, vehicle.currency)}</dd></div>
          </dl>
          {available !== null && vehicle.price !== null && available < Number(vehicle.price) && (
            <Alert tone="warning">Solde insuffisant : il manque {formatPrice(Number(vehicle.price) - available, vehicle.currency)}.</Alert>
          )}
          {buyError && <Alert tone="danger">{buyError}</Alert>}
        </div>
      </Modal>

    </div>
  );
}
