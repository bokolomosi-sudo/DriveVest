import { useState, type FormEvent } from 'react';
import { Building2, MapPin, User } from 'lucide-react';
import { Alert, Spinner } from '../ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { toErrorMessage } from '../../lib/errors';
import { completeMyProfile } from '../../services/account';

const FIELD = 'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/30';
const INPUT = 'h-12 w-full min-w-0 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm';

/** Nom, province (liste définie par l'admin) et ville du membre. */
export function MemberInfoForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { settings } = useSettings();
  const provinces = settings?.provinces ?? [];
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [province, setProvince] = useState(profile?.province ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (fullName.trim().length < 2) return setError('Indiquez votre nom complet.');
    if (!province) return setError('Choisissez votre province.');
    if (city.trim().length < 2) return setError('Indiquez votre ville.');
    setBusy(true);
    try {
      await completeMyProfile({ fullName: fullName.trim(), province, city: city.trim() });
      await refreshProfile();
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={FIELD}>
        <User className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <input
          aria-label="Nom complet"
          autoComplete="name"
          maxLength={120}
          className={INPUT}
          placeholder="Nom complet"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className={FIELD}>
        <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <select
          aria-label="Province"
          className={`${INPUT} ${province ? '' : 'text-slate-400'}`}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        >
          <option value="" disabled>Choisissez votre province</option>
          {provinces.map((p) => <option key={p} value={p} className="text-slate-900">{p}</option>)}
        </select>
      </div>
      <div className={FIELD}>
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <input
          aria-label="Ville"
          autoComplete="address-level2"
          maxLength={80}
          className={INPUT}
          placeholder="Ville"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary h-12 w-full rounded-xl text-base shadow-md" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />} {submitLabel}
      </button>
    </form>
  );
}
