import { formatPrice } from '../../lib/format';
import type { WalletBalance } from '../../types';

/** Soldes affichés séparément : disponible et en attente. */
export function BalanceCards({ balances }: { balances: WalletBalance[] }) {
  if (balances.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {['Solde disponible', 'En attente'].map((l) => (
          <div key={l} className="card p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="mt-1 text-xl font-bold text-slate-400">—</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {balances.map((b) => (
        <div key={b.currency} className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-night-900 p-4 text-white shadow-sm">
            <p className="text-xs text-night-200">Solde disponible ({b.currency})</p>
            <p className="mt-1 text-2xl font-bold">{formatPrice(b.available, b.currency)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">En attente</p>
            <p className="mt-1 text-sm">
              <span className="font-semibold text-accent-700">+{formatPrice(b.pending_in, b.currency)}</span>{' '}
              <span className="text-slate-400">dépôts à vérifier</span>
            </p>
            <p className="text-sm">
              <span className="font-semibold text-amber-700">−{formatPrice(b.pending_out, b.currency)}</span>{' '}
              <span className="text-slate-400">retraits en cours</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
