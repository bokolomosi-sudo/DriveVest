import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY, formatPrice } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import { adminListUsers } from '../../services/admin';
import type { AppRole } from '../../types';

function roleLabel(roles: AppRole[]): string {
  if (roles.includes('super_admin') || roles.includes('admin')) return 'Admin';
  return 'Client';
}

/** Liste simple de tous les membres ; un clic ouvre la fiche (blocage, solde, mot de passe…). */
export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useAsync(() => adminListUsers(query), [query]);

  return (
    <>
      <PageMeta title="Utilisateurs — Administration" noindex />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Utilisateurs</h1>
      <p className="mb-4 text-sm text-slate-500">{data ? `${data.length} compte(s).` : ' '}</p>

      <form className="relative mb-4" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input h-12 rounded-2xl pl-9"
          placeholder="Rechercher par nom ou téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher"
        />
      </form>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="Aucun utilisateur" />
      ) : (
        // Tableau qui défile horizontalement sur téléphone (pas de cartes empilées ici)
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => navigate(`/admin/utilisateurs/${u.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{u.full_name?.trim() || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-600 underline decoration-slate-300 underline-offset-4">{formatLocalPhone(u.phone)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{roleLabel(u.roles)}</td>
                  <td className="px-4 py-3">
                    {u.is_blocked ? <Badge tone="danger">Bloqué</Badge> : <Badge tone="success">Actif</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-900">{formatPrice(u.balance ?? 0, CURRENCY)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
