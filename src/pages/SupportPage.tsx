import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Headphones, LifeBuoy } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { Badge } from '../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../components/ui/Feedback';
import { Field } from '../components/ui/Field';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { toErrorMessage } from '../lib/errors';
import { formatDate, whatsappLink } from '../lib/format';
import { formatLocalPhone } from '../lib/phoneAuth';
import { SUPPORT_STATUS_LABELS, SUPPORT_STATUS_TONES, SUPPORT_TOPIC_LABELS, entries } from '../lib/labels';
import { createSupportRequest, listMySupportRequests } from '../services/content';
import { listMyOrders } from '../services/orders';
import type { SupportTopic } from '../types';

function WhatsAppIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z" />
    </svg>
  );
}

/** Contact du service client par WhatsApp et lien du groupe de la plateforme (réglés par l'admin). */
function WhatsAppSupport() {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const name = settings?.support_name?.trim() || 'Service client Drivest';
  const number = settings?.whatsapp_number?.trim();
  const group = settings?.whatsapp_group_url?.trim();
  const greeting = `Bonjour ${name}, j'ai besoin d'aide sur Drivest.${profile?.phone ? ` Mon numéro de compte : ${formatLocalPhone(profile.phone)}.` : ''}`;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md">
            <Headphones className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sur WhatsApp</p>
            <p className="break-words text-lg font-bold text-slate-900">{name}</p>
            {/* Numéro de RDC affiché en local (0…), numéro étranger tel que saisi */}
            {number && <p className="font-mono text-sm text-slate-600">{number.replace(/\D/g, '').startsWith('243') ? formatLocalPhone(number) : number}</p>}
            {settings?.support_hours && <p className="text-sm text-slate-500">{settings.support_hours}</p>}
          </div>
        </div>
        {number ? (
          <a
            href={whatsappLink(number, greeting)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn mt-5 h-14 w-full rounded-2xl bg-[#25D366] text-base text-white shadow-md hover:bg-[#1ebe5b]"
          >
            <WhatsAppIcon /> Contacter le service client
          </a>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Le numéro WhatsApp du service client sera bientôt disponible.</p>
        )}
      </section>

      <section className="rounded-3xl bg-gradient-to-br from-[#075E54] to-[#128C7E] p-5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <img src="/logos/whatsapp-icon.png" alt="" aria-hidden="true" className="h-12 w-12 shrink-0 rounded-xl shadow-md" />
          <div>
            <p className="text-lg font-bold">Groupe WhatsApp de Drivest</p>
            <p className="text-sm text-white/80">Annonces, nouveaux produits et entraide entre membres.</p>
          </div>
        </div>
        {group ? (
          <a
            href={group}
            target="_blank"
            rel="noopener noreferrer"
            className="btn mt-4 h-14 w-full rounded-2xl bg-white text-base text-[#075E54] hover:bg-white/90"
          >
            <img src="/logos/whatsapp-icon.png" alt="" aria-hidden="true" className="h-7 w-7 rounded-md" /> Rejoindre le groupe WhatsApp
          </a>
        ) : (
          <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm">Le lien du groupe sera bientôt disponible.</p>
        )}
      </section>
    </div>
  );
}

function SupportForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const { notify } = useToast();
  const orders = useAsync(() => listMyOrders(userId), [userId]);
  const [topic, setTopic] = useState<SupportTopic>('other');
  const [orderId, setOrderId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (subject.trim().length < 3) return setError('Le sujet doit contenir au moins 3 caractères.');
    if (message.trim().length < 10) return setError('Décrivez votre demande (10 caractères minimum).');
    setBusy(true);
    try {
      await createSupportRequest({ userId, topic, subject, message, orderId: orderId || null });
      setSubject('');
      setMessage('');
      setOrderId('');
      notify('success', 'Votre demande a été envoyée au service client.');
      onCreated();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Nouvelle demande</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sujet de la demande" htmlFor="topic" required>
          <select id="topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
            {entries(SUPPORT_TOPIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Commande concernée" htmlFor="order">
          <select id="order" className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Aucune</option>
            {(orders.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.order_number}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Objet" htmlFor="subject" required>
        <input id="subject" className="input" maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Description du problème" htmlFor="message" required>
        <textarea id="message" rows={5} className="input" maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Envoyer</button>
    </form>
  );
}

function SupportHistory({ userId, version }: { userId: string; version: number }) {
  const { data, loading, error, reload } = useAsync(() => listMySupportRequests(userId), [userId, version]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.length === 0) return <EmptyState title="Aucune demande envoyée" />;
  return (
    <ul className="space-y-3">
      {data.map((r) => (
        <li key={r.id} className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{r.subject}</p>
            <Badge tone={SUPPORT_STATUS_TONES[r.status]}>{SUPPORT_STATUS_LABELS[r.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{SUPPORT_TOPIC_LABELS[r.topic]} · {formatDate(r.created_at, true)}</p>
          <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{r.message}</p>
          {r.admin_response && (
            <div className="mt-4 rounded-lg border-l-4 border-accent-500 bg-accent-50 p-3 text-sm">
              <p className="text-xs font-semibold text-accent-800">Réponse de Drivest · {formatDate(r.responded_at, true)}</p>
              <p className="mt-1 whitespace-pre-line text-slate-700">{r.admin_response}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function SupportPage() {
  const { user, loading } = useAuth();
  const [version, setVersion] = useState(0);

  return (
    <div className="container-page max-w-2xl py-6 sm:py-10">
      <PageMeta title="Service client" description="Contactez l'équipe Drivest pour toute question sur un véhicule, une commande ou un paiement." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Service client</h1>
      <p className="mt-1 text-sm text-slate-500">Une question ? Écrivez-nous directement sur WhatsApp.</p>

      <div className="mt-6 space-y-8">
        <WhatsAppSupport />
        <div className="space-y-8">
          {loading ? (
            <LoadingState />
          ) : user ? (
            <>
              <section>
                <h2 className="mb-1 text-lg font-semibold">Ou envoyez une demande écrite</h2>
                <p className="mb-4 text-sm text-slate-500">La réponse s'affiche ici et dans vos notifications.</p>
                <SupportForm userId={user.id} onCreated={() => setVersion((v) => v + 1)} />
              </section>
              <section>
                <h2 className="mb-4 text-lg font-semibold">Mes demandes</h2>
                <SupportHistory userId={user.id} version={version} />
              </section>
            </>
          ) : (
            <EmptyState
              icon={<LifeBuoy className="h-10 w-10" />}
              title="Connectez-vous pour envoyer une demande"
              description="La connexion permet de suivre le traitement de vos demandes et de recevoir nos réponses."
              action={<Link to="/connexion?redirect=/service-client" className="btn-primary">Se connecter</Link>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
