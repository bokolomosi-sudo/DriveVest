import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { checkConnection, subscribeConnectivity, subscribeNetworkActivity } from '../lib/networkActivity';
import { Spinner } from './ui/Feedback';

// Délais avant d'afficher la barre (évite le clignotement) et les messages « connexion lente »
const SHOW_BAR_AFTER_MS = 250;
const SLOW_AFTER_MS = 4000;
const VERY_SLOW_AFTER_MS = 12000;
const BACK_ONLINE_VISIBLE_MS = 3000;

/**
 * Barre de chargement en haut, messages « connexion lente » et page « pas de connexion ».
 * La page hors connexion recouvre l'application sans la quitter : quand la connexion
 * revient, elle disparaît et l'utilisateur reprend exactement là où il était.
 */
export function NetworkStatus() {
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState<'no' | 'slow' | 'very'>('no');
  const [online, setOnline] = useState(true);
  const [backOnline, setBackOnline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let barTimer: number | undefined;
    let slowTimer: number | undefined;
    let verySlowTimer: number | undefined;
    const unsubscribe = subscribeNetworkActivity((pending) => {
      if (pending > 0) {
        barTimer ??= window.setTimeout(() => setBusy(true), SHOW_BAR_AFTER_MS);
        slowTimer ??= window.setTimeout(() => setSlow('slow'), SLOW_AFTER_MS);
        verySlowTimer ??= window.setTimeout(() => setSlow('very'), VERY_SLOW_AFTER_MS);
      } else {
        window.clearTimeout(barTimer);
        window.clearTimeout(slowTimer);
        window.clearTimeout(verySlowTimer);
        barTimer = slowTimer = verySlowTimer = undefined;
        setBusy(false);
        setSlow('no');
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(barTimer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(verySlowTimer);
    };
  }, []);

  useEffect(() => {
    let wasOffline = false;
    let backTimer: number | undefined;
    const unsubscribe = subscribeConnectivity((isOnline) => {
      setOnline(isOnline);
      if (!isOnline) {
        wasOffline = true;
        setBackOnline(false);
      } else if (wasOffline) {
        wasOffline = false;
        setBackOnline(true);
        window.clearTimeout(backTimer);
        backTimer = window.setTimeout(() => setBackOnline(false), BACK_ONLINE_VISIBLE_MS);
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(backTimer);
    };
  }, []);

  const retry = async () => {
    setChecking(true);
    await checkConnection();
    setChecking(false);
  };

  if (!online) {
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-white px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="offline-title"
        aria-describedby="offline-text"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
          <WifiOff className="h-10 w-10 text-red-600" aria-hidden="true" />
        </div>
        <h1 id="offline-title" className="text-xl font-bold text-slate-900">Pas de connexion internet</h1>
        <div id="offline-text" className="max-w-sm space-y-2 text-sm text-slate-600">
          <p>Vos données mobiles ou votre Wi-Fi semblent désactivés.</p>
          <p>Activez-les : vous reprendrez automatiquement là où vous étiez, sans rien perdre.</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Spinner className="h-3.5 w-3.5" /> En attente de la connexion…
        </p>
        <button type="button" onClick={retry} disabled={checking} className="btn-primary h-12 rounded-2xl px-6 text-base">
          {checking && <Spinner className="h-4 w-4" />} Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      {busy && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-accent-100" role="progressbar" aria-label="Chargement en cours">
          <div className="h-full w-1/3 animate-network-bar rounded-full bg-accent-500" />
        </div>
      )}
      {backOnline ? (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex justify-center px-4" role="status">
          <p className="flex items-center gap-2 rounded-full bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <Wifi className="h-4 w-4" /> Connexion rétablie
          </p>
        </div>
      ) : (
        slow !== 'no' && (
          <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex justify-center px-4" role="status">
            <p className="flex max-w-md items-center gap-2 rounded-2xl bg-night-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg">
              <Spinner className="h-4 w-4 shrink-0" />
              {slow === 'very'
                ? 'Votre connexion internet est très faible : le chargement prend du temps, ce n’est pas un problème du site.'
                : 'Connexion internet lente, veuillez patienter…'}
            </p>
          </div>
        )
      )}
    </>
  );
}
