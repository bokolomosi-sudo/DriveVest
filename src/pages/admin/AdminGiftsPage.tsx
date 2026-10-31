import { useState, type FormEvent } from 'react';
import { Copy, Gift, Plus, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import {
  adminCreateGift,
  adminGiftWinners,
  adminListGifts,
  adminSetGiftActive,
  giftShareText,
  type AdminGift,
} from '../../services/gifts';

function giftStatus(g: AdminGift): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  if (!g.is_active) return { label: 'Désactivé', tone: 'neutral' };
  if (g.winners >= g.max_winners) return { label: 'Terminé', tone: 'warning' };
  if (g.expires_at && new Date(g.expires_at) <= new Date()) return { label: 'Expiré', tone: 'danger' };
  return { label: 'En cours', tone: 'success' };
}

/** Bonus surprise : l'admin crée un bonus, un code est généré pour le groupe. */
export default function AdminGiftsPage() {
  const { notify } = useToast();
  const gifts = useAsync(adminListGifts, []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [maxWinners, setMaxWinners] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminGift | null>(null);
  const [winnersOf, setWinnersOf] = useState<AdminGift | null>(null);
  const winners = useAsync(() => (winnersOf ? adminGiftWinners(winnersOf.id) : Promise.resolve([])), [winnersOf?.id]);

  const openForm = () => {
    setTitle('');
    setMessage('');
    setAmount('');
    setMaxWinners('');
    setExpiresAt('');
    setFormError(null);
    setOpen(true);
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', `${label} copié.`);
    } catch {
      notify('error', 'Copie impossible : sélectionnez le texte manuellement.');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = Number(amount);
    const count = Number(maxWinners);
    if (title.trim().length < 2) return setFormError('Donnez un titre au bonus.');
    if (!(value > 0)) return setFormError('Le montant doit être positif.');
    if (!Number.isInteger(count) || count < 1) return setFormError('Indiquez un nombre de gagnants (au moins 1).');
    setBusy(true);
    setFormError(null);
    try {
      const gift = await adminCreateGift({
        title: title.trim(),
        message: message.trim(),
        amount: value,
        maxWinners: count,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setOpen(false);
      setCreated(gift);
      await gifts.reload();
    } catch (err) {
      setFormError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (g: AdminGift) => {
    try {
      await adminSetGiftActive(g.id, !g.is_active);
      notify('success', g.is_active ? 'Bonus désactivé.' : 'Bonus réactivé.');
      await gifts.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  const share = (g: AdminGift) => giftShareText(g, (n) => formatPrice(n, CURRENCY));

  return (
    <>
      <PageMeta title="Bonus surprise — Administration" noindex />
      <PageHeader
        title="Bonus surprise"
        description="Créez un cadeau : un code est généré, à partager dans le groupe. Seuls les premiers membres ayant acheté un produit le reçoivent."
        actions={<button className="btn-primary" onClick={openForm}><Plus className="h-4 w-4" /> Nouveau bonus</button>}
      />

      {gifts.loading ? <LoadingState /> : gifts.error ? <ErrorState message={gifts.error} onRetry={gifts.reload} /> : !gifts.data?.length ? (
        <EmptyState icon={<Gift className="h-10 w-10" />} title="Aucun bonus créé" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {gifts.data.map((g) => {
            const status = giftStatus(g);
            return (
              <li key={g.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{g.title}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold tracking-widest text-night-900">{g.code}</p>
                  <p className="text-xs text-slate-500">
                    {formatPrice(g.amount, CURRENCY)} par gagnant · {g.winners}/{g.max_winners} gagnants · créé le {formatDate(g.created_at)}
                    {g.expires_at && ` · jusqu'au ${formatDate(g.expires_at, true)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => copy(share(g), 'Message')}><Copy className="h-3.5 w-3.5" /> Message du groupe</button>
                  <button className="btn-secondary btn-sm" onClick={() => setWinnersOf(g)}><Users className="h-3.5 w-3.5" /> Gagnants</button>
                  <button className="btn-secondary btn-sm" onClick={() => toggle(g)}>{g.is_active ? 'Désactiver' : 'Réactiver'}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        title="Nouveau bonus surprise"
        onClose={() => !busy && setOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            <button className="btn-primary" form="gift-form" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Générer le code</button>
          </>
        }
      >
        <form id="gift-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Titre" htmlFor="g-title" required>
            <input id="g-title" className="input" maxLength={120} placeholder="Bonus de la réunion du samedi" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Message (facultatif)" htmlFor="g-message" hint="Affiché au membre avec son bonus.">
            <textarea id="g-message" rows={3} className="input" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant par gagnant (FC)" htmlFor="g-amount" required>
              <input id="g-amount" type="number" min={1} step="1" inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Nombre de gagnants" htmlFor="g-max" required>
              <input id="g-max" type="number" min={1} step="1" inputMode="numeric" className="input" value={maxWinners} onChange={(e) => setMaxWinners(e.target.value)} />
            </Field>
          </div>
          <Field label="Date limite (facultatif)" htmlFor="g-expires" hint="Après cette date, le code ne fonctionne plus.">
            <input id="g-expires" type="datetime-local" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
          {formError && <Alert tone="danger">{formError}</Alert>}
        </form>
      </Modal>

      <Modal
        open={Boolean(created)}
        title="Bonus créé"
        onClose={() => setCreated(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreated(null)}>Fermer</button>
            {created && <button className="btn-primary" onClick={() => copy(share(created), 'Message')}><Copy className="h-4 w-4" /> Copier le message</button>}
          </>
        }
      >
        {created && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">Partagez ce code dans le groupe après la réunion :</p>
            <button
              type="button"
              onClick={() => copy(created.code, 'Code')}
              className="mx-auto block rounded-2xl bg-night-900 px-6 py-4 font-mono text-3xl font-extrabold tracking-[0.3em] text-white"
            >
              {created.code}
            </button>
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700">{share(created)}</pre>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(winnersOf)} title={winnersOf ? `Gagnants — ${winnersOf.title}` : ''} onClose={() => setWinnersOf(null)}>
        {winners.loading ? <LoadingState /> : winners.error ? <ErrorState message={winners.error} onRetry={winners.reload} /> : !winners.data?.length ? (
          <p className="py-6 text-center text-sm text-slate-500">Personne n'a encore utilisé ce code.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {winners.data.map((w, i) => (
              <li key={w.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{i + 1}. {w.full_name || 'Membre'} · {formatLocalPhone(w.phone)}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatDate(w.created_at, true)}</span>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </>
  );
}
