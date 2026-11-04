import { UNIT_MEASURE_LABELS } from '@unithor/shared';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  History,
  Package,
  Pencil,
  Settings2,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useCatalogItemInventory, useStockMovements } from '../../hooks/useWarehouses';
import { formatClp, formatDateTime } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { CatalogItem, StockMovement } from '../../types/entities';

type DetailTab = 'summary' | 'inventory' | 'movements';

interface CatalogItemDetailModalProps {
  item: CatalogItem;
  canEdit: boolean;
  canAdjustStock: boolean;
  canViewInventory: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAdjustStock: () => void;
}

const TYPE_LABELS: Record<CatalogItem['tipo'], string> = {
  estandar: 'Servicio estándar',
  especifico: 'Servicio específico',
  parte: 'Repuesto / Parte',
};

const TYPE_ICONS = {
  estandar: Wrench,
  especifico: Settings2,
  parte: Package,
} as const;

const MOVEMENT_LABELS: Record<StockMovement['tipo'], string> = {
  ingreso: 'Ingreso',
  salida: 'Salida',
  ajuste: 'Ajuste',
  traslado_salida: 'Traslado salida',
  traslado_ingreso: 'Traslado ingreso',
  consumo_ot: 'Consumo OT',
};

const isOutgoingMovement = (movement: StockMovement): boolean =>
  movement.tipo === 'salida' ||
  movement.tipo === 'traslado_salida' ||
  movement.tipo === 'consumo_ot';

export const CatalogItemDetailModal = ({
  item,
  canEdit,
  canAdjustStock,
  canViewInventory,
  onClose,
  onEdit,
  onAdjustStock,
}: CatalogItemDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const isPart = item.tipo === 'parte';
  const inventoryQuery = useCatalogItemInventory(
    isPart ? item.id : null,
    isPart && canViewInventory,
  );
  const movementsQuery = useStockMovements(
    { page: 1, pageSize: 12, catalogItemId: item.id },
    isPart && canViewInventory,
  );
  const TypeIcon = TYPE_ICONS[item.tipo];

  const tabs: Array<{ id: DetailTab; label: string; icon: typeof Boxes }> = [
    { id: 'summary', label: 'Resumen', icon: Boxes },
    ...(isPart
      ? [
          { id: 'inventory' as const, label: 'Existencias', icon: Warehouse },
          { id: 'movements' as const, label: 'Kardex', icon: History },
        ]
      : []),
  ];

  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return createPortal(
    <div className="reference-modal-overlay inventory-modal-overlay">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar detalle de catálogo"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        className="workspace-dialog reference-dialog inventory-profile-dialog relative flex w-full flex-col overflow-hidden bg-white shadow-2xl"
        role="dialog"
        tabIndex={-1}
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="catalog-detail-title"
      >
        <ModalHeader
          id="catalog-detail-heading"
          title="Detalle de ítem"
          onClose={onClose}
          closeLabel="Cerrar detalle"
        />
        <div className="inventory-profile-hero">
          <TypeIcon aria-hidden="true" />
          <div>
            <small>
              {TYPE_LABELS[item.tipo]} · {item.codigo ?? 'SIN CÓDIGO'}
            </small>
            <h2 id="catalog-detail-title">{item.nombre}</h2>
          </div>
        </div>

        <nav
          className="reference-dialog-tabs inventory-detail-tabs"
          aria-label="Secciones del item"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 border-b-2 px-1 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm ${
                  selected
                    ? 'border-brand-gold text-brand-primaryInk'
                    : 'border-transparent text-brand-muted hover:text-brand-ink'
                }`}
                aria-pressed={selected}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="reference-dialog-body inventory-profile-body">
          {activeTab === 'summary' && (
            <div className="space-y-5">
              <dl className="inventory-profile-facts">
                <div>
                  <dt>Código</dt>
                  <dd>{item.codigo ?? 'Sin código'}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{TYPE_LABELS[item.tipo]}</dd>
                </div>
                <div>
                  <dt>Precio de venta</dt>
                  <dd>{formatClp(item.precio)}</dd>
                </div>
                <div>
                  <dt>Unidad de medida</dt>
                  <dd>{UNIT_MEASURE_LABELS[item.unidadMedida]}</dd>
                </div>
                {isPart ? (
                  <>
                    <div>
                      <dt>Stock total</dt>
                      <dd>{item.stock} uds.</dd>
                    </div>
                    <div>
                      <dt>Stock mínimo</dt>
                      <dd>{item.stockMinimo} uds.</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Horas hombre estándar</dt>
                    <dd>
                      {item.horasHombreEstandar === null
                        ? 'Sin estimación'
                        : item.horasHombreEstandar + ' h / unidad'}
                    </dd>
                  </div>
                )}
              </dl>
              <div>
                <h3 className="text-sm font-bold text-brand-primaryInk">Descripción</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-brand-muted">
                  {item.descripcion || 'Este item no tiene una descripción registrada.'}
                </p>
              </div>
              <div className="grid gap-3 border-t border-brand-line pt-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-brand-muted">Creado:</span>{' '}
                  <strong className="text-brand-ink">{formatDateTime(item.createdAt)}</strong>
                </p>
                <p>
                  <span className="text-brand-muted">Última edición:</span>{' '}
                  <strong className="text-brand-ink">{formatDateTime(item.updatedAt)}</strong>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="space-y-4">
              {!canViewInventory ? (
                <div className="rounded-lg border border-brand-line bg-brand-line/40 p-5 text-center">
                  <Warehouse className="mx-auto h-8 w-8 text-brand-muted/40" aria-hidden="true" />
                  <p className="mt-2 font-semibold text-brand-ink">Existencias protegidas</p>
                  <p className="mt-1 text-sm text-brand-muted">
                    Su rol puede consultar el catálogo, pero no el detalle por almacén.
                  </p>
                </div>
              ) : inventoryQuery.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-16 animate-pulse rounded-lg bg-brand-pale" />
                  ))}
                </div>
              ) : inventoryQuery.isError ? (
                <p className="rounded-lg border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk">
                  No se pudo cargar la distribución del stock.
                </p>
              ) : (
                <div className="space-y-2">
                  {inventoryQuery.data?.map(({ warehouse, balance }) => {
                    const quantity = balance?.cantidad ?? 0;
                    return (
                      <div
                        key={warehouse.id}
                        className="flex items-center gap-3 rounded-lg border border-brand-line px-4 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-line/40 text-brand-primaryInk">
                          <Warehouse className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-brand-ink">
                            {warehouse.nombre}
                          </span>
                          <span className="block font-mono text-xs text-brand-muted">
                            {warehouse.codigo}
                            {warehouse.direccion ? ` · ${warehouse.direccion}` : ''}
                          </span>
                        </span>
                        <span
                          className={`rounded-md px-2.5 py-1 text-sm font-bold ${quantity > 0 ? 'bg-brand-mintPale text-brand-mintInk' : 'bg-brand-coralPale text-brand-coralInk'}`}
                        >
                          {quantity} uds.
                        </span>
                      </div>
                    );
                  })}
                  {(inventoryQuery.data?.length ?? 0) === 0 && (
                    <p className="py-8 text-center text-sm text-brand-muted">
                      No hay almacenes registrados.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div>
              {!canViewInventory ? (
                <div className="rounded-lg border border-brand-line bg-brand-line/40 p-5 text-center">
                  <History className="mx-auto h-8 w-8 text-brand-muted/40" aria-hidden="true" />
                  <p className="mt-2 font-semibold text-brand-ink">Kardex protegido</p>
                  <p className="mt-1 text-sm text-brand-muted">
                    No tiene permiso para consultar movimientos de almacén.
                  </p>
                </div>
              ) : movementsQuery.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-lg bg-brand-pale" />
                  ))}
                </div>
              ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
                <div className="py-10 text-center">
                  <History className="mx-auto h-9 w-9 text-brand-muted/40" aria-hidden="true" />
                  <p className="mt-2 text-sm text-brand-muted">
                    Aún no hay movimientos para este repuesto.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-brand-line">
                  {movementsQuery.data?.items.map((movement) => {
                    const outgoing = isOutgoingMovement(movement);
                    return (
                      <div
                        key={movement.id}
                        className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_150px_90px] sm:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${outgoing ? 'bg-brand-coralPale text-brand-coralInk' : 'bg-brand-mintPale text-brand-mintInk'}`}
                          >
                            {outgoing ? (
                              <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-brand-ink">
                              {MOVEMENT_LABELS[movement.tipo]} · {movement.motivo}
                            </span>
                            <span className="block truncate text-xs text-brand-muted">
                              {movement.warehouseCodigo} · {formatDateTime(movement.fecha)}
                            </span>
                          </span>
                        </div>
                        <span className="text-xs text-brand-muted sm:text-right">
                          Saldo resultante:{' '}
                          <strong className="text-brand-ink">{movement.saldoResultante}</strong>
                        </span>
                        <span
                          className={`text-right text-sm font-bold ${outgoing ? 'text-brand-coralInk' : 'text-brand-mintInk'}`}
                        >
                          {outgoing ? '-' : '+'}
                          {movement.cantidad}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="reference-dialog-footer inventory-profile-footer">
          {isPart && canViewInventory ? (
            <Link
              to="/warehouses"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-primaryInk hover:bg-white"
              onClick={onClose}
            >
              Abrir almacenes <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {isPart && canAdjustStock && (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover"
                onClick={onAdjustStock}
              >
                <Boxes className="h-4 w-4" aria-hidden="true" /> Movimiento
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover"
                onClick={onEdit}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
              </button>
            )}
          </div>
        </footer>
      </motion.section>
    </div>,
    document.body,
  );
};

export default CatalogItemDetailModal;
