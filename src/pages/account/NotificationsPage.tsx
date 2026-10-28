import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { listMyNotifications, markNotificationsRead } from '../../services/account';

export default function NotificationsPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsync(() => listMyNotifications(userId), [userId]);
  const unread = (data ?? []).filter((n) => !n.is_read).length;

  const markAll = async () => {
    try {
      await markNotificationsRead(userId);
      await reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    }
  };

  const markOne = (id: string) => markNotificationsRead(userId, [id]).catch(() => undefined);

  return (
    <>
      <PageMeta title="Notifications" noindex />
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}` : 'Vous êtes à jour.'}
        actions={unread > 0 && <button className="btn-secondary btn-sm" onClick={markAll}><CheckCheck className="h-4 w-4" /> Tout marquer comme lu</button>}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Bell className="h-10 w-10" />} title="Aucune notification" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {data.map((n) => {
            const content = (
              <div className="flex gap-3 p-4">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent-500'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className={`text-sm ${n.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">{formatDate(n.created_at, true)}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link to={n.link} onClick={() => markOne(n.id)} className="block hover:bg-slate-50">{content}</Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
