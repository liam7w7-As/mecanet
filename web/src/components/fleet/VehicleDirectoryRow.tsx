import { ChevronRight, Pencil, Trash2 } from 'lucide-react';

import type { ReactNode } from 'react';

interface Props {
  number: number;
  plate: string;
  name: string;
  reference?: string;
  owner: string;
  ownerLabel: string;
  facts: ReactNode;
  status: ReactNode;
  alerts?: ReactNode;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Compact reference row; the existing full record continues to open in its modal. */
export default function VehicleDirectoryRow({ number, plate, name, reference, owner, ownerLabel, facts, status, alerts, onOpen, onEdit, onDelete }: Props) {
  return (
    <article className="vehicle-directory-row">
      <button type="button" className="vehicle-directory-open" aria-label={`Abrir ficha de ${plate}`} onClick={onOpen} />
      <span className="vehicle-directory-number">#{number}</span>
      <div className="vehicle-directory-identity"><strong>{plate}</strong><span>{name}</span>{reference && <small>{reference}</small>}</div>
      <div className="vehicle-directory-owner"><small>{ownerLabel}</small><span>{owner}</span></div>
      <div className="vehicle-directory-meta"><div>{status}</div><p>{facts}</p>{alerts && <div className="vehicle-directory-alert">{alerts}</div>}</div>
      <footer className="vehicle-directory-actions">
        {onEdit && <button type="button" aria-label={`Editar ${plate}`} title="Editar vehículo" onClick={onEdit}><Pencil aria-hidden="true" /></button>}
        {onDelete && <button type="button" aria-label={`Eliminar ${plate}`} title="Eliminar vehículo" onClick={onDelete}><Trash2 aria-hidden="true" /></button>}
        <span className="vehicle-directory-chevron" aria-hidden="true"><ChevronRight /></span>
      </footer>
    </article>
  );
}
