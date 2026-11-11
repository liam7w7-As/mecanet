import { Pencil, Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { formatDateTime } from '../../lib/formatters';
import { getRoleLabel } from '../../lib/permissions';
import ModalHeader from '../common/ModalHeader';
import UserAvatar from '../common/UserAvatar';

import type { AdminUser } from '../../hooks/useUsers';

interface Props {
  user: AdminUser;
  canEdit: boolean;
  canManageAccess: boolean;
  onClose: () => void;
  onEdit: () => void;
  onManageAccess: () => void;
}

export default function UserDetailModal({ user, canEdit, canManageAccess, onClose, onEdit, onManageAccess }: Props) {
  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  const fields = [
    ['Nombre de usuario', `@${user.username}`], ['Correo electrónico', user.email],
    ['Rol asignado', getRoleLabel(user.role.nombre)], ['Estado', user.activo ? 'Activo' : 'Inactivo'],
    ['Creado', formatDateTime(user.createdAt)], ['Última actualización', formatDateTime(user.updatedAt)],
  ];
  return createPortal(<div className="reference-modal-overlay administration-modal-overlay users-reference-detail-overlay">
    <button type="button" className="administration-backdrop" tabIndex={-1} onClick={onClose} aria-label="Cerrar detalle de usuario" />
    <section ref={setPanelNode} role="dialog" aria-modal="true" aria-labelledby="user-detail-name" tabIndex={-1}
      className="reference-dialog administration-profile users-reference-detail">
      <ModalHeader id="user-detail-title" title="Detalle de usuario" onClose={onClose} />
      <div className="administration-profile-body">
        <div className="administration-profile-hero"><UserAvatar user={user} size="md" className="users-reference-avatar" />
          <div><small>Usuario · Cuenta #{user.id}</small><h2 id="user-detail-name">{user.nombre}</h2></div>
        </div>
        <dl className="administration-facts">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
      <footer className="administration-profile-footer">
        <button type="button" className="administration-secondary" onClick={onClose}>Cerrar</button>
        {canManageAccess && user.role.nombre === 'vendedor' && (
          <button type="button" className="administration-secondary" onClick={onManageAccess}>
            <Share2 aria-hidden="true" />Accesos OT/COT
          </button>
        )}
        {canEdit && <button type="button" className="administration-primary" onClick={onEdit}><Pencil aria-hidden="true" />Editar usuario</button>}
      </footer>
    </section>
  </div>, document.body);
}
