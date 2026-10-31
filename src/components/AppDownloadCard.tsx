import { Download, Smartphone } from 'lucide-react';

const APK_URL = '/downloads/drivest.apk';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Carte « Télécharger l'application » de l'espace client.
 * L'application Android affiche le site en direct : chaque mise à jour du site
 * y est visible immédiatement, sans réinstaller. Masquée dans l'application elle-même.
 */
export function AppDownloadCard() {
  if (isStandalone()) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold text-slate-900">Application mobile Drivest</p>
          <p className="text-sm text-slate-500">
            {isIos()
              ? 'Sur iPhone : touchez Partager puis « Sur l’écran d’accueil ».'
              : 'Légère (1 Mo), toujours à jour, avec les notifications.'}
          </p>
        </div>
      </div>
      {!isIos() && (
        <a href={APK_URL} download="Drivest.apk" className="btn-primary shrink-0 rounded-xl">
          <Download className="h-4 w-4" /> Télécharger l&apos;application
        </a>
      )}
    </div>
  );
}
