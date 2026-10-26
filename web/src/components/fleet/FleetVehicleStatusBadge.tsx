import type { FleetVehicleStatus } from '../../types/entities';

interface FleetVehicleStatusBadgeProps {
  status: FleetVehicleStatus;
  className?: string;
}

const presentation: Record<
  FleetVehicleStatus,
  { label: string; className: string; dotClassName: string }
> = {
  disponible: {
    label: 'Disponible',
    className: 'border-brand-mint/30 bg-brand-mintPale text-brand-mintInk',
    dotClassName: 'bg-brand-mint',
  },
  en_mantencion: {
    label: 'En mantención',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  fuera_de_servicio: {
    label: 'Fuera de servicio',
    className: 'border-brand-coral/30 bg-brand-coralPale text-brand-coralInk',
    dotClassName: 'bg-brand-coral',
  },
};

export const FleetVehicleStatusBadge = ({
  status,
  className = '',
}: FleetVehicleStatusBadgeProps) => {
  const item = presentation[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${item.className} ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dotClassName}`} aria-hidden="true" />
      {item.label}
    </span>
  );
};

export default FleetVehicleStatusBadge;
