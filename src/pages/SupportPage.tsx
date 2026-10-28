import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
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
import { SUPPORT_STATUS_LABELS, SUPPORT_STATUS_TONES, SUPPORT_TOPIC_LABELS, entries } from '../lib/labels';
import { createSupportRequest, listMySupportRequests } from '../services/content';
import { listMyOrders } from '../services/orders';
import type { SupportTopic } from '../types';

function ContactCard() {
  const { settings } = useSettings();
  const items = [
    settings?.contact_email && { icon: Mail, label: settings.contact_email, href: `mailto:${settings.contact_email}` },
    settings?.contact_phone && { icon: Phone, label: settings.contact_phone, href: `tel:${settings.contact_phone}` },
    settings?.whatsapp_number && { icon: MessageCircle, label: 'Écrire sur WhatsApp', href: whatsappLink(settings.whatsapp_number) },
    settings?.contact_address && { icon: MapPin, label: settings.contact_address, href: null },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href: string | null }[];

  return (
    <div className="card p-5">
      <p className="font-semibold">Coordonnées officielles</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Les coordonnées officielles n'ont pas encore été publiées. Utilisez le formulaire pour nous contacter.
        </p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {items.map(({ icon: Icon, label, href }) => (
            <li key={label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-night-600" />
              {href ? (
                <a href={href} className="break-all font-medium text-night-700 hover:text-night-900" target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                  {label}
                </a>
              ) : (
                <span>{label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
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
    <div className="container-page py-10">
      <PageMeta title="Service client" description="Contactez l'équipe Drivest pour toute question sur un véhicule, une commande ou un paiement." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Service client</h1>
      <p className="mt-1 text-sm text-slate-500">Une question sur un véhicule, une commande ou un paiement ? Écrivez-nous.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {loading ? (
            <LoadingState />
          ) : user ? (
            <>
              <SupportForm userId={user.id} onCreated={() => setVersion((v) => v + 1)} />
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
        <aside><ContactCard /></aside>
      </div>
    </div>
  );
}
