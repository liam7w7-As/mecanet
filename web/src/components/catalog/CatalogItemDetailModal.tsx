import { UNIT_MEASURE_LABELS } from '@unithor/shared';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  History,
  Package,
  Pencil,
  Warehouse,
  Wrench,
  Sparkles,
  ShoppingBag,
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

const DIVISION_LABELS = {
  DP: 'D&P · Desabolladura y Pintura',
  ACC: 'ACC · Repuestos y Accesorios',
  MEC: 'MEC · Mecánica',
} as const;

const SUBTYPE_LABELS = {
  servicio_dp: 'Servicio D&P (5 etapas con CCF)',
  en_stock: 'En stock físico (inventario almacén)',
  a_pedido: 'A pedido (por encargo sin inventario)',
  estandar: 'Servicio estándar (precio y HH definidos)',
  especifico: 'Servicio específico (diagnóstico previo / $1 ref)',
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

  const isDP = item.division === 'DP';
  const isACC = item.division === 'ACC' || item.tipo === 'parte';
  const isStockedPart = isACC && item.subtipo !== 'a_pedido';

  const inventoryQuery = useCatalogItemInventory(
    isStockedPart ? item.id : null,
    isStockedPart && canViewInventory,
  );
  const movementsQuery = useStockMovements(
    { page: 1, pageSize: 12, catalogItemId: item.id },
    isStockedPart && canViewInventory,
  );

  const TypeIcon = isDP ? Sparkles : isACC ? (item.subtipo === 'a_pedido' ? ShoppingBag : Package) : Wrench;
  const divisionKey = item.division ?? (isACC ? 'ACC' : isDP ? 'DP' : 'MEC');
  const subtypeKey = item.subtipo ?? (isACC ? 'en_stock' : item.tipo === 'especifico' ? 'especifico' : 'estandar');

  const tabs: Array<{ id: DetailTab; label: string; icon: typeof Boxes }> = [
    { id: 'summary', label: 'Resumen', icon: Boxes },
    ...(isStockedPart
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
        className="workspace-dialog reference-dialog inventory-profile-dialog catalog-detail-dialog relative flex w-full flex-col overflow-hidden bg-white shadow-2xl"
        role="dialog"
        tabIndex={-1}
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="catalog-detail-title"
      >
        <ModalHeader
          id="catalog-detail-heading"
          title="Ficha técnica de catálogo"
          onClose={onClose}
          closeLabel="Cerrar detalle"
        />
        <div className="inventory-profile-hero">
          <TypeIcon aria-hidden="true" />
          <div>
            <small>
              {DIVISION_LABELS[divisionKey]} · {item.codigo ?? 'SIN CÓDIGO'}
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
                  <dt>División de Taller</dt>
                  <dd className="font-semibold text-brand-primaryInk">
                    {DIVISION_LABELS[divisionKey]}
                  </dd>
                </div>
                <div>
                  <dt>Modalidad / Subtipo</dt>
                  <dd>{SUBTYPE_LABELS[subtypeKey] ?? subtypeKey}</dd>
                </div>
                <div>
                  <dt>Precio de venta</dt>
                  <dd>
                    {formatClp(item.precio)}
                    {item.subtipo === 'especifico' && ' (Referencial inicial)'}
                  </dd>
                </div>
                <div>
                  <dt>Unidad de medida</dt>
                  <dd>{UNIT_MEASURE_LABELS[item.unidadMedida]}</dd>
                </div>

                {isACC ? (
                  item.subtipo === 'a_pedido' ? (
                    <div>
                      <dt>Disponibilidad</dt>
                      <dd className="font-semibold text-blue-700">Por encargo (A pedido)</dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt>Stock total</dt>
                        <dd>{item.stock} uds.</dd>
                      </div>
                      <div>
                        <dt>Stock mínimo de alerta</dt>
                        <dd>{item.stockMinimo} uds.</dd>
                      </div>
                    </>
                  )
                ) : (
                  <div>
                    <dt>Horas hombre estimadas (HH)</dt>
                    <dd>
                      {item.horasHombreEstandar === null
                        ? 'Sin estimación'
                        : item.horasHombreEstandar + ' h / unidad'}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="catalog-description">
                <h3 className="text-sm font-bold text-brand-primaryInk">Descripción y notas</h3>
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
                        className="catalog-warehouse-row flex items-center gap-3 rounded-lg border border-brand-line px-4 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-line/40 text-brand-primaryInk">
                          <Warehouse className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-brand-ink">
                            {warehouse.nombre}
                          </strong>
                          <small className="text-xs text-brand-muted">
                            {warehouse.codigo}
                            {warehouse.direccion ? ' · ' + warehouse.direccion : ''}
                          </small>
                        </span>
                        <div className="text-right">
                          <strong
                            className={`text-sm ${
                              quantity <= 0
                                ? 'text-brand-coralInk'
                                : quantity <= (balance?.stockMinimo ?? 0)
                                  ? 'text-brand-goldInk'
                                  : 'text-brand-primaryInk'
                            }`}
                          >
                            {quantity} uds.
                          </strong>
                          {balance?.bajoMinimo && (
                            <small className="block text-[11px] font-semibold text-brand-coralInk">
                              Bajo mínimo ({balance.stockMinimo})
                            </small>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {inventoryQuery.data?.length === 0 && (
                    <p className="py-6 text-center text-sm text-brand-muted">
                      No hay bodegas registradas con existencias de este ítem.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="space-y-3">
              {!canViewInventory ? (
                <div className="rounded-lg border border-brand-line bg-brand-line/40 p-5 text-center">
                  <Warehouse className="mx-auto h-8 w-8 text-brand-muted/40" aria-hidden="true" />
                  <p className="mt-2 font-semibold text-brand-ink">Historial protegido</p>
                  <p className="mt-1 text-sm text-brand-muted">
                    No tiene permisos para ver movimientos de inventario.
                  </p>
                </div>
              ) : movementsQuery.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-brand-pale" />
                  ))}
                </div>
              ) : movementsQuery.isError ? (
                <p className="rounded-lg border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk">
                  No se pudo cargar el historial de movimientos.
                </p>
              ) : movementsQuery.data?.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-brand-muted">
                  No hay movimientos registrados para este repuesto.
                </p>
              ) : (
                <div className="space-y-2">
                  {movementsQuery.data?.items.map((mov) => {
                    const outgoing = isOutgoingMovement(mov);
                    const MovementIcon = outgoing ? ArrowDownToLine : ArrowUpFromLine;
                    return (
                      <div
                        key={mov.id}
                        className="flex items-center gap-3 rounded-lg border border-brand-line px-3 py-2 text-xs"
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            outgoing
                              ? 'bg-brand-coralPale text-brand-coralInk'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <MovementIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-brand-ink">
                            {MOVEMENT_LABELS[mov.tipo] ?? mov.tipo}
                            {mov.motivo ? ` · ${mov.motivo}` : ''}
                          </strong>
                          <small className="block text-brand-muted">
                            {formatDateTime(mov.fecha)}
                          </small>
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-bold ${
                              outgoing ? 'text-brand-coralInk' : 'text-emerald-700'
                            }`}
                          >
                            {outgoing ? `-${mov.cantidad}` : `+${mov.cantidad}`}
                          </span>
                          <small className="block text-[11px] text-brand-muted">
                            Saldo: {mov.saldoResultante}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="reference-dialog-footer flex justify-between gap-2 border-t border-brand-line px-6 py-4">
          <div className="flex gap-2">
            {canAdjustStock && isStockedPart && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  onClose();
                  onAdjustStock();
                }}
              >
                <Boxes className="h-4 w-4" aria-hidden="true" />
                Ajustar stock
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-brand-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-pale"
              onClick={onClose}
            >
              Cerrar
            </button>
            {canEdit && (
              <button
                type="button"
                className="inventory-primary"
                onClick={() => {
                  onClose();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar ítem
              </button>
            )}
          </div>
        </div>
      </motion.section>
    </div>,
    document.body,
  );
};

export default CatalogItemDetailModal;
