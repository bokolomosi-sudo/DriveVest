import { useState, type FormEvent } from 'react';
import { Gift, PartyPopper } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { claimGift, listMyGifts } from '../../services/gifts';

/** Bonus surprise : le membre entre le code reçu dans le groupe. */
export default function GiftPage() {
  const { notify } = useToast();
  const gifts = useAsync(listMyGifts, []);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = code.trim().toUpperCase();
    if (value.length !== 8) return setError('Le code contient 8 caractères.');
    setBusy(true);
    setError(null);
    setWon(false);
    try {
      await claimGift(value);
      setCode('');
      setWon(true);
      notify('success', 'Bonus crédité sur votre compte !');
      await gifts.reload();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageMeta title="Bonus surprise" noindex />
      <PageHeader title="Bonus surprise" description="Entrez le code partagé dans le groupe pour recevoir votre cadeau." />

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl bg-gradient-to-br from-night-800 to-night-950 p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/20">
            <Gift className="h-6 w-6 text-accent-300" aria-hidden="true" />
          </div>
          <p className="text-sm text-night-100">Réservé aux membres qui ont déjà acheté un produit. Seuls les premiers à entrer le code gagnent.</p>
        </div>
        <label htmlFor="gift-code" className="sr-only">Code du bonus</label>
        <input
          id="gift-code"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          placeholder="CODE"
          className="h-14 w-full rounded-2xl border-0 bg-white px-4 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-accent-400/50"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <button className="btn-primary h-12 w-full rounded-2xl text-base" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Recevoir mon bonus
        </button>
        {error && <Alert tone="danger">{error}</Alert>}
        {won && (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-accent-500/20 px-3 py-2 text-sm font-semibold text-accent-100" role="status">
            <PartyPopper className="h-4 w-4" /> Félicitations, votre bonus a été crédité !
          </p>
        )}
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mes bonus reçus</h2>
        {gifts.loading ? <LoadingState /> : gifts.error ? <ErrorState message={gifts.error} onRetry={gifts.reload} /> : !gifts.data?.length ? (
          <EmptyState icon={<Gift className="h-10 w-10" />} title="Aucun bonus pour le moment" description="Restez attentif aux réunions : un code peut être partagé à tout moment." />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            {gifts.data.map((g, i) => (
              <li key={`${g.created_at}-${i}`} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{g.title}</p>
                  {g.message && <p className="text-sm text-slate-600">{g.message}</p>}
                  <p className="text-xs text-slate-500">Reçu le {formatDate(g.created_at, true)}</p>
                </div>
                <p className="shrink-0 font-bold text-green-700">+{formatPrice(g.amount, CURRENCY)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
