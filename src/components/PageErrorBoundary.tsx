import { Component, type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';

interface State {
  failed: boolean;
}

/** Une page qui n'a pas pu se charger (réseau coupé) affiche un bouton « Réessayer » au lieu de rester vide. */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center" role="alert">
        <WifiOff className="h-10 w-10 text-slate-400" aria-hidden="true" />
        <p className="text-lg font-semibold text-slate-900">La page n'a pas pu se charger</p>
        <p className="text-sm text-slate-500">Votre connexion internet semble lente ou coupée. Vérifiez votre réseau puis réessayez.</p>
        <button className="btn-primary h-12 rounded-2xl px-6 text-base" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    );
  }
}
