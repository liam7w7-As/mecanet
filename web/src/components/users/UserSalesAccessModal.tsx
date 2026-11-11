import { AlertCircle, CalendarClock, FileText, Link2, LoaderCircle, Share2, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useQuotations } from '../../hooks/useQuotations';
import {
  useCreateUserSalesAccess,
  useRevokeUserSalesAccess,
  useUserSalesAccess,
} from '../../hooks/useSalesAccess';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { AdminUser } from '../../hooks/useUsers';
import type { SalesAccessScopeType } from '@unithor/shared';

interface Props {
  user: AdminUser;
  onClose: () => void;
}

interface SelectableRecord {
  id: number;
  codigo: string;
  detalle: string;
  estado: string;
}

const SCOPE_LABEL: Record<SalesAccessScopeType, string> = {
  work_order: 'Orden de trabajo',
  quotation: 'Cotización',
};

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Administra desde la ficha de una vendedora los registros puntuales que puede
 * ver y gestionar sin cambiar la propiedad de la OT/COT.
 */
export default function UserSalesAccessModal({ user, onClose }: Props) {
  const [scopeType, setScopeType] = useState<SalesAccessScopeType>('work_order');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectableRecord | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [includeLinked, setIncludeLinked] = useState(true);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const grantsQuery = useUserSalesAccess(user.id);
  const workOrdersQuery = useWorkOrders(
    { page: 1, pageSize: 8, search: debouncedSearch || undefined },
    scopeType === 'work_order' && debouncedSearch.length >= 2,
  );
  const quotationsQuery = useQuotations(
    { page: 1, pageSize: 8, search: debouncedSearch || undefined },
    scopeType === 'quotation' && debouncedSearch.length >= 2,
  );
  const createMutation = useCreateUserSalesAccess(user.id);
  const revokeMutation = useRevokeUserSalesAccess(user.id);

  const activeQuery = scopeType === 'work_order' ? workOrdersQuery : quotationsQuery;
  const workOrderRecords: SelectableRecord[] = (workOrdersQuery.data?.items ?? []).map((workOrder) => ({
    id: workOrder.id,
    codigo: workOrder.codigo,
    detalle: [workOrder.client?.nombre, workOrder.vehicle?.patente].filter(Boolean).join(' · ') || 'Sin cliente',
    estado: workOrder.estado,
  }));
  const quotationRecords: SelectableRecord[] = (quotationsQuery.data?.items ?? []).map((quotation) => ({
    id: quotation.id,
    codigo: quotation.codigo,
    detalle: [quotation.client?.nombre, quotation.vehicle?.patente].filter(Boolean).join(' · ') || 'Sin cliente',
    estado: quotation.estadoPago,
  }));
  const records: SelectableRecord[] = scopeType === 'work_order' ? workOrderRecords : quotationRecords;

  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose,
    isPending: createMutation.isPending || revokeMutation.isPending,
  });

  const changeScope = (next: SalesAccessScopeType): void => {
    setScopeType(next);
    setSearch('');
    setSelected(null);
  };

  const grantCount = grantsQuery.data?.length ?? 0;
  const selectedId = selected?.id;
  const pending = createMutation.isPending || revokeMutation.isPending;
  const error = createMutation.error ?? revokeMutation.error ?? grantsQuery.error;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!selected || pending) return;
    createMutation.mutate(
      {
        scopeType,
        targetId: selected.id,
        includeLinkedRecord: includeLinked,
        expiresAt: expiresAt || null,
      },
      {
        onSuccess: () => {
          setSelected(null);
          setSearch('');
          setExpiresAt('');
        },
      },
    );
  };

  return createPortal(
    <div className="reception-edit-overlay reference-modal-overlay sales-access-overlay">
      <button
        type="button"
        className="reception-edit-backdrop"
        tabIndex={-1}
        onClick={onClose}
        aria-label="Cerrar accesos OT/COT"
      />
      <section
        ref={setPanelNode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-sales-access-title"
        tabIndex={-1}
        className="reception-edit-dialog reference-dialog reference-form-dialog administration-form sales-access-dialog"
        aria-busy={pending}
      >
        <ModalHeader
          id="user-sales-access-title"
          title="Accesos OT/COT"
          description={<><span>@{user.username}</span><span aria-hidden="true"> · </span><span>{user.nombre}</span></>}
          badge={<Share2 aria-hidden="true" />}
          onClose={onClose}
          closeDisabled={pending}
        />
        <form onSubmit={submit}>
          <fieldset className="reception-edit-body" disabled={pending}>
            {error && (
              <p className="administration-alert" role="alert">
                <AlertCircle aria-hidden="true" />
                {getApiErrorMessage(error, 'No fue posible administrar los accesos.')}
              </p>
            )}

            <p className="sales-access-hint">
              La vendedora podrá ver y gestionar los registros compartidos sin que cambie su propietario original.
            </p>

            <div className="sales-access-section">
              <h3>Tipo de registro</h3>
              <div className="sales-access-scope" role="group" aria-label="Tipo de registro a compartir">
                <button type="button" aria-pressed={scopeType === 'work_order'} onClick={() => changeScope('work_order')}>
                  <Wrench aria-hidden="true" />Orden de trabajo
                </button>
                <button type="button" aria-pressed={scopeType === 'quotation'} onClick={() => changeScope('quotation')}>
                  <FileText aria-hidden="true" />Cotización
                </button>
              </div>
            </div>

            <div className="sales-access-section">
              <h3>Buscar {scopeType === 'work_order' ? 'orden de trabajo' : 'cotización'}</h3>
              <label className="sales-access-search">
                <span className="sr-only">Buscar registro</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Código, cliente o patente (mínimo 2 caracteres)"
                />
              </label>

              {selected ? (
                <div className="sales-access-selected">
                  <span>
                    <strong>{selected.codigo}</strong>
                    <small>{selected.detalle}</small>
                  </span>
                  <button type="button" onClick={() => setSelected(null)}>Quitar</button>
                </div>
              ) : debouncedSearch.length < 2 ? (
                <p className="sales-access-hint">Escribe al menos 2 caracteres para buscar.</p>
              ) : activeQuery.isFetching ? (
                <p className="sales-access-hint">Buscando registros…</p>
              ) : records.length === 0 ? (
                <p className="sales-access-empty">No se encontraron registros con ese criterio.</p>
              ) : (
                <div className="sales-access-results" role="listbox" aria-label="Resultados de búsqueda">
                  {records.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      role="option"
                      aria-selected={selectedId === record.id}
                      className="sales-access-result"
                      onClick={() => setSelected(record)}
                    >
                      <span><strong>{record.codigo}</strong><small>{record.detalle}</small></span>
                      <span className="sales-access-result-state">{record.estado}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="administration-form-grid">
              <label htmlFor="sales-access-expiry">
                Vence el (opcional)
                <input
                  id="sales-access-expiry"
                  type="date"
                  min={today()}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <label className="sales-access-check" htmlFor="sales-access-linked">
                <input
                  id="sales-access-linked"
                  type="checkbox"
                  checked={includeLinked}
                  onChange={(event) => setIncludeLinked(event.target.checked)}
                />
                Incluir {scopeType === 'work_order' ? 'la cotización vinculada' : 'la OT vinculada'}
              </label>
            </div>

            <div className="sales-access-section">
              <h3>
                <CalendarClock aria-hidden="true" />
                Accesos otorgados ({grantCount})
              </h3>
              {grantsQuery.isPending ? (
                <p className="sales-access-hint">Cargando accesos…</p>
              ) : grantCount === 0 ? (
                <p className="sales-access-empty">Esta vendedora todavía no tiene registros compartidos.</p>
              ) : (
                <div className="sales-access-list">
                  {grantsQuery.data?.map((grant) => (
                    <div key={grant.id} className="sales-access-item" data-expired={grant.expired}>
                      <div>
                        <strong>{grant.targetCodigo ?? `Registro #${grant.targetId}`}</strong>
                        <small>
                          {SCOPE_LABEL[grant.scopeType]}
                          {' · '}
                          {grant.expired
                            ? `Venció ${formatDate(grant.expiresAt)}`
                            : grant.expiresAt
                              ? `Vence ${formatDate(grant.expiresAt)}`
                              : 'Sin vencimiento'}
                          {grant.grantedByName ? ` · Otorgado por ${grant.grantedByName}` : ''}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate(grant.id)}
                        disabled={revokeMutation.isPending}
                        aria-label={`Revocar acceso a ${grant.targetCodigo ?? grant.targetId}`}
                      >
                        <Trash2 aria-hidden="true" />Revocar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </fieldset>

          <footer className="reception-edit-footer">
            <span role="status">
              {createMutation.isPending
                ? 'Compartiendo acceso…'
                : selected
                  ? `${selected.codigo} listo para compartir`
                  : 'Selecciona un registro'}
            </span>
            <div>
              <button type="button" className="reception-secondary-button" onClick={onClose} disabled={pending}>
                Cerrar
              </button>
              <button type="submit" className="reception-primary-button" disabled={!selected || pending}>
                {createMutation.isPending
                  ? <LoaderCircle className="animate-spin" aria-hidden="true" />
                  : <Link2 aria-hidden="true" />}
                Compartir acceso
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
