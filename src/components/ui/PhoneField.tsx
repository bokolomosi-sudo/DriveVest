import { Lock, Phone } from 'lucide-react';
import { DEFAULT_COUNTRY_CODE } from '../../lib/phoneAuth';

const FIELD = 'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/30';
const INPUT = 'h-12 w-full min-w-0 bg-transparent text-base text-slate-900 sm:text-sm placeholder:text-slate-400 focus:outline-none';

/** Numéro de téléphone de RDC : l'indicatif +243 est fixe. */
export function PhoneField({ id, number, onNumberChange }: { id: string; number: string; onNumberChange: (value: string) => void }) {
  return (
    <div className={FIELD}>
      <Phone className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="shrink-0 border-r border-slate-200 pr-2 text-sm font-semibold text-slate-700">+{DEFAULT_COUNTRY_CODE}</span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required
        aria-label="Numéro de téléphone"
        className={INPUT}
        placeholder="Votre numéro"
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
      />
    </div>
  );
}

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
}) {
  return (
    <div className={FIELD}>
      <Lock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <input
        id={id}
        type="password"
        required
        aria-label={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={INPUT}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
