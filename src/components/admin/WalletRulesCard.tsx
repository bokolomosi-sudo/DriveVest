import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Spinner } from '../ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { adminUpdateSettings } from '../../services/content';

type RuleKey =
  | 'min_deposit'
  | 'min_withdrawal'
  | 'withdrawal_fee_percent'
  | 'referral_commission_percent'
  | 'referral_level2_percent'
  | 'referral_level3_percent'
  | 'signup_bonus';

const LABELS: Record<RuleKey, string> = {
  min_deposit: 'Dépôt minimum (FC)',
  min_withdrawal: 'Retrait minimum (FC)',
  withdrawal_fee_percent: 'Frais de retrait (%)',
  referral_commission_percent: 'Niveau 1 (%)',
  referral_level2_percent: 'Niveau 2 (%)',
  referral_level3_percent: 'Niveau 3 (%)',
  signup_bonus: "Bonus d'inscription (FC)",
};

const PERCENT_KEYS: RuleKey[] = ['withdrawal_fee_percent', 'referral_commission_percent', 'referral_level2_percent', 'referral_level3_percent'];

/** Règles chiffrées (dépôt, retrait, parrainage, bonus), modifiables sur place. */
export function WalletRulesCard({ title, keys, hint }: { title: string; keys: RuleKey[]; hint?: string }) {
  const { user } = useAuth();
  const { settings, reload } = useSettings();
  const { notify } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setValues(Object.fromEntries(keys.map((k) => [k, String(Number(settings[k] ?? 0))])));
  }, [settings]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !user) return;
    const payload: Record<string, number> = {};
    for (const k of keys) {
      const v = Number(values[k]);
      if (!Number.isFinite(v) || v < 0 || (PERCENT_KEYS.includes(k) && v > 100)) return setError(`${LABELS[k]} : valeur invalide.`);
      payload[k] = v;
    }
    setBusy(true);
    setError(null);
    try {
      await adminUpdateSettings(user.id, payload);
      await reload();
      notify('success', 'Règles enregistrées.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mb-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="font-semibold text-slate-900">{title}</p>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
      <div className="mb-3" />
      <div className="grid gap-3 sm:grid-cols-3">
        {keys.map((k) => (
          <label key={k} className="block">
            <span className="label">{LABELS[k]}</span>
            <input
              type="number"
              min={0}
              max={PERCENT_KEYS.includes(k) ? 100 : undefined}
              step={PERCENT_KEYS.includes(k) ? '0.1' : '1'}
              inputMode="numeric"
              className="input"
              value={values[k] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            />
          </label>
        ))}
        <div className="flex items-end">
          <button className="btn w-full bg-green-700 text-white hover:bg-green-800" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Enregistrer
          </button>
        </div>
      </div>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </form>
  );
}
