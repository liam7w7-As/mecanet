import { Car, ChevronDown, Eye, Pencil, Trash2 } from 'lucide-react';

import type { ReactNode } from 'react';

interface Props {
  number: number;
  plate: string;
  privateSubline?: ReactNode;
  name: string;
  reference?: string;
  owner: string;
  ownerLabel: string;
  facts: ReactNode;
  status: ReactNode;
  alerts?: ReactNode;
  detailFacts?: ReadonlyArray<{ label: string; value: string }>;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** The summary expands locally; the explicit record action opens the existing modal. */
export default function VehicleDirectoryRow({ number, plate, privateSubline, name, reference, owner, ownerLabel, facts, status, alerts, detailFacts, onOpen, onEdit, onDelete }: Props) {
  return (
    <article className="vehicle-directory-row vehicle-reference-row">
      <details className="vehicle-directory-accordion">
        <summary className="vehicle-directory-summary" aria-label={`Desplegar resumen de ${plate}`}>
          <span className="vehicle-directory-number">#{number}</span>
          <span className="vehicle-directory-symbol" aria-hidden="true"><Car /></span>
          <span className="vehicle-directory-identity">
            <strong>{plate}</strong>
            {privateSubline && <small className="vehicle-directory-private">{privateSubline}</small>}
            <span>{name}</span>
          </span>
          <span className="vehicle-directory-owner"><small>{ownerLabel}</small><span>{owner}</span></span>
          <span className="vehicle-directory-meta">
            <span>{status}</span>
            {alerts && <span className="vehicle-directory-alert">{alerts}</span>}
          </span>
          <span className="vehicle-directory-chevron" aria-hidden="true"><ChevronDown /></span>
        </summary>
        <div className="vehicle-directory-expanded">
          <dl className="vehicle-directory-expanded-facts">
            {detailFacts ? detailFacts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>) : <div><dt>Información del vehículo</dt><dd>{facts}</dd></div>}
          </dl>
          {reference && <p className="vehicle-directory-expanded-reference">{reference}</p>}
          <div className="vehicle-directory-expanded-footer">
            <p className="vehicle-directory-hint">Consulta el detalle y su historial en la ficha completa.</p>
            <footer className="vehicle-directory-actions">
              <button type="button" className="vehicle-directory-profile-action" aria-label={`Abrir ficha de ${plate}`} title="Ver ficha completa" onClick={onOpen}><Eye aria-hidden="true" /><span>Ver ficha</span></button>
              {onEdit && <button type="button" aria-label={`Editar ${plate}`} title="Editar vehículo" onClick={onEdit}><Pencil aria-hidden="true" /></button>}
              {onDelete && <button type="button" className="vehicle-directory-delete" aria-label={`Eliminar ${plate}`} title="Eliminar vehículo" onClick={onDelete}><Trash2 aria-hidden="true" /></button>}
            </footer>
          </div>
        </div>
      </details>
    </article>
  );
}
