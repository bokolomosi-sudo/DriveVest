import type { ReactNode } from 'react';
import type { Tone } from '../../lib/labels';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-night-50 text-night-700 ring-night-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-accent-50 text-accent-800 ring-accent-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}
