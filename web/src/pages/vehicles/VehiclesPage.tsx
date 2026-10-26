import { Car, Truck } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AnimatedTabs } from '../../components/animate-ui/tabs';
import FleetVehiclesTab from '../../components/fleet/FleetVehiclesTab';
import WorkshopVehiclesTab from '../../components/fleet/WorkshopVehiclesTab';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

type VehicleTab = 'taller' | 'flota';

const isVehicleTab = (value: string | null): value is VehicleTab =>
  value === 'taller' || value === 'flota';

/**
 * Vehículos separa dos parques que no comparten consultas: el taller (clientes,
 * OT y cotizaciones) y la flota interna de la empresa. La pestaña activa vive
 * en la URL para que el panel pueda enlazar directo a una ficha de flota.
 */
export const VehiclesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const canWorkshop = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'read') || hasUserPermission(user, 'comercial', 'read')),
  );
  const canFleet = Boolean(user && hasUserPermission(user, 'flota', 'read'));
  const requestedTab = searchParams.get('tab');
  const fallbackTab: VehicleTab = canWorkshop ? 'taller' : 'flota';
  const activeTab: VehicleTab =
    isVehicleTab(requestedTab) &&
    ((requestedTab === 'taller' && canWorkshop) || (requestedTab === 'flota' && canFleet))
      ? requestedTab
      : fallbackTab;

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', activeTab);
        return next;
      },
      { replace: true },
    );
  }, [activeTab, requestedTab, setSearchParams]);

  const tabs = [
    ...(canWorkshop
      ? [{ value: 'taller' as const, label: 'Taller', icon: Car }]
      : []),
    ...(canFleet ? [{ value: 'flota' as const, label: 'Flota', icon: Truck }] : []),
  ];

  const handleTabChange = (value: VehicleTab): void => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="page-banner">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Parque vehicular</p>
          <h1 className="mt-1">Vehículos</h1>
        </div>
        {tabs.length > 1 && (
          <AnimatedTabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={handleTabChange}
            layoutId="vehicles-active-tab"
            ariaLabel="Tipo de vehículos"
            size="md"
            className="relative z-[1] ml-auto"
          />
        )}
      </header>

      {activeTab === 'flota' && canFleet ? (
        <FleetVehiclesTab key="flota" />
      ) : canWorkshop ? (
        <WorkshopVehiclesTab key="taller" />
      ) : null}
    </div>
  );
};

export default VehiclesPage;
