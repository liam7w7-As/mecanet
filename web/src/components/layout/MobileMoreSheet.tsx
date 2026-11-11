import { LogOut, UserRound, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { getNavigationGroups } from './navigation';
import NotificationBell from './NotificationBell';
import { useLogoutMutation } from '../../hooks/useAuth';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { getMobilePrimaryItems } from '../../hooks/useShellNavigation';
import { useAuthStore } from '../../stores/auth.store';
import PwaInstallButton from '../pwa/PwaInstallButton';

import type { BadgeKey } from './navigation';

interface Props {
  onClose: () => void;
  onProfile: () => void;
  panelRef: (node: HTMLElement | null) => void;
}

export default function MobileMoreSheet({ onClose, onProfile, panelRef }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogoutMutation();
  const dashboardQuery = useDashboardSummary(user);
  const inbox = dashboardQuery.data?.operationalInbox;
  const badgeCounts: Record<BadgeKey, number> = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
    finance: inbox?.counts.paymentVerifications ?? 0,
    warehouses: (inbox?.counts.warehouseDeliveries ?? 0) + (inbox?.counts.stockAlerts ?? 0),
    vehicles: inbox?.counts.fleetDocumentAlerts ?? 0,
  };
  const primaryPaths = new Set(getMobilePrimaryItems(user).map((item) => item.path));
  const links = getNavigationGroups(user).flatMap((group) => group.items).filter((item) => !primaryPaths.has(item.path));

  return (
    <div className="mobile-more-overlay">
      <button className="mobile-more-backdrop" type="button" aria-label="Cerrar más opciones" tabIndex={-1} onClick={onClose} />
      <section ref={panelRef} id="mobile-more" className="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" tabIndex={-1}>
        <div className="mobile-more-handle" aria-hidden="true" />
        <header><div><h2 id="mobile-more-title">Más opciones</h2><p>{user?.nombre}</p></div><button type="button" aria-label="Cerrar secciones" onClick={onClose}><X aria-hidden="true" /></button></header>
        <div className="mobile-more-body">
          <nav className="mobile-more-grid" aria-label="Otras secciones">
            {links.map(({ path, label, icon: Icon, badge }) => {
              const count = badge ? badgeCounts[badge] : 0;
              const badgeId = `mobile-more-badge-${badge}`;
              return <NavLink key={path} to={path} onClick={onClose} aria-label={label} aria-describedby={count > 0 ? badgeId : undefined} className={({ isActive }) => isActive ? 'active' : undefined}><Icon aria-hidden="true" /><span className="mobile-more-label">{label}</span>{count > 0 && <span id={badgeId} className="mobile-more-badge"><span aria-hidden="true">{count > 99 ? '99+' : count}</span><span className="sr-only">{count} pendientes</span></span>}</NavLink>;
            })}
          </nav>
          <div className="mobile-more-account" aria-label="Cuenta y aplicación">
            <button type="button" onClick={onProfile}><UserRound aria-hidden="true" /><span>Mi perfil</span></button>
            <div className="mobile-more-notifications"><NotificationBell /><span>Notificaciones</span></div>
            <PwaInstallButton className="mobile-more-install" />
            <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut aria-hidden="true" /><span>{logout.isPending ? 'Saliendo…' : 'Cerrar sesión'}</span></button>
          </div>
        </div>
      </section>
    </div>
  );
}
