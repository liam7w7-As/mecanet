import { Check, ChevronDown, Edit2, PackagePlus, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useAddWorkOrderItemMutation, useCatalogItems, useUpdateWorkOrderAccCustodyMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { CatalogItem, WorkOrderWorksheetItem } from '../../types/entities';
import type { ReactNode } from 'react';

interface Props {
  compact?: boolean;
  workOrderId: number;
  items: WorkOrderWorksheetItem[];
  mechanics: Array<{ id: number; nombre: string }>;
  canManage: boolean;
  closed: boolean;
  onSuggestPrice?: (itemId: number) => void;
  onState?: (id: number, dirty: boolean, pending: boolean) => void;
  assignedToOrder?: boolean;
  visibleItemIds?: readonly number[];
  renderExecution?: (item: WorkOrderWorksheetItem) => ReactNode;
}

export default function WorkOrderAccSection({
  workOrderId,
  items,
  canManage,
  closed,
  onSuggestPrice,
  onState,
  assignedToOrder = false,
  visibleItemIds,
  renderExecution,
  compact = false,
  mechanics,
}: Props) {
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canSupervise = Boolean(canManage && canUpdate && user && ['jefe', 'admin', 'desarrollador'].includes(user.role));
  const canSeePrice = !compact || Boolean(user && ['jefe', 'admin', 'desarrollador'].includes(user.role));
  const canDeliver = user?.role === 'bodeguero' && canUpdate && !closed;
  const canReceive = (item: WorkOrderWorksheetItem) => !item.expressStockReturnedAt && !closed && canUpdate && user?.role === 'mecanico' && Boolean(
    item.canReceiveCustody ?? (assignedToOrder || item.canWork || item.assignedUser?.id === user.id || item.assignments?.some((entry) => entry.active && entry.userId === user.id)),
  );
  const custodyMutation = useUpdateWorkOrderAccCustodyMutation();
  const addItemMutation = useAddWorkOrderItemMutation();

  const [activeNoteModal, setActiveNoteModal] = useState<{
    itemId: number;
    title: string;
    note: string;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const pending = custodyMutation.isPending || addItemMutation.isPending;
  const notePanel = useModalOverlay({ isOpen: Boolean(activeNoteModal), isPending: pending, onClose: () => setActiveNoteModal(null) });
  // + Nuevo autocomplete search state
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [partSearch, setPartSearch] = useState('');
  const partsQuery = useCatalogItems(partSearch, 'parte', 1, undefined, showAddSearch && canSupervise && !closed);
  useEffect(() => { onState?.(-2, Boolean(activeNoteModal || (showAddSearch && partSearch.trim())), pending); }, [activeNoteModal, showAddSearch, partSearch, pending, onState]);
  useEffect(() => () => onState?.(-2, false, false), [onState]);

  const handleToggleDelivered = (item: WorkOrderWorksheetItem) => {
    const isDelivered = Boolean(item.entregadoBodegaAt ?? item.custodyBodegueroDeliveredAt) || item.entregadoBodega === true;
    if (!canDeliver || pending || isDelivered || item.expressStockReturnedAt) return;
    custodyMutation.mutate(
      {
        workOrderId,
        itemId: item.id,
        data: {
          entregado: true,
        },
      },
      {
        onSuccess: () =>
          notifySuccess(
            !isDelivered ? 'Repuesto marcado como entregado por bodega' : 'Entrega desmarcada',
          ),
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo actualizar entrega')),
      },
    );
  };

  const handleToggleReceived = (item: WorkOrderWorksheetItem) => {
    const isReceived = Boolean(item.recibidoTallerAt ?? item.custodyArmadorReceivedAt) || item.recibidoTaller === true;
    if (!canReceive(item) || pending || isReceived || !(item.entregadoBodegaAt ?? item.custodyBodegueroDeliveredAt ?? item.entregadoBodega)) return;
    custodyMutation.mutate(
      {
        workOrderId,
        itemId: item.id,
        data: {
          recibido: true,
        },
      },
      {
        onSuccess: () =>
          notifySuccess(
            !isReceived ? 'Repuesto recibido en taller por armador' : 'Recepción desmarcada',
          ),
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo actualizar recepción')),
      },
    );
  };

  const handleSaveReceptionNote = () => {
    if (!activeNoteModal || pending || noteDraft.trim().length > 1000) return;
    const item = items.find((entry) => entry.id === activeNoteModal.itemId);
    if (!item || !canReceive(item)) return;
    custodyMutation.mutate(
      {
        workOrderId,
        itemId: activeNoteModal.itemId,
        data: {
          notaEntrega: noteDraft.trim() || null,
        },
      },
      {
        onSuccess: () => {
          notifySuccess('Nota de recepción guardada');
          setActiveNoteModal(null);
          setNoteDraft('');
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo guardar la nota')),
      },
    );
  };

  const handleSelectCatalogPart = (part: CatalogItem) => {
    if (!canSupervise || closed || pending) return;
    addItemMutation.mutate(
      {
        workOrderId,
        data: {
          catalogItemId: part.id,
          tipoLinea: 'parte',
          division: 'ACC',
          subtipo: part.subtipo === 'a_pedido' ? 'a_pedido' : 'en_stock',
          esAPedido: part.subtipo === 'a_pedido',
          descripcion: part.nombre,
          cantidad: 1,
          precioUnitario: Number(part.precio || 0),
        },
      },
      {
        onSuccess: () => {
          notifySuccess(`Repuesto "${part.nombre}" añadido a la OT`);
          setShowAddSearch(false);
          setPartSearch('');
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo añadir el repuesto')),
      },
    );
  };

  return (
    <section aria-label="ACC · Accesorios y repuestos" className={`${compact ? 'work-order-division work-order-division--acc ' : ''}rounded-2xl border border-sky-200 bg-[#edf4f9] p-4 sm:p-5 shadow-xs mb-5`}>
      {/* Header ACC */}
      <div className={`${compact ? 'work-order-division-heading ' : ''}flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 pb-3 mb-4`}>
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-[#1d396a] px-3 py-1 text-sm font-black tracking-wider text-white shadow-xs">
            ACC:
          </span>
          <h3 className="text-xs font-semibold text-slate-700">
            Accesorios y Repuestos
          </h3>
        </div>
        {compact && <span className="work-order-division-count">{items.filter((item) => visibleItemIds === undefined || visibleItemIds.includes(item.id)).length} repuestos</span>}
      </div>

      {/* Table Header: Bodeguero & Armador */}
      <div className={`${compact ? 'division-acc-table-heading ' : ''}hidden md:grid md:grid-cols-[14rem_1fr_1fr_auto] gap-3 px-3 py-1.5 text-xs font-bold text-slate-600 mb-2`} aria-hidden="true">
        <span>Ítem</span>
        <div className="flex items-center gap-1">
          <span>Bodeguero</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </div>
        <div className="flex items-center gap-1">
          <span>Armador</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </div>
        <span className="text-right pr-2">Precio</span>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {items.map((item) => {
          const isDelivered = Boolean(
            item.entregadoBodegaAt ?? item.custodyBodegueroDeliveredAt ?? item.entregadoBodega,
          );
          const deliveredAt = item.entregadoBodegaAt ?? item.custodyBodegueroDeliveredAt;

          const isReceived = Boolean(
            item.recibidoTallerAt ?? item.custodyArmadorReceivedAt ?? item.recibidoTaller,
          );
          const receptionNote = item.notaEntrega ?? item.custodyArmadorNote;
          const delivererId = item.bodegueroUserId ?? item.custodyBodegueroId;
          const receiverId = item.armadorUserId ?? item.custodyArmadorId;
          const receivedAt = item.recibidoTallerAt ?? item.custodyArmadorReceivedAt;

          return (
            <div
              key={item.id}
              hidden={visibleItemIds !== undefined && !visibleItemIds.includes(item.id)}
              className={`${compact ? 'division-job ' : ''}rounded-xl border border-sky-300/60 bg-white/95 p-3.5 shadow-xs`}
            >
              <div className={`${compact ? 'division-job-main division-acc-main ' : ''}grid gap-3 md:grid-cols-[14rem_1fr_1fr_auto] md:items-center`}>
                {/* Item description & A Pedido badge */}
                <div className={compact ? 'division-job-name' : undefined}>
                  <div className="font-bold text-sm text-slate-800">{item.descripcion}</div>
                  {item.expressStockReturnedAt && <span className="text-xs font-semibold text-brand-mintInk">Enviado a stock general</span>}
                  {item.esAPedido && (
                    <span className="inline-block mt-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      ★ Por pedido a proveedor
                    </span>
                  )}
                </div>

                {/* Bodeguero Delivery Column */}
                <div className={`${compact ? 'division-acc-signature ' : ''}rounded-lg border border-slate-200 bg-slate-50/80 p-2.5`}>
                  {compact && <small>Bodega · {delivererId ? `Usuario #${delivererId}` : 'Sin firma'}</small>}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={!canDeliver || pending || isDelivered || Boolean(item.expressStockReturnedAt)}
                      onClick={() => handleToggleDelivered(item)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition shadow-2xs ${
                        isDelivered
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isDelivered ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 text-rose-500" />}
                      Entregado
                    </button>
                    {deliveredAt && (
                      <span className="text-[11px] font-semibold text-slate-600">
                        {formatDateTime(String(deliveredAt))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Armador Reception Column */}
                <div className={`${compact ? 'division-acc-signature ' : ''}rounded-lg border border-slate-200 bg-slate-50/80 p-2.5`}>
                  {compact && <small>Taller · {receiverId ? mechanics.find((entry) => entry.id === receiverId)?.nombre ?? `Técnico #${receiverId}` : 'Sin firma'}</small>}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={!canReceive(item) || pending || !isDelivered || isReceived}
                      title={!isDelivered ? 'Bodega debe confirmar primero la entrega' : undefined}
                      onClick={() => handleToggleReceived(item)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition shadow-2xs ${
                        isReceived
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isReceived ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 text-rose-500" />}
                      Recibido
                    </button>

                    {/* Note button [+] */}
                    <button
                      type="button"
                      title={receptionNote ? `Nota: ${receptionNote}` : 'Agregar nota de recepción'}
                      disabled={!canReceive(item) || pending}
                      onClick={() => {
                        setActiveNoteModal({
                          itemId: item.id,
                          title: `Nota de recepción: ${item.descripcion}`,
                          note: receptionNote || '',
                        });
                        setNoteDraft(receptionNote || '');
                      }}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold shadow-2xs ${
                        receptionNote
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                          : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Plus className="h-3 w-3" />
                      {receptionNote ? 'Nota ✓' : 'Nota +'}
                    </button>
                  </div>
                  {compact && receivedAt && <time dateTime={receivedAt}>{formatDateTime(String(receivedAt))}</time>}
                </div>

                {/* Price */}
                <div className={`${compact ? 'division-job-price ' : ''}flex items-center justify-between md:flex-col md:items-end gap-1 pl-2`}>
                  {compact && canSeePrice && item.precioUnitario !== undefined && <small>Precio unitario neto</small>}
                  {canSeePrice && item.precioUnitario !== undefined && <span className="font-extrabold text-sm text-slate-800">
                    {formatClp(item.precioUnitario ?? 0)}
                  </span>}
                  {onSuggestPrice && !item.expressStockReturnedAt && !closed && (canSupervise || canReceive(item)) && (
                    <button
                      type="button"
                      onClick={() => onSuggestPrice(item.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900"
                    >
                      <Edit2 className="h-3 w-3" />
                      Precio
                    </button>
                  )}
                </div>
              </div>
              {receptionNote && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">Recepción: {receptionNote}</p>}
              {!compact && receivedAt && <p className="mt-1 text-[11px] text-slate-500">Recibido: {formatDateTime(String(receivedAt))}</p>}
              {renderExecution && !item.expressStockReturnedAt && (compact ? <details className="division-acc-execution"><summary>Uso del repuesto, notas y adjuntos</summary>{renderExecution(item)}</details> : renderExecution(item))}
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="text-center py-4 text-xs text-slate-500 bg-white/70 rounded-xl border border-dashed border-slate-300">
            No hay repuestos o accesorios registrados en esta OT.
          </p>
        )}
      </div>

      {/* [+ Nuevo] Button & Autocomplete Search */}
      {!closed && canSupervise && (
        <div className="mt-4 pt-3 border-t border-sky-200/80">
          {!showAddSearch ? (
            <button
              type="button"
              onClick={() => setShowAddSearch(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition shadow-xs"
            >
              <PackagePlus className="h-4 w-4" />
              + Nuevo Repuesto / Accesorio
            </button>
          ) : (
            <div className="rounded-xl border border-blue-300 bg-white p-4 shadow-md max-w-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">
                  Buscador de catálogo
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddSearch(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕ Cerrar
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar por código, nombre (ej: Parachoque, Snorkel)..."
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                />
              </div>

              {/* Results dropdown */}
              <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                {partsQuery.data?.items?.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    disabled={addItemMutation.isPending}
                    onClick={() => handleSelectCatalogPart(part)}
                    className="w-full flex items-center justify-between p-2 text-left hover:bg-blue-50 transition text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{part.nombre}</div>
                      <div className="text-[10px] text-slate-500">
                        {part.codigo ? `${part.codigo} · ` : ''}Stock físico: <strong>{part.stock}</strong>
                        {part.subtipo === 'a_pedido' && ' (A pedido)'}
                      </div>
                    </div>
                    <span className="font-extrabold text-blue-700">
                      {formatClp(part.precio || 0)}
                    </span>
                  </button>
                ))}

                {partsQuery.data?.items?.length === 0 && (
                  <p className="p-3 text-center text-xs text-slate-400">
                    No se encontraron repuestos en catálogo.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reception Note Modal */}
      {activeNoteModal && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div ref={notePanel} role="dialog" aria-modal="true" aria-label={activeNoteModal.title} tabIndex={-1} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-base text-slate-900 mb-2">
              {activeNoteModal.title}
            </h3>
            <textarea
              className="w-full h-28 rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none mb-3"
              placeholder="Indique estado de la pieza, piezas faltantes o empaque..."
              value={noteDraft}
              aria-label="Nota de recepción"
              maxLength={1000}
              disabled={pending}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setActiveNoteModal(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || noteDraft.trim().length > 1000}
                onClick={handleSaveReceptionNote}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                Guardar Nota
              </button>
            </div>
          </div>
        </div>, document.body
      )}
    </section>
  );
}
