import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  History,
  MapPin,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Pagination from '../../components/common/Pagination';
import {
  StockMovementModal,
  StockTransferModal,
  WarehouseDeliveryModal,
  WarehouseFormModal,
} from '../../components/warehouses/InventoryDialogs';
import {
  useStockMovements,
  useWarehouseBalances,
  useWarehouseRequests,
  useWarehouses,
} from '../../hooks/useWarehouses';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type {
  StockBalance,
  StockMovement,
  Warehouse,
  WarehouseWorkOrderRequest,
} from '../../types/entities';

const MOVEMENT_TYPE_LABELS: Record<StockMovement['tipo'], string> = {
  ingreso: 'Ingreso',
  salida: 'Salida',
  ajuste: 'Ajuste',
  traslado_salida: 'Traslado sal.',
  traslado_ingreso: 'Traslado ing.',
  consumo_ot: 'Consumo OT',
};

const MOVEMENT_TYPE_STYLES: Record<StockMovement['tipo'], string> = {
  ingreso: 'bg-brand-mintPale text-brand-mintInk',
  salida: 'bg-brand-coralPale text-brand-coralInk',
  ajuste: 'bg-brand-line text-brand-ink',
  traslado_salida: 'bg-brand-goldPale text-brand-goldInk',
  traslado_ingreso: 'bg-brand-pale text-brand-primaryInk',
  consumo_ot: 'bg-brand-pale text-brand-primaryInk',
};

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const firstDayOfMonth = (): string => {
  const now = new Date();
  return toDateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
};

export const WarehousesPage = () => {
  const user = useAuthStore((state) => state.user);
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const dispatchRef = useRef<HTMLDetailsElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [balanceSearch, setBalanceSearch] = useState('');
  const [balancePage, setBalancePage] = useState(1);
  const [movementPart, setMovementPart] = useState<StockBalance | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState(firstDayOfMonth);
  const [fechaHasta, setFechaHasta] = useState(() => toDateInput(new Date()));
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'aprobada' | 'entregada'>('aprobada');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<WarehouseWorkOrderRequest | null>(null);
  const validDateRange = !fechaDesde || !fechaHasta || fechaDesde <= fechaHasta;

  const warehousesQuery = useWarehouses({ page: 1, pageSize: 100 });
  const balancesQuery = useWarehouseBalances(selectedId);
  const movementsQuery = useStockMovements(
    {
      page: movementPage,
      pageSize: 15,
      warehouseId: selectedId ?? undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    },
    selectedId !== null && validDateRange,
  );
  const requestsQuery = useWarehouseRequests({
    page: requestPage,
    pageSize: 20,
    estado: requestStatus,
    search: requestSearch || undefined,
  });
  const pendingRequestsCountQuery = useWarehouseRequests({
    page: 1,
    pageSize: 1,
    estado: 'aprobada',
  });

  const canCreate = Boolean(user && hasUserPermission(user, 'almacen', 'create'));
  const canUpdate = Boolean(user && hasUserPermission(user, 'almacen', 'update'));

  const warehouses = useMemo(() => warehousesQuery.data?.items ?? [], [warehousesQuery.data]);
  const selected = warehouses.find((warehouse) => warehouse.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId === null && warehouses.length > 0) {
      setSelectedId(warehouses[0].id);
    }
  }, [warehouses, selectedId]);
  useEffect(() => setMovementPage(1), [selectedId, fechaDesde, fechaHasta]);

  useEffect(() => setBalancePage(1), [selectedId, balanceSearch]);
  useEffect(() => setRequestPage(1), [requestStatus, requestSearch]);

  useEffect(() => {
    if (requestedTab !== 'requests' || !dispatchRef.current) return;
    dispatchRef.current.open = true;
    dispatchRef.current.querySelector('summary')?.focus({ preventScroll: true });
    dispatchRef.current.scrollIntoView?.({ block: 'start' });
  }, [requestedTab]);

  const filteredBalances = useMemo(() => {
    const term = balanceSearch.trim().toLowerCase();
    const balances = balancesQuery.data ?? [];
    if (!term) return balances;
    return balances.filter(
      (balance) =>
        balance.nombre.toLowerCase().includes(term) ||
        (balance.codigo ?? '').toLowerCase().includes(term),
    );
  }, [balancesQuery.data, balanceSearch]);

  return (
    <div className="workspace-page workspace-warehouses inventory-module min-w-0 space-y-5">
      <header className="inventory-page-heading">
        <div>
          <h1>Almacenes</h1>
        </div>
        <p>Inventario y abastecimiento del taller</p>
      </header>
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar en stock</span>
          <input
            type="search"
            value={balanceSearch}
            onChange={(event) => setBalanceSearch(event.target.value)}
            placeholder="Buscar producto o código"
          />
        </label>
        {canCreate && (
          <button
            type="button"
            className="inventory-primary"
            onClick={() => {
              setEditingWarehouse(null);
              setShowWarehouseModal(true);
            }}
          >
            <Plus aria-hidden="true" />
            Nuevo almacén
          </button>
        )}
      </div>

      {(warehousesQuery.isError ||
        balancesQuery.isError ||
        movementsQuery.isError ||
        requestsQuery.isError) && (
        <div
          className="flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(
            warehousesQuery.error ??
              balancesQuery.error ??
              movementsQuery.error ??
              requestsQuery.error,
          )}
        </div>
      )}

      <section aria-label="Almacenes">
        {warehousesQuery.isPending ? (
          <div className="h-16 animate-pulse rounded-xl bg-white" role="status">
            <span className="sr-only">Cargando almacenes…</span>
          </div>
        ) : warehouses.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-white px-4 text-center">
            <WarehouseIcon className="h-10 w-10 text-brand-muted/40" aria-hidden="true" />
            <p className="mt-3 font-semibold text-brand-ink">Sin almacenes registrados</p>
            <p className="mt-1 text-sm text-brand-muted">
              Cree la primera bodega para llevar stock por ubicación.
            </p>
          </div>
        ) : (
          <div className="inventory-warehouse-selector">
            <label>
              <span>Almacén actual</span>
              <select
                aria-label="Seleccionar almacén"
                value={selectedId ?? ''}
                onChange={(event) => setSelectedId(Number(event.target.value))}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.nombre}
                    {warehouse.activo ? '' : ' · Inactivo'}
                  </option>
                ))}
              </select>
            </label>
            <div className="inventory-location-actions">
              {canCreate && selected && (
                <button
                  type="button"
                  aria-label="Registrar movimiento"
                  title="Registrar movimiento"
                  disabled={!selected.activo}
                  onClick={() => {
                    setMovementPart(null);
                    setShowMovementModal(true);
                  }}
                >
                  <ArrowDownUp aria-hidden="true" />
                  Registrar movimiento
                </button>
              )}
              {canCreate && warehouses.filter((warehouse) => warehouse.activo).length > 1 && (
                <button
                  type="button"
                  aria-label="Trasladar stock"
                  title="Trasladar stock"
                  onClick={() => setShowTransferModal(true)}
                >
                  <ArrowLeftRight aria-hidden="true" />
                  Trasladar stock
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {selected !== null && (
        <section className="inventory-warehouse-content" aria-label={'Stock de ' + selected.codigo}>
          <div className="inventory-warehouse-heading">
            <div>
              <h2>Inventario de {selected.nombre}</h2>
              <span className="inventory-address">
                <MapPin aria-hidden="true" />
                {selected.direccion || 'Sin dirección registrada'}
              </span>
              {!selected.activo && <span className="inventory-inactive">Inactivo</span>}
            </div>
            {canUpdate && (
              <button
                className="inventory-secondary"
                type="button"
                aria-label={'Editar ' + selected.codigo}
                onClick={() => {
                  setEditingWarehouse(selected);
                  setShowWarehouseModal(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Editar almacén
              </button>
            )}
          </div>
          <div className="inventory-stock-panel">
            <div className="inventory-table-scroll">
              <table className="inventory-stock-table">
                <thead>
                  <tr>
                    <th>Producto / código</th>
                    <th>Stock</th>
                    <th>Precio de venta</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balancesQuery.isPending ? (
                    <tr>
                      <td colSpan={4}>Cargando stock…</td>
                    </tr>
                  ) : filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="inventory-empty">
                          <Boxes aria-hidden="true" />
                          <p>Sin saldos para estos filtros.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBalances
                      .slice((balancePage - 1) * 20, balancePage * 20)
                      .map((balance) => (
                        <tr key={balance.catalogItemId}>
                          <td data-label="Producto">
                            <div className="inventory-product">
                              <Package aria-hidden="true" />
                              <span>
                                <strong>{balance.nombre}</strong>
                                <small>{balance.codigo ?? 'Sin código'}</small>
                              </span>
                            </div>
                          </td>
                          <td data-label="Stock">
                            <span
                              className={
                                'inventory-stock-amount' +
                                (balance.cantidad === 0
                                  ? ' is-empty'
                                  : balance.bajoMinimo
                                    ? ' is-low'
                                    : '')
                              }
                            >
                              {balance.cantidad}
                            </span>
                            {balance.bajoMinimo && (
                              <small className="inventory-low-stock">Bajo mínimo</small>
                            )}
                          </td>
                          <td data-label="Precio de venta" className="inventory-stock-price">
                            {formatClp(balance.precio)}
                          </td>
                          <td data-label="Acciones">
                            {canCreate && (
                              <button
                                type="button"
                                className="inventory-row-movement"
                                disabled={!selected.activo}
                                aria-label={'Registrar movimiento de ' + balance.nombre}
                                onClick={() => {
                                  setMovementPart(balance);
                                  setShowMovementModal(true);
                                }}
                              >
                                <ArrowDownUp aria-hidden="true" />
                                <span>Movimiento</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={balancePage}
              totalPages={Math.ceil(filteredBalances.length / 20)}
              total={filteredBalances.length}
              onPageChange={setBalancePage}
            />
          </div>
          <p className="inventory-stock-summary" aria-label="Resumen del inventario">
            <span>{selected.totalUnidades.toLocaleString('es-CL')} unidades en este almacén</span>
            <span>
              {(balancesQuery.data ?? []).filter((balance) => balance.bajoMinimo).length} repuestos{' '}
              bajo mínimo
            </span>
          </p>
        </section>
      )}

      <details
        ref={dispatchRef}
        className="inventory-dispatch-panel inventory-history"
        aria-label="Solicitudes de repuestos para órdenes de trabajo"
      >
        <summary>
          <Truck aria-hidden="true" />
          <span>Despacho a órdenes de trabajo</span>
          <small>{pendingRequestsCountQuery.data?.total ?? 0} pendientes</small>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="inventory-dispatch-toolbar">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-brand-muted">
                Entrega únicamente repuestos aprobados por el jefe de taller.
              </p>
            </div>
            <label className="relative w-full lg:w-80">
              <span className="sr-only">Buscar solicitud de repuesto</span>
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
                aria-hidden="true"
              />
              <input
                value={requestSearch}
                onChange={(event) => setRequestSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/20 bg-white pl-9 pr-3 text-sm text-brand-ink outline-none focus:ring-2 focus:ring-brand-primary"
                placeholder="OT, patente, cliente o repuesto"
              />
            </label>
          </div>
        </div>
        <div className="inventory-dispatch-filters">
          <button
            type="button"
            aria-pressed={requestStatus === 'aprobada'}
            onClick={() => setRequestStatus('aprobada')}
            className={`h-9 px-4 text-sm font-semibold ${requestStatus === 'aprobada' ? 'rounded-md bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`}
          >
            Pendientes ({pendingRequestsCountQuery.data?.total ?? 0})
          </button>
          <button
            type="button"
            aria-pressed={requestStatus === 'entregada'}
            onClick={() => setRequestStatus('entregada')}
            className={`h-9 px-4 text-sm font-semibold ${requestStatus === 'entregada' ? 'rounded-md bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`}
          >
            Entregados
          </button>
        </div>
        <div className="divide-y divide-brand-line">
          {requestsQuery.isPending ? (
            Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse bg-brand-line/40" />
            ))
          ) : (requestsQuery.data?.items.length ?? 0) === 0 ? (
            <div className="px-4 py-10 text-center">
              <PackageCheck className="mx-auto h-9 w-9 text-brand-muted/40" aria-hidden="true" />
              <p className="mt-2 font-semibold text-brand-ink">
                {requestStatus === 'aprobada'
                  ? 'No hay entregas pendientes'
                  : 'No hay entregas registradas'}
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                Las solicitudes aprobadas desde una OT aparecerán aquí.
              </p>
            </div>
          ) : (
            requestsQuery.data?.items.map((request) => (
              <article
                key={request.id}
                className="grid gap-4 px-4 py-4 transition hover:bg-brand-pale sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-brand-primaryInk px-2 py-1 font-mono text-xs font-bold text-white">
                      {request.workOrder.codigo}
                    </span>
                    <span className="rounded-md bg-brand-pale px-2 py-1 font-mono text-xs font-bold text-brand-ink">
                      {request.workOrder.vehicle?.patente ?? 'SIN PATENTE'}
                    </span>
                    {request.estado === 'entregada' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand-mintPale px-2 py-1 text-xs font-bold text-brand-mintInk">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Entregado
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate font-bold text-brand-ink">
                    {request.catalogItem.nombre}
                  </p>
                  <p className="mt-1 text-sm text-brand-muted">
                    {request.catalogItem.codigo ?? 'Sin código'} · Solicitó{' '}
                    {request.requester?.nombre ?? 'Taller'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase text-brand-muted">Cantidad</p>
                    <p className="mt-1 font-bold text-brand-primaryInk">
                      {request.cantidad} unidades
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-brand-muted">
                      Vehículo / cliente
                    </p>
                    <p className="mt-1 truncate font-semibold text-brand-ink">
                      {request.workOrder.vehicle
                        ? `${request.workOrder.vehicle.marca ?? ''} ${request.workOrder.vehicle.modelo ?? ''}`.trim() ||
                          request.workOrder.vehicle.patente
                        : 'Sin vehículo'}
                    </p>
                    <p className="truncate text-xs text-brand-muted">
                      {request.workOrder.client?.nombre ?? 'Sin cliente'}
                    </p>
                  </div>
                  {request.estado === 'entregada' && (
                    <div className="col-span-2">
                      <p className="text-xs text-brand-muted">
                        {request.deliveredWarehouse?.codigo} ·{' '}
                        {request.deliverer?.nombre ?? 'Bodega'} ·{' '}
                        {request.deliveredAt ? formatDateTime(request.deliveredAt) : ''}
                      </p>
                    </div>
                  )}
                </div>
                {request.estado === 'aprobada' && canCreate ? (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <PackageCheck className="h-4 w-4" aria-hidden="true" />
                    Entregar
                  </button>
                ) : (
                  <a
                    href={`/work-orders/${request.workOrderId}`}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:border-brand-primary hover:text-brand-primaryInk"
                  >
                    Ver OT
                  </a>
                )}
              </article>
            ))
          )}
        </div>
        <Pagination
          page={requestPage}
          totalPages={requestsQuery.data?.totalPages ?? 0}
          total={requestsQuery.data?.total ?? 0}
          onPageChange={setRequestPage}
        />
      </details>

      <details className="inventory-history" aria-label="Kardex de movimientos">
        <summary>
          <History aria-hidden="true" />
          <span>Historial de movimientos</span>
          <small>{movementsQuery.data?.total ?? 0}</small>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="grid gap-3 border-b border-brand-line p-4 lg:grid-cols-[170px_170px_1fr]">
          <label className="text-xs font-semibold uppercase text-brand-muted">
            Fecha desde
            <input
              type="date"
              value={fechaDesde}
              onChange={(event) => setFechaDesde(event.target.value)}
              className="h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal text-brand-ink"
              aria-label="Fecha desde"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-brand-muted">
            Fecha hasta
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde}
              onChange={(event) => setFechaHasta(event.target.value)}
              className="h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal text-brand-ink"
              aria-label="Fecha hasta"
            />
          </label>
          <div className="inventory-history-scope flex items-end gap-2 text-sm text-brand-muted">
            <History className="mb-2.5 h-4 w-4" aria-hidden="true" />
            <p className="pb-2">
              {selected ? selected.nombre + ' · ' : ''}Ingresos, salidas, traslados y ajustes.
            </p>
          </div>
        </div>
        {!validDateRange && (
          <p className="inventory-alert" role="alert">
            La fecha desde no puede ser posterior a la fecha hasta.
          </p>
        )}
        {validDateRange && (
          <>
            <div className="inventory-table-scroll">
              <table
                role="table"
                className="workspace-table w-full min-w-[860px] text-left text-sm"
              >
                <thead
                  role="rowgroup"
                  className="bg-brand-line/40 text-xs uppercase text-brand-muted"
                >
                  <tr role="row">
                    <th role="columnheader" className="px-4 py-3 font-semibold">
                      Fecha
                    </th>
                    <th role="columnheader" className="px-4 py-3 font-semibold">
                      Tipo
                    </th>
                    <th role="columnheader" className="px-4 py-3 font-semibold">
                      Repuesto
                    </th>
                    <th role="columnheader" className="px-4 py-3 font-semibold">
                      Almacén
                    </th>
                    <th role="columnheader" className="px-4 py-3 text-right font-semibold">
                      Cantidad
                    </th>
                    <th role="columnheader" className="px-4 py-3 text-right font-semibold">
                      Saldo
                    </th>
                    <th role="columnheader" className="px-4 py-3 font-semibold">
                      Motivo
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {movementsQuery.isPending ? (
                    <tr role="row">
                      <td
                        role="cell"
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-brand-muted"
                      >
                        Cargando movimientos...
                      </td>
                    </tr>
                  ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
                    <tr role="row">
                      <td
                        role="cell"
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-brand-muted"
                      >
                        Sin movimientos en el período.
                      </td>
                    </tr>
                  ) : (
                    movementsQuery.data?.items.map((movement) => (
                      <tr role="row" key={movement.id} className="border-t border-brand-line">
                        <td
                          role="cell"
                          data-label="Fecha"
                          className="whitespace-nowrap px-4 py-3 text-brand-muted"
                        >
                          {formatDateTime(movement.fecha)}
                        </td>
                        <td role="cell" data-label="Tipo" className="px-4 py-3">
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-bold ${MOVEMENT_TYPE_STYLES[movement.tipo]}`}
                          >
                            {MOVEMENT_TYPE_LABELS[movement.tipo]}
                          </span>
                        </td>
                        <td role="cell" data-label="Repuesto" className="px-4 py-3">
                          <span className="font-medium text-brand-ink">{movement.nombre}</span>
                          <span className="block font-mono text-xs text-brand-muted">
                            {movement.codigo ?? 'Sin código'}
                          </span>
                        </td>
                        <td
                          role="cell"
                          data-label="Almacén"
                          className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-brand-ink"
                        >
                          {movement.warehouseCodigo}
                        </td>
                        <td
                          role="cell"
                          data-label="Cantidad"
                          className="px-4 py-3 text-right font-semibold text-brand-ink"
                        >
                          {movement.tipo === 'salida' ||
                          movement.tipo === 'traslado_salida' ||
                          movement.tipo === 'consumo_ot'
                            ? `-${movement.cantidad}`
                            : movement.tipo === 'ajuste'
                              ? movement.cantidad
                              : `+${movement.cantidad}`}
                        </td>
                        <td
                          role="cell"
                          data-label="Saldo"
                          className="px-4 py-3 text-right font-bold text-brand-primaryInk"
                        >
                          {movement.saldoResultante}
                        </td>
                        <td
                          role="cell"
                          data-label="Motivo"
                          className="max-w-64 truncate px-4 py-3 text-brand-muted"
                          title={movement.motivo}
                        >
                          {movement.motivo}
                          {movement.referencia && (
                            <small className="inventory-movement-reference">
                              {movement.referencia}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={movementPage}
              totalPages={movementsQuery.data?.totalPages ?? 0}
              total={movementsQuery.data?.total ?? 0}
              onPageChange={setMovementPage}
            />
          </>
        )}
      </details>

      {showWarehouseModal && (
        <WarehouseFormModal
          warehouse={editingWarehouse}
          onClose={() => {
            setShowWarehouseModal(false);
            setEditingWarehouse(null);
          }}
        />
      )}
      {showMovementModal && selected !== null && (
        <StockMovementModal
          warehouse={selected}
          initialPart={movementPart}
          onClose={() => setShowMovementModal(false)}
        />
      )}
      {showTransferModal && (
        <StockTransferModal
          warehouses={warehouses}
          defaultOriginId={selectedId}
          onClose={() => setShowTransferModal(false)}
        />
      )}
      {selectedRequest && (
        <WarehouseDeliveryModal
          request={selectedRequest}
          warehouses={warehouses.filter((warehouse) => warehouse.activo)}
          defaultWarehouseId={selectedId}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
};

export default WarehousesPage;
