import { AlertCircle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, CheckCircle2, Clock3, History, LoaderCircle, PackageCheck, Pencil, Plus, Search, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AnimateIcon, AnimatedCard, Stagger, StaggerItem } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import {
  useCatalogParts,
  useCreateStockMovementMutation,
  useCreateStockTransferMutation,
  useCreateWarehouseMutation,
  useDeliverWarehouseRequestMutation,
  useStockMovements,
  useUpdateWarehouseMutation,
  useWarehouseBalances,
  useWarehouseRequests,
  useWarehouses,
} from '../../hooks/useWarehouses';

import type { CatalogItem, StockMovement, Warehouse, WarehouseWorkOrderRequest } from '../../types/entities';

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

const PartPicker = ({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (item: CatalogItem) => void;
}) => {
  const [search, setSearch] = useState('');
  const partsQuery = useCatalogParts(search);
  const selected = partsQuery.data?.items.find((item) => item.id === selectedId);

  return (
    <div>
      <label className="block text-sm font-semibold text-brand-ink">
        Repuesto
        <span className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
          <input
            value={selected ? `${selected.codigo ?? ''} ${selected.nombre}`.trim() : search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onFocus={() => setSearch('')}
            className="h-10 w-full rounded-lg border border-brand-line pl-9 pr-3 text-sm font-normal outline-none focus:border-brand-primary"
            placeholder="Buscar repuesto por nombre o código"
            aria-label="Buscar repuesto"
            autoComplete="off"
          />
        </span>
      </label>
      {search !== '' && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-brand-line bg-white shadow-lg">
          {partsQuery.isPending && <p className="px-3 py-3 text-sm text-brand-muted">Buscando...</p>}
          {!partsQuery.isPending && (partsQuery.data?.items.length ?? 0) === 0 && (
            <p className="px-3 py-3 text-sm text-brand-muted">Sin resultados.</p>
          )}
          {partsQuery.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-pale"
              onClick={() => {
                onSelect(item);
                setSearch('');
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-brand-ink">{item.nombre}</span>
                <span className="block font-mono text-xs text-brand-muted">{item.codigo ?? 'Sin código'} · Stock global {item.stock}</span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-brand-primaryInk">{formatClp(item.precio)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const WarehousesPage = () => {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [balanceSearch, setBalanceSearch] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState(firstDayOfMonth);
  const [fechaHasta, setFechaHasta] = useState(() => toDateInput(new Date()));
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'aprobada' | 'entregada'>('aprobada');
  const [requestSearch, setRequestSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<WarehouseWorkOrderRequest | null>(null);

  const warehousesQuery = useWarehouses({ page: 1, pageSize: 50, search: search || undefined });
  const balancesQuery = useWarehouseBalances(selectedId);
  const movementsQuery = useStockMovements({
    page: movementPage,
    pageSize: 15,
    warehouseId: selectedId ?? undefined,
    fechaDesde,
    fechaHasta,
  });
  const requestsQuery = useWarehouseRequests({
    page: 1,
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
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-muted">Inventario por bodega</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-primaryInk sm:text-3xl">Almacenes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && selected !== null && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover"
              onClick={() => setShowMovementModal(true)}
            >
              <AnimateIcon variant="bounce" animateOnHover>
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
              Registrar movimiento
            </button>
          )}
          {canCreate && warehouses.length > 1 && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-primaryInk bg-white px-4 text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40"
              onClick={() => setShowTransferModal(true)}
            >
              <AnimateIcon variant="slide-right" animateOnHover>
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
              Trasladar
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover"
              onClick={() => {
                setEditingWarehouse(null);
                setShowWarehouseModal(true);
              }}
            >
              <AnimateIcon variant="spin" animateOnHover>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
              Nuevo almacén
            </button>
          )}
        </div>
      </header>

      {(warehousesQuery.isError || balancesQuery.isError || movementsQuery.isError || requestsQuery.isError) && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(warehousesQuery.error ?? balancesQuery.error ?? movementsQuery.error ?? requestsQuery.error)}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de almacenes">
        <InventoryMetric icon={WarehouseIcon} label="Almacenes activos" value={warehouses.filter((warehouse) => warehouse.activo).length} tone="blue" />
        <InventoryMetric icon={Boxes} label="Unidades en almacenes" value={warehouses.reduce((total, warehouse) => total + warehouse.totalUnidades, 0)} tone="slate" />
        <InventoryMetric icon={Clock3} label="Entregas pendientes" value={pendingRequestsCountQuery.data?.total ?? 0} tone="amber" />
        <InventoryMetric icon={AlertCircle} label="Bajo mínimo" value={(balancesQuery.data ?? []).filter((balance) => balance.bajoMinimo).length} tone="red" />
      </section>

      <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm" aria-label="Solicitudes de repuestos para órdenes de trabajo">
        {/* Banda sobre `surfaceDark`, no sobre el índigo: el subtítulo usa
          `text-brand-mutedOnDark` (4.3:1 sobre `#255DFF`) y el icono dorado 2.9:1. Sobre
          la superficie oscura del tema `body.dark` del diseño ambos suben. */}
      <div className="border-b border-brand-line bg-brand-surfaceDark px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-brand-goldInk" aria-hidden="true" />
                <h2 className="font-bold">Despacho a órdenes de trabajo</h2>
              </div>
              <p className="mt-1 text-sm text-brand-mutedOnDark">Entrega únicamente repuestos aprobados por el jefe de taller.</p>
            </div>
            <label className="relative w-full lg:w-80">
              <span className="sr-only">Buscar solicitud de repuesto</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
              <input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} className="h-10 w-full rounded-lg border border-white/20 bg-white pl-9 pr-3 text-sm text-brand-ink outline-none focus:ring-2 focus:ring-brand-primary" placeholder="OT, patente, cliente o repuesto" />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 border-b border-brand-line bg-brand-line/40 p-1 sm:flex sm:w-fit sm:rounded-br-lg">
          <button type="button" onClick={() => setRequestStatus('aprobada')} className={`h-9 px-4 text-sm font-semibold ${requestStatus === 'aprobada' ? 'rounded-md bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`}>Pendientes ({pendingRequestsCountQuery.data?.total ?? 0})</button>
          <button type="button" onClick={() => setRequestStatus('entregada')} className={`h-9 px-4 text-sm font-semibold ${requestStatus === 'entregada' ? 'rounded-md bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`}>Entregados</button>
        </div>
        <div className="divide-y divide-brand-line">
          {requestsQuery.isPending ? (
            Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse bg-brand-line/40" />)
          ) : (requestsQuery.data?.items.length ?? 0) === 0 ? (
            <div className="px-4 py-10 text-center"><PackageCheck className="mx-auto h-9 w-9 text-brand-line" aria-hidden="true" /><p className="mt-2 font-semibold text-brand-ink">{requestStatus === 'aprobada' ? 'No hay entregas pendientes' : 'No hay entregas registradas'}</p><p className="mt-1 text-sm text-brand-muted">Las solicitudes aprobadas desde una OT aparecerán aquí.</p></div>
          ) : requestsQuery.data?.items.map((request) => (
            <article key={request.id} className="grid gap-4 px-4 py-4 transition hover:bg-brand-pale sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-brand-primaryInk px-2 py-1 font-mono text-xs font-bold text-white">{request.workOrder.codigo}</span><span className="rounded-md bg-brand-pale px-2 py-1 font-mono text-xs font-bold text-brand-ink">{request.workOrder.vehicle?.patente ?? 'SIN PATENTE'}</span>{request.estado === 'entregada' && <span className="inline-flex items-center gap-1 rounded-md bg-brand-mintPale px-2 py-1 text-xs font-bold text-brand-mintInk"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Entregado</span>}</div>
                <p className="mt-2 truncate font-bold text-brand-ink">{request.catalogItem.nombre}</p>
                <p className="mt-1 text-sm text-brand-muted">{request.catalogItem.codigo ?? 'Sin código'} · Solicitó {request.requester?.nombre ?? 'Taller'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs font-semibold uppercase text-brand-muted">Cantidad</p><p className="mt-1 font-bold text-brand-primaryInk">{request.cantidad} unidades</p></div>
                <div><p className="text-xs font-semibold uppercase text-brand-muted">Vehículo / cliente</p><p className="mt-1 truncate font-semibold text-brand-ink">{request.workOrder.vehicle ? `${request.workOrder.vehicle.marca ?? ''} ${request.workOrder.vehicle.modelo ?? ''}`.trim() || request.workOrder.vehicle.patente : 'Sin vehículo'}</p><p className="truncate text-xs text-brand-muted">{request.workOrder.client?.nombre ?? 'Sin cliente'}</p></div>
                {request.estado === 'entregada' && <div className="col-span-2"><p className="text-xs text-brand-muted">{request.deliveredWarehouse?.codigo} · {request.deliverer?.nombre ?? 'Bodega'} · {request.deliveredAt ? formatDateTime(request.deliveredAt) : ''}</p></div>}
              </div>
              {request.estado === 'aprobada' && canCreate ? <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover" onClick={() => setSelectedRequest(request)}><PackageCheck className="h-4 w-4" aria-hidden="true" />Entregar</button> : <a href={`/work-orders/${request.workOrderId}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:border-brand-primary hover:text-brand-primaryInk">Ver OT</a>}
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Almacenes">
        {warehousesQuery.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl border border-brand-line bg-white" />
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-white px-4 text-center">
            <WarehouseIcon className="h-10 w-10 text-brand-line" aria-hidden="true" />
            <p className="mt-3 font-semibold text-brand-ink">Sin almacenes registrados</p>
            <p className="mt-1 text-sm text-brand-muted">Cree la primera bodega para llevar stock por ubicación.</p>
          </div>
        ) : (
          <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" stagger={0.05}>
            {warehouses.map((warehouse) => {
              const active = warehouse.id === selectedId;
              return (
                <StaggerItem key={warehouse.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(warehouse.id)}
                    aria-pressed={active}
                    className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${
                      active ? 'border-brand-primaryInk ring-2 ring-brand-primary/30' : 'border-brand-line'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-brand-surfaceDark px-2 py-1 font-mono text-xs font-bold text-white">{warehouse.codigo}</span>
                      {warehouse.activo ? (
                        <span className="rounded-full bg-brand-mintPale px-2 py-0.5 text-[11px] font-bold text-brand-mintInk">Activo</span>
                      ) : (
                        <span className="rounded-full bg-brand-line px-2 py-0.5 text-[11px] font-bold text-brand-muted">Inactivo</span>
                      )}
                    </div>
                    <p className="mt-2 truncate font-bold text-brand-primaryInk">{warehouse.nombre}</p>
                    <p className="mt-1 text-sm text-brand-muted">
                      <strong className="text-brand-ink">{warehouse.totalItems}</strong> ítems ·{' '}
                      <strong className="text-brand-ink">{warehouse.totalUnidades}</strong> uds.
                    </p>
                    {canUpdate && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Editar ${warehouse.codigo}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-muted hover:text-brand-primaryInk"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingWarehouse(warehouse);
                          setShowWarehouseModal(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation();
                            setEditingWarehouse(warehouse);
                            setShowWarehouseModal(true);
                          }
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                      </span>
                    )}
                  </button>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </section>

      {selected !== null && (
        <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm" aria-label={`Stock de ${selected.codigo}`}>
          <div className="flex flex-col gap-3 border-b border-brand-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-brand-primaryInk">Stock · {selected.nombre}</h2>
              <p className="mt-0.5 text-xs text-brand-muted">Saldos por repuesto en este almacén.</p>
            </div>
            <label className="relative sm:w-72">
              <span className="sr-only">Buscar en stock</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
              <input
                value={balanceSearch}
                onChange={(event) => setBalanceSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-brand-line pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
                placeholder="Buscar repuesto o código"
              />
            </label>
          </div>
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-brand-line/40 text-xs uppercase text-brand-muted">
                <tr><th className="px-4 py-3 font-semibold">Código</th><th className="px-4 py-3 font-semibold">Repuesto</th><th className="px-4 py-3 text-right font-semibold">Precio</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th></tr>
              </thead>
              <tbody>
                {balancesQuery.isPending ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-brand-muted">Cargando stock...</td></tr>
                ) : filteredBalances.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-brand-muted"><Boxes className="mx-auto h-8 w-8 text-brand-line" aria-hidden="true" /><p className="mt-2">Sin saldos registrados.</p></td></tr>
                ) : filteredBalances.map((balance) => (
                  <tr key={balance.catalogItemId} className="border-t border-brand-line">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-brand-ink">{balance.codigo ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-brand-ink">{balance.nombre}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-brand-muted">{formatClp(balance.precio)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`rounded-md px-2 py-1 text-sm font-bold ${balance.cantidad > 0 ? 'bg-brand-mintPale text-brand-mintInk' : 'bg-brand-coralPale text-brand-coralInk'}`}>{balance.cantidad}</span>
                      {balance.bajoMinimo && <span className="ml-1 rounded-md bg-brand-goldPale px-2 py-1 text-[11px] font-bold text-brand-goldInk" title={`Mínimo configurado: ${balance.stockMinimo}`}>Bajo mínimo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm" aria-label="Kardex de movimientos">
        <div className="grid gap-3 border-b border-brand-line p-4 lg:grid-cols-[170px_170px_1fr]">
          <label className="text-xs font-semibold uppercase text-brand-muted">Fecha desde<input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal text-brand-ink" aria-label="Fecha desde" /></label>
          <label className="text-xs font-semibold uppercase text-brand-muted">Fecha hasta<input type="date" value={fechaHasta} min={fechaDesde} onChange={(event) => setFechaHasta(event.target.value)} className="h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal text-brand-ink" aria-label="Fecha hasta" /></label>
          <div className="flex items-end gap-2 text-sm text-brand-muted"><History className="mb-2.5 h-4 w-4" aria-hidden="true" /><p className="pb-2">Kardex: cada ingreso, salida y ajuste con su saldo resultante.</p></div>
        </div>
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-brand-line/40 text-xs uppercase text-brand-muted">
              <tr><th className="px-4 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 font-semibold">Repuesto</th><th className="px-4 py-3 font-semibold">Almacén</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th><th className="px-4 py-3 text-right font-semibold">Saldo</th><th className="px-4 py-3 font-semibold">Motivo</th></tr>
            </thead>
            <tbody>
              {movementsQuery.isPending ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-muted">Cargando movimientos...</td></tr>
              ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-muted">Sin movimientos en el período.</td></tr>
              ) : movementsQuery.data?.items.map((movement) => (
                <tr key={movement.id} className="border-t border-brand-line">
                  <td className="whitespace-nowrap px-4 py-3 text-brand-muted">{formatDateTime(movement.fecha)}</td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold ${MOVEMENT_TYPE_STYLES[movement.tipo]}`}>{MOVEMENT_TYPE_LABELS[movement.tipo]}</span></td>
                  <td className="px-4 py-3"><span className="font-medium text-brand-ink">{movement.nombre}</span><span className="block font-mono text-xs text-brand-muted">{movement.codigo ?? 'Sin código'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-brand-ink">{movement.warehouseCodigo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-ink">{movement.tipo === 'salida' ? `-${movement.cantidad}` : `+${movement.cantidad}`}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-primaryInk">{movement.saldoResultante}</td>
                  <td className="max-w-64 truncate px-4 py-3 text-brand-muted" title={movement.motivo}>{movement.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={movementPage} totalPages={movementsQuery.data?.totalPages ?? 0} total={movementsQuery.data?.total ?? 0} onPageChange={setMovementPage} />
      </section>

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
        <StockMovementModal warehouse={selected} onClose={() => setShowMovementModal(false)} />
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
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
};

const InventoryMetric = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof WarehouseIcon;
  label: string;
  value: number;
  tone: 'blue' | 'slate' | 'amber' | 'red';
}) => {
  const tones = {
    blue: 'bg-brand-pale text-brand-primaryInk',
    slate: 'bg-brand-pale text-brand-ink',
    amber: 'bg-brand-goldPale text-brand-goldInk',
    red: 'bg-brand-coralPale text-brand-coralInk',
  } as const;
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-xl border border-brand-line bg-white p-4 shadow-sm">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="text-2xl font-bold text-brand-ink">{value}</p><p className="truncate text-sm font-medium text-brand-muted">{label}</p></div>
    </div>
  );
};

const WarehouseDeliveryModal = ({
  request,
  warehouses,
  onClose,
}: {
  request: WarehouseWorkOrderRequest;
  warehouses: Warehouse[];
  onClose: () => void;
}) => {
  const [warehouseId, setWarehouseId] = useState<number | null>(warehouses[0]?.id ?? null);
  const [comentario, setComentario] = useState('');
  const balancesQuery = useWarehouseBalances(warehouseId);
  const deliverMutation = useDeliverWarehouseRequestMutation();
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
  const stock = balancesQuery.data?.find((balance) => balance.catalogItemId === request.catalogItemId)?.cantidad ?? 0;
  const insufficientStock = !balancesQuery.isPending && stock < request.cantidad;

  const submit = (): void => {
    if (warehouseId === null || insufficientStock) return;
    deliverMutation.mutate(
      { requestId: request.id, warehouseId, comentario: comentario.trim() || undefined },
      {
        onSuccess: (delivered) => {
          notifySuccess(`${delivered.catalogItem.nombre} entregado a ${delivered.workOrder.codigo}.`);
          onClose();
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo registrar la entrega.')),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-scrim/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-xl sm:rounded-xl" role="dialog" aria-modal="true" aria-labelledby="warehouse-delivery-title">
        {/* Igual que la banda superior: este header lleva un badge dorado, que
          sobre índigo queda en 2.9:1. */}
      <header className="bg-brand-surfaceDark px-5 py-5 text-white sm:rounded-t-xl">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-primaryInk text-white"><PackageCheck className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase text-brand-cyanInk">{request.workOrder.codigo} · {request.workOrder.vehicle?.patente ?? 'Sin patente'}</p><h2 id="warehouse-delivery-title" className="mt-1 text-xl font-bold">Confirmar entrega de repuesto</h2></div></div>
        </header>
        <div className="space-y-5 p-5">
          <div className="rounded-lg border border-brand-line bg-brand-line/40 p-4"><p className="font-bold text-brand-ink">{request.catalogItem.nombre}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-muted"><span>Código: <strong className="font-mono text-brand-ink">{request.catalogItem.codigo ?? '—'}</strong></span><span>Cantidad aprobada: <strong className="text-brand-primaryInk">{request.cantidad}</strong></span></div><p className="mt-2 text-sm text-brand-muted">{request.motivo}</p></div>
          <label className="block text-sm font-semibold text-brand-ink">Almacén de salida<select value={warehouseId ?? ''} onChange={(event) => setWarehouseId(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-brand-line bg-white px-3 font-normal outline-none focus:border-brand-primary"><option value="" disabled>Seleccione almacén</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.codigo} · {warehouse.nombre}</option>)}</select></label>
          <div className={`grid grid-cols-2 gap-3 rounded-lg border p-4 ${insufficientStock ? 'border-brand-coral/30 bg-brand-coralPale' : 'border-brand-line bg-brand-mintPale'}`}><div><p className="text-xs font-semibold uppercase text-brand-muted">Disponible</p><p className={`mt-1 text-2xl font-bold ${insufficientStock ? 'text-brand-coralInk' : 'text-brand-mintInk'}`}>{balancesQuery.isPending ? '…' : stock}</p></div><div><p className="text-xs font-semibold uppercase text-brand-muted">Saldo posterior</p><p className={`mt-1 text-2xl font-bold ${insufficientStock ? 'text-brand-coralInk' : 'text-brand-primaryInk'}`}>{balancesQuery.isPending ? '…' : stock - request.cantidad}</p></div>{insufficientStock && <p className="col-span-2 text-sm font-semibold text-brand-coralInk" role="alert">Stock insuficiente en {selectedWarehouse?.codigo}. Traslade o ingrese existencias antes de entregar.</p>}</div>
          <label className="block text-sm font-semibold text-brand-ink">Observación de entrega <span className="font-normal text-brand-muted">(opcional)</span><textarea value={comentario} onChange={(event) => setComentario(event.target.value)} rows={3} maxLength={500} className="mt-2 w-full resize-none rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary" placeholder="Serie, ubicación física, indicación para el mecánico…" /></label>
          {deliverMutation.isError && <div className="rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk" role="alert">{getApiErrorMessage(deliverMutation.error)}</div>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-brand-line px-5 py-4 sm:flex-row sm:justify-end"><button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale" onClick={onClose}>Cancelar</button><button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-5 text-sm font-bold text-white hover:bg-brand-primaryInkHover disabled:cursor-not-allowed disabled:opacity-50" onClick={submit} disabled={warehouseId === null || balancesQuery.isPending || insufficientStock || deliverMutation.isPending}>{deliverMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}{deliverMutation.isPending ? 'Entregando…' : 'Confirmar entrega'}</button></footer>
      </section>
    </div>
  );
};

const WarehouseFormModal = ({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse | null;
  onClose: () => void;
}) => {
  const [codigo, setCodigo] = useState(warehouse?.codigo ?? '');
  const [nombre, setNombre] = useState(warehouse?.nombre ?? '');
  const [direccion, setDireccion] = useState(warehouse?.direccion ?? '');
  const [activo, setActivo] = useState(warehouse?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateWarehouseMutation();
  const updateMutation = useUpdateWarehouseMutation();
  const pending = createMutation.isPending || updateMutation.isPending;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    if (warehouse) {
      updateMutation.mutate(
        { id: warehouse.id, data: { nombre, direccion, activo } },
        {
          onSuccess: () => {
            notifySuccess(`Almacén ${warehouse.codigo} actualizado.`);
            onClose();
          },
          onError: (mutationError) => {
            const message = getApiErrorMessage(mutationError);
            setError(message);
            notifyError(message);
          },
        },
      );
      return;
    }
    createMutation.mutate(
      { codigo, nombre, direccion, activo },
      {
        onSuccess: (created) => {
          notifySuccess(`Almacén ${created.codigo} creado.`);
          onClose();
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError);
          setError(message);
          notifyError(message);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-brand-scrim/55" aria-label="Cerrar almacén" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="warehouse-modal-title">
        <h2 id="warehouse-modal-title" className="text-xl font-bold text-brand-primaryInk">
          {warehouse ? `Editar ${warehouse.codigo}` : 'Nuevo almacén'}
        </h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {!warehouse && (
            <label className="block text-sm font-semibold text-brand-ink">
              Código
              <input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-mono font-normal outline-none focus:border-brand-primary" placeholder="BOD-02" maxLength={20} />
            </label>
          )}
          <label className="block text-sm font-semibold text-brand-ink">
            Nombre
            <input value={nombre} onChange={(event) => setNombre(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" placeholder="Bodega Norte" maxLength={120} />
          </label>
          <label className="block text-sm font-semibold text-brand-ink">
            Dirección
            <input value={direccion} onChange={(event) => setDireccion(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" placeholder="Opcional" maxLength={255} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
            <input type="checkbox" checked={activo} onChange={(event) => setActivo(event.target.checked)} className="h-4 w-4 rounded border-brand-line" />
            Almacén activo
          </label>
          {error && <p className="text-sm text-brand-coralInk" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>
              {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {warehouse ? 'Guardar' : 'Crear almacén'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

const StockMovementModal = ({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }) => {
  const [tipo, setTipo] = useState<'ingreso' | 'salida' | 'ajuste'>('ingreso');
  const [catalogItemId, setCatalogItemId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateStockMovementMutation();

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    if (!catalogItemId) {
      setError('Seleccione un repuesto del catálogo.');
      return;
    }
    mutation.mutate(
      { catalogItemId, warehouseId: warehouse.id, tipo, cantidad: Number(cantidad), motivo },
      {
        onSuccess: (movement) => {
          notifySuccess(`${MOVEMENT_TYPE_LABELS[movement.tipo]} registrado. Saldo: ${movement.saldoResultante}.`);
          onClose();
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError);
          setError(message);
          notifyError(message);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-brand-scrim/55" aria-label="Cerrar movimiento" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title">
        <h2 id="movement-modal-title" className="text-xl font-bold text-brand-primaryInk">Movimiento · {warehouse.codigo}</h2>
        <p className="mt-1 text-sm text-brand-muted">{warehouse.nombre}</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de movimiento">
            {(['ingreso', 'salida', 'ajuste'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTipo(option)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-bold ${
                  tipo === option ? 'bg-brand-primaryInk text-white' : 'bg-brand-pale text-brand-muted hover:bg-brand-line'
                }`}
              >
                {option === 'ingreso' ? <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" /> : option === 'salida' ? <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> : null}
                {MOVEMENT_TYPE_LABELS[option]}
              </button>
            ))}
          </div>
          <PartPicker selectedId={catalogItemId} onSelect={(item) => setCatalogItemId(item.id)} />
          <label className="block text-sm font-semibold text-brand-ink">
            {tipo === 'ajuste' ? 'Nuevo saldo' : 'Cantidad'}
            <input type="number" min="1" step="1" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" />
          </label>
          <label className="block text-sm font-semibold text-brand-ink">
            Motivo
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" placeholder="Compra proveedor, conteo físico..." maxLength={255} />
          </label>
          {error && <p className="text-sm text-brand-coralInk" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Registrar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

const StockTransferModal = ({
  warehouses,
  defaultOriginId,
  onClose,
}: {
  warehouses: Warehouse[];
  defaultOriginId: number | null;
  onClose: () => void;
}) => {
  const actives = warehouses.filter((warehouse) => warehouse.activo);
  const [originId, setOriginId] = useState<number | null>(
    defaultOriginId ?? actives[0]?.id ?? null,
  );
  const [destinationId, setDestinationId] = useState<number | null>(
    actives.find((warehouse) => warehouse.id !== (defaultOriginId ?? actives[0]?.id))?.id ?? null,
  );
  const [catalogItemId, setCatalogItemId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateStockTransferMutation();

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    if (!originId || !destinationId) {
      setError('Seleccione origen y destino.');
      return;
    }
    if (originId === destinationId) {
      setError('El origen y el destino deben ser distintos.');
      return;
    }
    if (!catalogItemId) {
      setError('Seleccione un repuesto del catálogo.');
      return;
    }
    mutation.mutate(
      {
        catalogItemId,
        originWarehouseId: originId,
        destinationWarehouseId: destinationId,
        cantidad: Number(cantidad),
        motivo,
      },
      {
        onSuccess: (result) => {
          notifySuccess(`Traslado ${result.referencia} registrado.`);
          onClose();
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError);
          setError(message);
          notifyError(message);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-brand-scrim/55" aria-label="Cerrar traslado" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title">
        <h2 id="transfer-modal-title" className="text-xl font-bold text-brand-primaryInk">Trasladar stock</h2>
        <p className="mt-1 text-sm text-brand-muted">Salida en origen e ingreso en destino con la misma referencia.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-brand-ink">
              Origen
              <select value={originId ?? ''} onChange={(event) => setOriginId(Number(event.target.value) || null)} className="mt-2 h-10 w-full rounded-lg border border-brand-line bg-white px-3 font-normal outline-none focus:border-brand-primary" aria-label="Almacén origen">
                {actives.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.codigo}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-brand-ink">
              Destino
              <select value={destinationId ?? ''} onChange={(event) => setDestinationId(Number(event.target.value) || null)} className="mt-2 h-10 w-full rounded-lg border border-brand-line bg-white px-3 font-normal outline-none focus:border-brand-primary" aria-label="Almacén destino">
                {actives.filter((warehouse) => warehouse.id !== originId).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.codigo}</option>
                ))}
              </select>
            </label>
          </div>
          <PartPicker selectedId={catalogItemId} onSelect={(item) => setCatalogItemId(item.id)} />
          <label className="block text-sm font-semibold text-brand-ink">
            Cantidad
            <input type="number" min="1" step="1" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" />
          </label>
          <label className="block text-sm font-semibold text-brand-ink">
            Motivo
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary" placeholder="Reposición de sucursal..." maxLength={255} />
          </label>
          {error && <p className="text-sm text-brand-coralInk" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Trasladar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default WarehousesPage;
