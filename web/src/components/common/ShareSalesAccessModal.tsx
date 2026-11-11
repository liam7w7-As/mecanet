import { AlertCircle, CalendarClock, Link2, LoaderCircle, Share2, Trash2, UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  useCreateRecordSalesAccess,
  useRecordSalesAccess,
  useRevokeRecordSalesAccess,
  useSalesAdvisors,
} from '../../hooks/useSalesAccess';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { SalesAccessScopeType } from '@unithor/shared';

interface Props {
  scopeType: SalesAccessScopeType;
  targetId: number;
  codigo: string;
  onClose: () => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Comparte una OT/COT puntual con una o más vendedoras desde su propio detalle.
 * La vendedora recibe acceso de gestión, no la propiedad del registro.
 */
export default function ShareSalesAccessModal({ scopeType, targetId, codigo, onClose }: Props) {
  const [userId, setUserId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [includeLinked, setIncludeLinked] = useState(true);

  const advisorsQuery = useSalesAdvisors();
  const grantsQuery = useRecordSalesAccess(scopeType, targetId);
  const createMutation = useCreateRecordSalesAccess(scopeType, targetId);
  const revokeMutation = useRevokeRecordSalesAccess(scopeType, targetId);

  const pending = createMutation.isPending || revokeMutation.isPending;
  const error = createMutation.error ?? revokeMutation.error ?? grantsQuery.error;

  const setPanelNode = useModalOverlay({ isOpen: true, onClose, isPending: pending });

  const grantCount = grantsQuery.data?.length ?? 0;
  const linkedLabel = scopeType === 'work_order' ? 'la cotización vinculada' : 'la OT vinculada';

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!userId || pending) return;
    createMutation.mutate(
      {
        userId: Number(userId),
        includeLinkedRecord: includeLinked,
        expiresAt: expiresAt || null,
      },
      {
        onSuccess: () => {
          setUserId('');
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
        aria-label="Cerrar compartir acceso"
      />
      <section
        ref={setPanelNode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sales-access-title"
        tabIndex={-1}
        className="reception-edit-dialog reference-dialog reference-form-dialog administration-form sales-access-dialog"
        aria-busy={pending}
      >
        <ModalHeader
          id="share-sales-access-title"
          title="Compartir acceso"
          description={<><span>{codigo}</span><span aria-hidden="true"> · </span><span>{scopeType === 'work_order' ? 'Orden de trabajo' : 'Cotización'}</span></>}
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
              La vendedora podrá ver y gestionar {codigo}. La propiedad del registro no cambia.
            </p>

            <div className="administration-form-grid">
              <label htmlFor="share-sales-advisor">
                Vendedora
                <select
                  id="share-sales-advisor"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  disabled={advisorsQuery.isPending || advisorsQuery.isError}
                >
                  <option value="">
                    {advisorsQuery.isPending
                      ? 'Cargando vendedoras…'
                      : advisorsQuery.isError
                        ? 'No se pudieron cargar las vendedoras'
                        : 'Selecciona una vendedora'}
                  </option>
                  {advisorsQuery.data?.map((advisor) => (
                    <option key={advisor.id} value={advisor.id}>
                      {advisor.nombre} (@{advisor.username})
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="share-sales-expiry">
                Vence el (opcional)
                <input
                  id="share-sales-expiry"
                  type="date"
                  min={today()}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <label className="sales-access-check administration-wide" htmlFor="share-sales-linked">
                <input
                  id="share-sales-linked"
                  type="checkbox"
                  checked={includeLinked}
                  onChange={(event) => setIncludeLinked(event.target.checked)}
                />
                Compartir también {linkedLabel}
              </label>
            </div>

            {advisorsQuery.isError && (
              <p className="sales-access-hint" role="alert">
                No se pudo cargar el listado de vendedoras activas.
                <button type="button" className="sales-access-link" onClick={() => void advisorsQuery.refetch()}>
                  Reintentar
                </button>
              </p>
            )}

            <div className="sales-access-section">
              <h3>
                <CalendarClock aria-hidden="true" />
                Vendedoras con acceso ({grantCount})
              </h3>
              {grantsQuery.isPending ? (
                <p className="sales-access-hint">Cargando accesos…</p>
              ) : grantCount === 0 ? (
                <p className="sales-access-empty">
                  <UserRoundPlus aria-hidden="true" />Este registro todavía no está compartido con vendedoras.
                </p>
              ) : (
                <div className="sales-access-list">
                  {grantsQuery.data?.map((grant) => (
                    <div key={grant.id} className="sales-access-item" data-expired={grant.expired}>
                      <div>
                        <strong>{grant.nombre}</strong>
                        <small>
                          @{grant.username}
                          {' · '}
                          {grant.expired
                            ? `Venció ${formatDate(grant.expiresAt)}`
                            : grant.expiresAt
                              ? `Vence ${formatDate(grant.expiresAt)}`
                              : 'Sin vencimiento'}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate(grant.id)}
                        disabled={revokeMutation.isPending}
                        aria-label={`Revocar acceso a ${grant.nombre}`}
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
                : userId
                  ? 'Listo para compartir'
                  : 'Selecciona una vendedora'}
            </span>
            <div>
              <button type="button" className="reception-secondary-button" onClick={onClose} disabled={pending}>
                Cerrar
              </button>
              <button type="submit" className="reception-primary-button" disabled={!userId || pending}>
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
