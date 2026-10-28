import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { subscribeNetworkActivity } from '../lib/networkActivity';
import { Spinner } from './ui/Feedback';

// Délais avant d'afficher la barre (évite le clignotement) et le message « connexion lente »
const SHOW_BAR_AFTER_MS = 250;
const SLOW_AFTER_MS = 4000;

/** Barre de chargement en haut, message « connexion lente » et alerte hors connexion. */
export function NetworkStatus() {
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    let barTimer: number | undefined;
    let slowTimer: number | undefined;
    const unsubscribe = subscribeNetworkActivity((pending) => {
      if (pending > 0) {
        barTimer ??= window.setTimeout(() => setBusy(true), SHOW_BAR_AFTER_MS);
        slowTimer ??= window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
      } else {
        window.clearTimeout(barTimer);
        window.clearTimeout(slowTimer);
        barTimer = slowTimer = undefined;
        setBusy(false);
        setSlow(false);
      }
    });
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      unsubscribe();
      window.clearTimeout(barTimer);
      window.clearTimeout(slowTimer);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <>
      {busy && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-accent-100" role="progressbar" aria-label="Chargement en cours">
          <div className="h-full w-1/3 animate-network-bar rounded-full bg-accent-500" />
        </div>
      )}
      {!online ? (
        <div className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-red-600 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-sm font-medium text-white" role="alert">
          <WifiOff className="h-4 w-4 shrink-0" /> Pas de connexion internet. Vérifiez votre réseau.
        </div>
      ) : (
        slow && (
          <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex justify-center px-4" role="status">
            <p className="flex items-center gap-2 rounded-full bg-night-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg">
              <Spinner className="h-4 w-4" /> Connexion lente, veuillez patienter…
            </p>
          </div>
        )
      )}
    </>
  );
}
