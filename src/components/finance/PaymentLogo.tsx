import { Smartphone } from 'lucide-react';

/** Logo du moyen de paiement : Airtel Money a son logo, les autres réseaux une icône de téléphone. */
export function PaymentLogo({ name, className = 'h-5 w-5' }: { name: string | null | undefined; className?: string }) {
  if (name && /airtel/i.test(name)) {
    return <img src="/logos/airtel.png" alt="" aria-hidden="true" className={`${className} shrink-0 object-contain`} />;
  }
  return <Smartphone className={`${className} shrink-0 text-green-700`} aria-hidden="true" />;
}

/** Nom du moyen de paiement précédé de son logo. */
export function PaymentName({ name, className = 'h-5 w-5' }: { name: string | null | undefined; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PaymentLogo name={name} className={className} />
      {name || '—'}
    </span>
  );
}
