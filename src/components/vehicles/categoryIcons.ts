import { Bus, Car, CarFront, Gauge, Package, Truck, Zap, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  berlines: Car,
  'suv-4x4': CarFront,
  citadines: Car,
  'coupes-sportives': Gauge,
  'pick-up': Truck,
  utilitaires: Package,
  minibus: Bus,
  camions: Truck,
  'electriques-hybrides': Zap,
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? Car;
}
