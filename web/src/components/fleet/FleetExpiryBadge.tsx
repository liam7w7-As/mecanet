import { CalendarClock } from 'lucide-react';

import type { FleetExpiryInfo } from '../../types/entities';

interface FleetExpiryBadgeProps {
  expiry: FleetExpiryInfo;
  className?: string;
}

const plural = (days: number): string => (days === 1 ? 'día' : 'días');

const getLabel = (expiry: FleetExpiryInfo): string => {
  const days = expiry.daysRemaining ?? 0;

  switch (expiry.state) {
    case 'vencido':
      return `Vencido hace ${Math.abs(days)} ${plural(Math.abs(days))}`;
    case 'vence_hoy':
      return 'Vence hoy';
    case 'critico':
      return days === 0 ? 'Vence hoy' : `Vence en ${days} ${plural(days)}`;
    case 'advertencia':
      return `Vence en ${days} ${plural(days)}`;
    case 'vigente':
      return `${days} ${plural(days)} restantes`;
    case 'sin_vencimiento':
    default:
      return 'Sin vencimiento';
  }
};

const getClassName = (expiry: FleetExpiryInfo): string => {
  switch (expiry.state) {
    case 'vencido':
    case 'vence_hoy':
    case 'critico':
      return 'border-brand-coral/30 bg-brand-coralPale text-brand-coralInk';
    case 'advertencia':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'vigente':
      return 'border-brand-mint/30 bg-brand-mintPale text-brand-mintInk';
    case 'sin_vencimiento':
    default:
      return 'border-brand-line bg-brand-pale text-brand-muted';
  }
};

/** Estado de vencimiento compartido por la lista y la ficha de flota. */
export const FleetExpiryBadge = ({ expiry, className = '' }: FleetExpiryBadgeProps) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${getClassName(expiry)} ${className}`}
  >
    <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
    {getLabel(expiry)}
  </span>
);

export default FleetExpiryBadge;
