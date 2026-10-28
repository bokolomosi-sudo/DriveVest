import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CATEGORY_STATUS_LABELS, CATEGORY_STATUS_TONES, entries } from '../../lib/labels';
import { adminListCategories, adminSaveCategory, adminSetCategoryStatus, slugify, type CategoryInput } from '../../services/categories';
import type { CategoryStatus, VehicleCategory } from '../../types';

const EMPTY: CategoryInput = { name: '', slug: '', description: '', sort_order: 0, status: 'active' };

export default function AdminCategoriesPage() {
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsync(adminListCategories, []);
  const [editing, setEditing] = useState<VehicleCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openForm = (c: VehicleCategory | null) => {
    setEditing(c);
    setForm(c ? { name: c.name, slug: c.slug, description: c.description ?? '', sort_order: c.sort_order, status: c.status } : { ...EMPTY, sort_order: ((data?.length ?? 0) + 1) * 10 });
    setFormError(null);
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const input: CategoryInput = { ...form, name: form.name.trim(), slug: slugify(form.slug || form.name), description: form.description?.trim() || null };
    if (input.name.length < 2) return setFormError('Le nom doit contenir au moins 2 caractères.');
    if (!input.slug) return setFormError('Identifiant d\'URL invalide.');
    setBusy(true);
    setFormError(null);
    try {
      await adminSaveCategory(editing?.id ?? null, input);
      notify('success', 'Catégorie enregistrée.');
      setOpen(false);
      await reload();
    } catch (err) {
      setFormError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (c: VehicleCategory, status: CategoryStatus) => {
    try {
      await adminSetCategoryStatus(c.id, status);
      await reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  return (
    <>
      <PageMeta title="Catégories — Administration" noindex />
      <PageHeader
        title="Catégories"
        description="Organisation du catalogue. Une catégorie désactivée ou archivée n'est plus visible publiquement."
        actions={<button className="btn-primary" onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nouvelle catégorie</button>}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Ordre</th><th>Nom</th><th>Identifiant</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((c) => (
                <tr key={c.id}>
                  <td>{c.sort_order}</td>
                  <td className="font-medium text-slate-900">{c.name}</td>
                  <td className="font-mono text-xs">{c.slug}</td>
                  <td><Badge tone={CATEGORY_STATUS_TONES[c.status]}>{CATEGORY_STATUS_LABELS[c.status]}</Badge></td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-secondary btn-sm" onClick={() => openForm(c)}><Pencil className="h-3.5 w-3.5" /> Modifier</button>
                      {c.status === 'active' ? (
                        <button className="btn-ghost btn-sm" onClick={() => changeStatus(c, 'inactive')}>Désactiver</button>
                      ) : (
                        <button className="btn-ghost btn-sm" onClick={() => changeStatus(c, 'active')}>Activer</button>
                      )}
                      {c.status !== 'archived' && <button className="btn-ghost btn-sm" onClick={() => changeStatus(c, 'archived')}>Archiver</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        onClose={() => !busy && setOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            <button className="btn-primary" form="category-form" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
          </>
        }
      >
        <form id="category-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Nom" htmlFor="c-name" required>
            <input
              id="c-name"
              className="input"
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: editing ? f.slug : slugify(e.target.value) }))}
            />
          </Field>
          <Field label="Identifiant d'URL" htmlFor="c-slug" hint="Lettres minuscules, chiffres et tirets.">
            <input id="c-slug" className="input font-mono" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
          </Field>
          <Field label="Description" htmlFor="c-desc">
            <textarea id="c-desc" rows={2} className="input" maxLength={1000} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ordre d'affichage" htmlFor="c-order">
              <input id="c-order" type="number" className="input" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))} />
            </Field>
            <Field label="Statut" htmlFor="c-status">
              <select id="c-status" className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CategoryStatus }))}>
                {entries(CATEGORY_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          </div>
          {formError && <Alert tone="danger">{formError}</Alert>}
        </form>
      </Modal>
    </>
  );
}
