import { LogOut, UserRound, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';

import { getNavigationGroups } from './navigation';
import NotificationBell from './NotificationBell';
import { useLogoutMutation } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';
import PwaInstallButton from '../pwa/PwaInstallButton';

interface Props {
  onClose: () => void;
  onProfile: () => void;
  panelRef: (node: HTMLElement | null) => void;
}

const primaryPaths = new Set(['/dashboard', '/work-orders', '/work-orders/mine', '/quotations', '/vehicles']);

export default function MobileMoreSheet({ onClose, onProfile, panelRef }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogoutMutation();
  const node = useRef<HTMLElement | null>(null);
  const links = getNavigationGroups(user).flatMap((group) => group.items).filter((item) => !primaryPaths.has(item.path));

  useEffect(() => {
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !node.current) return;
      const controls = Array.from(node.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, []);

  return (
    <div className="mobile-more-overlay">
      <button className="mobile-more-backdrop" type="button" aria-label="Cerrar más opciones" tabIndex={-1} onClick={onClose} />
      <section ref={(element) => { node.current = element; panelRef(element); }} id="mobile-more" className="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" tabIndex={-1}>
        <div className="mobile-more-handle" aria-hidden="true" />
        <header><div><h2 id="mobile-more-title">Más opciones</h2><p>{user?.nombre}</p></div><button type="button" aria-label="Cerrar secciones" onClick={onClose}><X aria-hidden="true" /></button></header>
        <div className="mobile-more-body">
          <nav className="mobile-more-grid" aria-label="Otras secciones">
            {links.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} onClick={onClose} className={({ isActive }) => isActive ? 'active' : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}
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
