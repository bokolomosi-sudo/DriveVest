import { useState, type FormEvent } from 'react';
import { Megaphone, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_TONES, entries } from '../../lib/labels';
import { adminListAnnouncements, adminSaveAnnouncement } from '../../services/content';
import type { Announcement, PublicationStatus } from '../../types';

export default function AdminAnnouncementsPage() {
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsync(adminListAnnouncements, []);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<PublicationStatus>('draft');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openForm = (a: Announcement | null) => {
    setEditing(a);
    setTitle(a?.title ?? '');
    setBody(a?.body ?? '');
    setStatus(a?.status ?? 'draft');
    setFormError(null);
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (title.trim().length < 3) return setFormError('Le titre doit contenir au moins 3 caractères.');
    if (!body.trim()) return setFormError('Le contenu est obligatoire.');
    setBusy(true);
    setFormError(null);
    try {
      await adminSaveAnnouncement(editing?.id ?? null, { title: title.trim(), body: body.trim(), status });
      notify('success', 'Annonce enregistrée.');
      setOpen(false);
      await reload();
    } catch (err) {
      setFormError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Annonces — Administration" noindex />
      <PageHeader
        title="Annonces"
        description="Informations publiées sur la page Actualités."
        actions={<button className="btn-primary" onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nouvelle annonce</button>}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<Megaphone className="h-10 w-10" />} title="Aucune annonce" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {data.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs text-slate-500">
                  Créée le {formatDate(a.created_at)}{a.published_at && ` · publiée le ${formatDate(a.published_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={PUBLICATION_STATUS_TONES[a.status]}>{PUBLICATION_STATUS_LABELS[a.status]}</Badge>
                <button className="btn-secondary btn-sm" onClick={() => openForm(a)}><Pencil className="h-3.5 w-3.5" /> Modifier</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        title={editing ? "Modifier l'annonce" : 'Nouvelle annonce'}
        onClose={() => !busy && setOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            <button className="btn-primary" form="announcement-form" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
          </>
        }
      >
        <form id="announcement-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Titre" htmlFor="a-title" required>
            <input id="a-title" className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Contenu" htmlFor="a-body" required>
            <textarea id="a-body" rows={6} className="input" maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Statut" htmlFor="a-status">
            <select id="a-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as PublicationStatus)}>
              {entries(PUBLICATION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {formError && <Alert tone="danger">{formError}</Alert>}
        </form>
      </Modal>
    </>
  );
}
