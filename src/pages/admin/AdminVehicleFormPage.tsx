import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import {
  AVAILABILITY_LABELS,
  COLLECTION_LABELS,
  CONDITION_LABELS,
  FUEL_LABELS,
  PUBLICATION_STATUS_LABELS,
  TRANSMISSION_LABELS,
  entries,
} from '../../lib/labels';
import { adminListCategories } from '../../services/categories';
import {
  adminAddVehicleImageUrl,
  adminDeleteVehicle,
  adminDeleteVehicleImage,
  adminSaveVehicle,
  adminSetImageOrder,
  adminUploadVehicleImage,
  getVehicle,
  vehicleImageUrl,
  type VehicleInput,
} from '../../services/vehicles';
import { CURRENCY, formatPrice } from '../../lib/format';
import { productYield } from '../../lib/productYield';
import type {
  AvailabilityStatus,
  FuelType,
  ProductCollection,
  PublicationStatus,
  TransmissionType,
  Vehicle,
  VehicleCondition,
  VehicleImage,
} from '../../types';

type FormState = Record<
  | 'category_id' | 'brand' | 'model' | 'year' | 'description' | 'price' | 'currency' | 'condition'
  | 'mileage_km' | 'fuel' | 'transmission' | 'engine' | 'color' | 'seats' | 'duration_days' | 'daily_revenue_percent' | 'availability' | 'collection' | 'location'
  | 'delivery_terms' | 'seller_name' | 'seller_details' | 'status',
  string
>;

function toForm(v: Vehicle | null, _currency: string): FormState {
  return {
    category_id: v?.category_id ?? '',
    brand: v?.brand ?? '',
    model: v?.model ?? '',
    year: v?.year?.toString() ?? '',
    description: v?.description ?? '',
    price: v?.price?.toString() ?? '',
    currency: 'CDF',
    condition: v?.condition ?? 'used',
    mileage_km: v?.mileage_km?.toString() ?? '',
    fuel: v?.fuel ?? '',
    transmission: v?.transmission ?? '',
    engine: v?.engine ?? '',
    color: v?.color ?? '',
    seats: v?.seats?.toString() ?? '',
    duration_days: v?.duration_days?.toString() ?? '',
    daily_revenue_percent: v?.daily_revenue_percent?.toString() ?? '',
    availability: v?.availability ?? 'available',
    // Nouveaux produits : Prestige par défaut (seul espace proposé à la vente)
    collection: v?.collection ?? 'prestige',
    location: v?.location ?? '',
    delivery_terms: v?.delivery_terms ?? '',
    seller_name: v?.seller_name ?? '',
    seller_details: v?.seller_details ?? '',
    status: v?.status ?? 'draft',
  };
}

const text = (s: string) => s.trim() || null;
const num = (s: string) => (s.trim() === '' ? null : Number(s));

function toInput(f: FormState): VehicleInput {
  const price = num(f.price);
  const percent = num(f.daily_revenue_percent);
  return {
    category_id: f.category_id || null,
    brand: f.brand.trim(),
    model: f.model.trim(),
    year: num(f.year),
    description: text(f.description),
    price,
    currency: f.currency.trim().toUpperCase(),
    condition: f.condition as VehicleCondition,
    mileage_km: num(f.mileage_km),
    fuel: (f.fuel || null) as FuelType | null,
    transmission: (f.transmission || null) as TransmissionType | null,
    engine: text(f.engine),
    color: text(f.color),
    seats: num(f.seats),
    duration_days: num(f.duration_days),
    daily_revenue_percent: percent,
    daily_revenue_cap: price && percent ? Math.round((price * percent) / 100 * 100) / 100 : null,
    availability: f.availability as AvailabilityStatus,
    collection: f.collection as ProductCollection,
    location: text(f.location),
    delivery_terms: text(f.delivery_terms),
    seller_name: text(f.seller_name),
    seller_details: text(f.seller_details),
    status: f.status as PublicationStatus,
  };
}

function validate(i: VehicleInput): string | null {
  if (!i.brand || !i.model) return 'La marque et le modèle sont obligatoires.';
  if (!/^[A-Z]{3}$/.test(i.currency)) return 'La devise doit être un code ISO à 3 lettres (ex. USD, EUR, CDF).';
  if (i.year !== null && (!Number.isInteger(i.year) || i.year < 1900 || i.year > 2100)) return 'Année invalide.';
  if (i.price !== null && (!Number.isFinite(i.price) || i.price < 0)) return 'Prix invalide.';
  if (i.mileage_km !== null && (!Number.isInteger(i.mileage_km) || i.mileage_km < 0)) return 'Kilométrage invalide.';
  if (i.seats !== null && (!Number.isInteger(i.seats) || i.seats < 1 || i.seats > 100)) return 'Nombre de places invalide.';
  if (i.duration_days !== null && (!Number.isInteger(i.duration_days) || i.duration_days < 1)) return 'Durée invalide (nombre de jours).';
  if (i.daily_revenue_percent !== null && (!Number.isFinite(i.daily_revenue_percent) || i.daily_revenue_percent < 0 || i.daily_revenue_percent > 100)) {
    return 'Pourcentage de revenu journalier invalide (entre 0 et 100 %).';
  }
  if (i.status === 'published' && !i.category_id) return 'Choisissez une catégorie avant de publier.';
  if (i.status === 'published' && (!i.price || i.price <= 0)) return 'Indiquez le prix avant de publier ce produit.';
  if (i.status === 'published' && !i.duration_days) return 'Indiquez la durée avant de publier ce produit.';
  return null;
}

function ImagesManager({ vehicle, onChange }: { vehicle: Vehicle; onChange: () => void }) {
  const { notify } = useToast();
  const [images, setImages] = useState<VehicleImage[]>(vehicle.images ?? []);
  const [busy, setBusy] = useState(false);
  useEffect(() => setImages(vehicle.images ?? []), [vehicle.images]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let order = images.length;
      for (const file of Array.from(files)) {
        await adminUploadVehicleImage(vehicle.id, file, order++, `${vehicle.brand} ${vehicle.model}`);
      }
      notify('success', 'Photo(s) ajoutée(s).');
      onChange();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const [imageUrl, setImageUrl] = useState('');
  const addByUrl = async () => {
    if (!imageUrl.trim()) return;
    setBusy(true);
    try {
      await adminAddVehicleImageUrl(vehicle.id, imageUrl, images.length, `${vehicle.brand} ${vehicle.model}`);
      setImageUrl('');
      notify('success', 'Photo ajoutée.');
      onChange();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (img: VehicleImage) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    setBusy(true);
    try {
      await adminDeleteVehicleImage(img);
      onChange();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    try {
      await adminSetImageOrder(next);
    } catch (err) {
      notify('error', toErrorMessage(err));
      onChange();
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Photographies</h2>
          <p className="text-xs text-slate-500">La première photo est utilisée comme couverture. JPEG, PNG ou WebP, 5 Mo maximum.</p>
        </div>
        <label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />} Ajouter
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="img-url" className="sr-only">Adresse d'une photo</label>
        <input id="img-url" type="url" className="input" placeholder="Ou collez l'adresse https:// d'une photo libre de droits" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <button type="button" className="btn-secondary shrink-0" onClick={addByUrl} disabled={busy || !imageUrl.trim()}>Ajouter par lien</button>
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune photo pour ce véhicule.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="aspect-[4/3] bg-slate-100">
                <img src={vehicleImageUrl(img, 400)} alt={img.alt ?? ''} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between p-1.5">
                <span className="text-xs text-slate-500">{i === 0 ? 'Couverture' : `#${i + 1}`}</span>
                <div className="flex gap-0.5">
                  <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => remove(img)} aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminVehicleFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { notify } = useToast();
  const { settings } = useSettings();
  const categories = useAsync(adminListCategories, []);
  const vehicle = useAsync(() => (id ? getVehicle(id) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState<FormState>(() => toForm(null, settings?.default_currency ?? 'CDF'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!vehicle.loading) setForm(toForm(vehicle.data, settings?.default_currency ?? 'CDF'));
  }, [vehicle.data, vehicle.loading, settings?.default_currency]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const livePrice = num(form.price);
  const liveDuration = num(form.duration_days);
  const livePercent = num(form.daily_revenue_percent);
  const feePercent = Number(settings?.withdrawal_fee_percent ?? 0);
  const previewYield = productYield(livePrice, liveDuration, livePercent, feePercent);

  const onDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await adminDeleteVehicle(id);
      notify('success', 'Produit supprimé avec succès.');
      navigate('/admin/vehicules', { replace: true });
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const input = toInput(form);
    const invalid = validate(input);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      await adminSaveVehicle(id ?? null, input);
      notify('success', isNew ? 'Véhicule créé avec succès.' : 'Véhicule enregistré avec succès.');
      navigate('/admin/vehicules', { replace: true });
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (vehicle.loading || categories.loading) return <LoadingState />;
  if (vehicle.error) return <ErrorState message={vehicle.error} onRetry={vehicle.reload} />;
  if (id && !vehicle.data) return <ErrorState message="Véhicule introuvable." />;

  return (
    <>
      <PageMeta title={isNew ? 'Nouveau véhicule' : 'Modifier le véhicule'} noindex />
      <Link to="/admin/vehicules" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Véhicules
      </Link>
      <PageHeader
        title={isNew ? 'Nouveau véhicule' : `${vehicle.data!.brand} ${vehicle.data!.model}`}
        description={isNew ? 'Les champs non applicables peuvent rester vides.' : `Référence ${vehicle.data!.reference}`}
      />

      <div className="space-y-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-3">Identification</h2>
            <Field label="Marque" htmlFor="v-brand" required>
              <input id="v-brand" className="input" maxLength={60} value={form.brand} onChange={set('brand')} />
            </Field>
            <Field label="Modèle" htmlFor="v-model" required>
              <input id="v-model" className="input" maxLength={80} value={form.model} onChange={set('model')} />
            </Field>
            <Field label="Année de fabrication" htmlFor="v-year">
              <input id="v-year" type="number" className="input" value={form.year} onChange={set('year')} />
            </Field>
            <Field label="Catégorie" htmlFor="v-cat">
              <select id="v-cat" className="input" value={form.category_id} onChange={set('category_id')}>
                <option value="">— Choisir —</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ' (inactive)' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="État" htmlFor="v-cond" required>
              <select id="v-cond" className="input" value={form.condition} onChange={set('condition')}>
                {entries(CONDITION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Kilométrage (km)" htmlFor="v-km">
              <input id="v-km" type="number" min={0} className="input" value={form.mileage_km} onChange={set('mileage_km')} />
            </Field>
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-3">Caractéristiques</h2>
            <Field label="Carburant" htmlFor="v-fuel">
              <select id="v-fuel" className="input" value={form.fuel} onChange={set('fuel')}>
                <option value="">—</option>
                {entries(FUEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Transmission" htmlFor="v-trans">
              <select id="v-trans" className="input" value={form.transmission} onChange={set('transmission')}>
                <option value="">—</option>
                {entries(TRANSMISSION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Moteur / cylindrée" htmlFor="v-engine">
              <input id="v-engine" className="input" maxLength={120} placeholder="ex. 2.0 L, 150 ch" value={form.engine} onChange={set('engine')} />
            </Field>
            <Field label="Couleur" htmlFor="v-color">
              <input id="v-color" className="input" maxLength={60} value={form.color} onChange={set('color')} />
            </Field>
            <Field label="Nombre de places" htmlFor="v-seats">
              <input id="v-seats" type="number" min={1} max={100} className="input" value={form.seats} onChange={set('seats')} />
            </Field>
            <Field label="Localisation du véhicule" htmlFor="v-loc">
              <input id="v-loc" className="input" maxLength={160} value={form.location} onChange={set('location')} />
            </Field>
            <Field label="Description" htmlFor="v-desc" className="sm:col-span-2 lg:col-span-3">
              <textarea id="v-desc" rows={5} className="input" maxLength={10000} value={form.description} onChange={set('description')} />
            </Field>
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-3">Vente & Revenu quotidien</h2>
            <Field label="Prix affiché (FC)" htmlFor="v-price" hint="Obligatoire pour publier le produit.">
              <input id="v-price" type="number" min={0} step="1" className="input" placeholder="ex. 20000" value={form.price} onChange={set('price')} />
            </Field>
            <Field label="Devise" htmlFor="v-cur" required hint="Franc congolais uniquement.">
              <input id="v-cur" className="input uppercase bg-slate-50" maxLength={3} readOnly value={form.currency} onChange={set('currency')} />
            </Field>
            <Field label="Durée (jours)" htmlFor="v-duration" hint="Durée pendant laquelle le revenu est versé (ex. 30).">
              <input id="v-duration" type="number" min={1} className="input" placeholder="ex. 30" value={form.duration_days} onChange={set('duration_days')} />
            </Field>
            <Field label="Pourcentage de revenu quotidien (%)" htmlFor="v-percent" hint="Versé chaque jour automatiquement (ex. 4 % = 800 FC/jour pour 20 000 FC).">
              <input id="v-percent" type="number" min={0} max={100} step="0.01" className="input" placeholder="ex. 4" value={form.daily_revenue_percent} onChange={set('daily_revenue_percent')} />
            </Field>
            <Field label="Disponibilité" htmlFor="v-avail">
              <select id="v-avail" className="input" value={form.availability} onChange={set('availability')}>
                {entries(AVAILABILITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Espace sur la page Produits" htmlFor="v-collection" hint="« Prestige » : affiché dans l'onglet des produits précieux.">
              <select id="v-collection" className="input" value={form.collection} onChange={set('collection')}>
                {entries(COLLECTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Statut de publication" htmlFor="v-status">
              <select id="v-status" className="input" value={form.status} onChange={set('status')}>
                {entries(PUBLICATION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>

            {previewYield && (
              <div className="rounded-2xl border border-accent-200 bg-accent-50/80 p-4 sm:col-span-2 lg:col-span-3">
                <p className="text-sm font-bold text-accent-900">Aperçu du rendement calculé pour l&apos;acheteur :</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:text-sm">
                  <div className="rounded-xl bg-white p-3 shadow-xs">
                    <span className="text-xs text-slate-500">Revenu indicatif</span>
                    <p className="mt-0.5 text-base font-bold text-accent-800">{formatPrice(previewYield.daily, CURRENCY)}/jour</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 shadow-xs">
                    <span className="text-xs text-slate-500">Revenus cumulés</span>
                    <p className="mt-0.5 text-base font-bold text-slate-900">{formatPrice(previewYield.gross, CURRENCY)}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 shadow-xs">
                    <span className="text-xs text-slate-500">Après {previewYield.feePercent} % de frais</span>
                    <p className="mt-0.5 text-base font-bold text-slate-900">{formatPrice(previewYield.afterFees, CURRENCY)}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 shadow-xs">
                    <span className="text-xs text-slate-500">Gain net</span>
                    <p className="mt-0.5 text-base font-bold text-accent-700">+{formatPrice(previewYield.net, CURRENCY)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-accent-800">
                  Calculé sur {previewYield.duration} jours à {form.daily_revenue_percent} % par jour. Les versements se feront automatiquement chaque jour sans intervention manuelle.
                </p>
              </div>
            )}

            <Field label="Conditions de livraison" htmlFor="v-deliv" className="sm:col-span-2 lg:col-span-3">
              <textarea id="v-deliv" rows={3} className="input" maxLength={2000} value={form.delivery_terms} onChange={set('delivery_terms')} />
            </Field>
            <Field label="Nom du vendeur" htmlFor="v-seller">
              <input id="v-seller" className="input" maxLength={120} value={form.seller_name} onChange={set('seller_name')} />
            </Field>
            <Field label="Informations vendeur" htmlFor="v-seller-d" className="sm:col-span-1 lg:col-span-2">
              <textarea id="v-seller-d" rows={2} className="input" maxLength={2000} value={form.seller_details} onChange={set('seller_details')} />
            </Field>
          </section>

          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
              <Link to="/admin/vehicules" className="btn-secondary">Annuler</Link>
            </div>
            {!isNew && (
              <button
                type="button"
                className="btn-ghost flex items-center gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Supprimer le produit
              </button>
            )}
          </div>
        </form>

        <Modal
          open={confirmDelete}
          title="Supprimer définitivement ce produit ?"
          onClose={() => !deleting && setConfirmDelete(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={onDelete} disabled={deleting}>
                {deleting && <Spinner className="h-4 w-4" />} Supprimer
              </button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-slate-600">
            <p>Êtes-vous sûr de vouloir supprimer <strong>{form.brand} {form.model}</strong> ?</p>
            <p className="text-xs text-slate-500">
              Note : si ce produit a déjà été commandé par un client, la suppression sera bloquée pour préserver l&apos;historique financier (vous pourrez alors le désactiver ou l&apos;archiver).
            </p>
          </div>
        </Modal>

        {vehicle.data ? (
          <ImagesManager vehicle={vehicle.data} onChange={vehicle.reload} />
        ) : (
          <Alert tone="info">Enregistrez le véhicule pour pouvoir ajouter des photographies.</Alert>
        )}
      </div>
    </>
  );
}
