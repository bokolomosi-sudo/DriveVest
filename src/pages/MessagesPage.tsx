import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Headphones, Megaphone, MessageCircle, Send } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, whatsappLink } from '../lib/format';
import { countUnreadNotifications } from '../services/account';
import { listPublishedAnnouncements } from '../services/content';

function MessageCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  meta,
  to,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  subtitle: ReactNode;
  meta?: string;
  to?: string;
  href?: string | null;
}) {
  const body = (
    <>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${tone}`}>
        <Icon className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-lg font-bold text-slate-900">{title}</span>
          {meta && <span className="shrink-0 text-xs text-slate-400">{meta}</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">{subtitle}</span>
      </span>
      {(to || href) && <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />}
    </>
  );
  const className = 'flex items-center gap-4 rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-white backdrop-blur transition hover:bg-white';
  if (to) return <Link to={to} className={className}>{body}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>;
  return <div className={`${className} opacity-70`}>{body}</div>;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const announcements = useAsync(listPublishedAnnouncements, []);
  const unread = useAsync(() => (user ? countUnreadNotifications(user.id) : Promise.resolve(0)), [user?.id]);
  const latest = announcements.data?.[0];
  const whatsapp = settings?.whatsapp_group_url || (settings?.whatsapp_number ? whatsappLink(settings.whatsapp_number) : null);

  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-sky-100 via-sky-50 to-accent-50">
      <PageMeta title="Messages" description="Avis, annonces et contacts officiels de Drivest." />
      <div className="container-page max-w-2xl py-6">
        <h1 className="mb-5 text-center text-xl font-bold text-slate-900">Messages</h1>
        <div className="space-y-4">
          <MessageCard
            icon={Megaphone}
            tone="bg-gradient-to-br from-amber-400 to-orange-500"
            title="Avis système"
            subtitle={latest ? latest.title : 'Aucun avis système disponible.'}
            meta={latest?.published_at ? formatDate(latest.published_at) : undefined}
            to={latest ? '/actualites' : undefined}
          />
          {user && (
            <MessageCard
              icon={Bell}
              tone="bg-gradient-to-br from-night-500 to-night-700"
              title="Mes notifications"
              subtitle={unread.data ? `${unread.data} notification(s) non lue(s)` : 'Vous êtes à jour.'}
              to="/compte/notifications"
            />
          )}
          <MessageCard
            icon={Headphones}
            tone="bg-gradient-to-br from-accent-500 to-accent-700"
            title="Service client"
            subtitle="Une question ? Écrivez à notre équipe."
            to="/service-client"
          />
          <MessageCard
            icon={Send}
            tone="bg-gradient-to-br from-sky-500 to-sky-700"
            title="Service client Telegram"
            subtitle={settings?.telegram_url ? 'Contactez-nous sur Telegram.' : 'Lien Telegram pas encore disponible.'}
            href={settings?.telegram_url}
          />
          <MessageCard
            icon={MessageCircle}
            tone="bg-gradient-to-br from-emerald-500 to-green-600"
            title="Groupes WhatsApp"
            subtitle={whatsapp ? 'Rejoignez la communauté Drivest.' : 'Lien WhatsApp pas encore disponible.'}
            href={whatsapp}
          />
        </div>
      </div>
    </div>
  );
}
