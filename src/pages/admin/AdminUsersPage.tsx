import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import { adminListUsers, adminSetUserBlocked, type AdminUser } from '../../services/admin';
import type { AppRole } from '../../types';

const ROLE_LABELS: Record<AppRole, string> = { client: 'Client', admin: 'Administrateur', super_admin: 'Super administrateur' };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data: all, loading, error, reload } = useAsync(() => adminListUsers(query), [query]);
  const [status, setStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const data = all?.filter((u) => status === 'all' || (status === 'blocked' ? u.is_blocked : !u.is_blocked));
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submit = async () => {
    if (!target || busy) return;
    if (!reason.trim()) return setActionError('Un motif est obligatoire.');
    setBusy(true);
    setActionError(null);
    try {
      await adminSetUserBlocked(target.id, !target.is_blocked, reason);
      notify('success', target.is_blocked ? 'Compte réactivé.' : 'Compte bloqué.');
      setTarget(null);
      setReason('');
      await reload();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Utilisateurs — Administration" noindex />
      <PageHeader title="Utilisateurs" description="Recherchez un membre, ouvrez sa fiche pour réinitialiser son mot de passe, ajuster son solde ou bloquer son compte." />
      <form className="relative mb-4" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Nom ou téléphone (097…)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
      </form>
      <div className="mb-4 flex gap-1 rounded-2xl bg-slate-100 p-1 sm:w-fit" role="tablist" aria-label="Statut">
        {([['all', 'Tous'], ['active', 'Actifs'], ['blocked', 'Bloqués']] as const).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold sm:flex-none ${status === value ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="Aucun utilisateur" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Utilisateur</th><th>Contact</th><th>Rôles</th><th>Inscription</th><th>Statut</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/admin/utilisateurs/${u.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">{u.full_name ?? 'Nom non renseigné'}</Link>
                    <p className="text-xs text-slate-500">{[u.city, u.province].filter(Boolean).join(', ')}</p>
                  </td>
                  <td><p className="font-medium">{formatLocalPhone(u.phone)}</p>{u.email && !u.email.endsWith('@telephone.drivest.app') && <p className="text-xs text-slate-500">{u.email}</p>}</td>
                  <td><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'client' ? 'neutral' : 'info'}>{ROLE_LABELS[r]}</Badge>)}</div></td>
                  <td className="whitespace-nowrap text-xs">{formatDate(u.created_at)}</td>
                  <td>
                    {u.is_blocked ? (
                      <div><Badge tone="danger">Bloqué</Badge><p className="mt-1 max-w-[200px] text-xs text-slate-500">{u.blocked_reason}</p></div>
                    ) : (
                      <Badge tone="success">Actif</Badge>
                    )}
                  </td>
                  <td>
                    <Link to={`/admin/utilisateurs/${u.id}`} className="btn-secondary btn-sm mr-1">Voir</Link>
                    <Link to={`/admin/utilisateurs/${u.id}?action=solde`} className="btn-secondary btn-sm mr-1">Créditer / Débiter</Link>
                    {u.id !== me?.id && (
                      <button className={u.is_blocked ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm text-red-700'} onClick={() => { setTarget(u); setReason(''); setActionError(null); }}>
                        {u.is_blocked ? 'Réactiver' : 'Bloquer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={target !== null}
        title={target?.is_blocked ? 'Réactiver le compte' : 'Bloquer le compte'}
        onClose={() => !busy && setTarget(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTarget(null)} disabled={busy}>Annuler</button>
            <button className={target?.is_blocked ? 'btn-primary' : 'btn-danger'} onClick={submit} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Confirmer
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p><strong>{target?.full_name ?? target?.email}</strong></p>
          <Field label="Motif" htmlFor="block-reason" required>
            <textarea id="block-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {actionError && <Alert tone="danger">{actionError}</Alert>}
        </div>
      </Modal>
    </>
  );
}
