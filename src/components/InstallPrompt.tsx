import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';

// Événement Chrome/Android non typé par TypeScript
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'drivest:install-dismissed-at';
const DISMISS_DAYS = 3;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

/** Propose d'installer Drivest comme application dès l'ouverture du site. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());

  useEffect(() => {
    if (hidden) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // iPhone : pas d'installation automatique, on explique la marche à suivre
    if (isIos()) setShowIos(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [hidden]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // stockage indisponible : la bannière reviendra au prochain chargement
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setHidden(true);
    else dismiss();
  };

  if (hidden || (!deferred && !showIos)) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3 md:bottom-4" role="dialog" aria-label="Installer l'application">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-night-900 p-3 text-white shadow-2xl ring-1 ring-white/10">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Installer l'application Drivest</p>
          {deferred ? (
            <p className="text-xs text-night-200">Accès rapide depuis votre écran d'accueil.</p>
          ) : (
            <p className="text-xs text-night-200">
              Touchez <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Partager" /> puis « Sur l'écran d'accueil ».
            </p>
          )}
        </div>
        {deferred && (
          <button onClick={install} className="btn-primary shrink-0 rounded-xl px-4 py-2">Installer</button>
        )}
        <button onClick={dismiss} className="shrink-0 rounded-lg p-1.5 text-night-300 hover:bg-white/10 hover:text-white" aria-label="Plus tard">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
