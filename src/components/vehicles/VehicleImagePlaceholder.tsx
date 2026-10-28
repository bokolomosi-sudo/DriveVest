import { Car } from 'lucide-react';

export function VehicleImagePlaceholder({ label = 'Photo à venir' }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
      <Car className="h-10 w-10" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
