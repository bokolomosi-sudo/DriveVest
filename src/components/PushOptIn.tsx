import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Spinner } from './ui/Feedback';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../lib/errors';
import { enablePush, getPushState, syncPushSubscription, type PushState } from '../lib/push';

/**
 * Carte « Activer les notifications » (tableau de bord, page Notifications).
 * Invisible si l'appareil est déjà abonné ou ne prend pas en charge les notifications.
 */
export function PushOptIn({ alwaysShowStatus = false }: { alwaysShowStatus?: boolean }) {
  const { notify } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setState).catch(() => setState('unsupported'));
    void syncPushSubscription().catch(() => undefined);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'enabled') notify('success', 'Notifications activées sur cet appareil.');
      else if (next === 'denied') notify('error', 'Notifications bloquées : autorisez-les dans les réglages du téléphone.');
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!state || state === 'not-configured') return null;
  if (state === 'enabled') {
    return alwaysShowStatus ? (
      <p className="mb-4 flex items-center gap-2 rounded-2xl bg-accent-50 px-4 py-3 text-sm font-medium text-accent-800">
        <BellRing className="h-4 w-4" /> Notifications activées sur cet appareil.
      </p>
    ) : null;
  }
  if (state === 'unsupported') {
    return alwaysShowStatus ? (
      <p className="mb-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
        Ce navigateur ne permet pas les notifications. Installez l&apos;application Drivest pour les recevoir.
      </p>
    ) : null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-night-900 p-4 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent-300" aria-hidden="true" />
        <p className="text-sm">
          {state === 'denied'
            ? 'Les notifications sont bloquées. Autorisez-les dans les réglages du téléphone pour être prévenu des dépôts, retraits, revenus et bonus.'
            : 'Activez les notifications pour être prévenu des dépôts, retraits, revenus du jour, bonus et annonces.'}
        </p>
      </div>
      {state === 'available' && (
        <button type="button" onClick={enable} disabled={busy} className="btn-primary shrink-0 rounded-xl">
          {busy && <Spinner className="h-4 w-4" />} Activer
        </button>
      )}
    </div>
  );
}
