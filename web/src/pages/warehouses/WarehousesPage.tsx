import { AlertCircle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, History, LoaderCircle, Pencil, Plus, Search, Warehouse as WarehouseIcon } from 'lucide-react';
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
  useStockMovements,
  useUpdateWarehouseMutation,
  useWarehouseBalances,
  useWarehouses,
} from '../../hooks/useWarehouses';

import type { CatalogItem, StockMovement, Warehouse } from '../../types/entities';

const MOVEMENT_TYPE_LABELS: Record<StockMovement['tipo'], string> = {
  ingreso: 'Ingreso',
  salida: 'Salida',
  ajuste: 'Ajuste',
  traslado_salida: 'Traslado sal.',
  traslado_ingreso: 'Traslado ing.',
  consumo_ot: 'Consumo OT',
};

const MOVEMENT_TYPE_STYLES: Record<StockMovement['tipo'], string> = {
  ingreso: 'bg-emerald-100 text-emerald-800',
  salida: 'bg-red-100 text-red-700',
  ajuste: 'bg-slate-200 text-slate-700',
  traslado_salida: 'bg-amber-100 text-amber-800',
  traslado_ingreso: 'bg-blue-100 text-brand-blue',
  consumo_ot: 'bg-violet-100 text-violet-800',
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
      <label className="block text-sm font-semibold text-slate-700">
        Repuesto
        <span className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            value={selected ? `${selected.codigo ?? ''} ${selected.nombre}`.trim() : search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onFocus={() => setSearch('')}
            className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm font-normal outline-none focus:border-brand-blue"
            placeholder="Buscar repuesto por nombre o código"
            aria-label="Buscar repuesto"
            autoComplete="off"
          />
        </span>
      </label>
      {search !== '' && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {partsQuery.isPending && <p className="px-3 py-3 text-sm text-slate-500">Buscando...</p>}
          {!partsQuery.isPending && (partsQuery.data?.items.length ?? 0) === 0 && (
            <p className="px-3 py-3 text-sm text-slate-500">Sin resultados.</p>
          )}
          {partsQuery.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                onSelect(item);
                setSearch('');
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{item.nombre}</span>
                <span className="block font-mono text-xs text-slate-500">{item.codigo ?? 'Sin código'} · Stock global {item.stock}</span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-brand-blue">{formatClp(item.precio)}</span>
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

  const warehousesQuery = useWarehouses({ page: 1, pageSize: 50, search: search || undefined });
  const balancesQuery = useWarehouseBalances(selectedId);
  const movementsQuery = useStockMovements({
    page: movementPage,
    pageSize: 15,
    warehouseId: selectedId ?? undefined,
    fechaDesde,
    fechaHasta,
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
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Inventario por bodega</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Almacenes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && selected !== null && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark"
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
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue hover:bg-brand-light"
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
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400"
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

      {(warehousesQuery.isError || balancesQuery.isError || movementsQuery.isError) && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(warehousesQuery.error ?? balancesQuery.error ?? movementsQuery.error)}
        </div>
      )}

      <section aria-label="Almacenes">
        {warehousesQuery.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center">
            <WarehouseIcon className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-700">Sin almacenes registrados</p>
            <p className="mt-1 text-sm text-slate-500">Cree la primera bodega para llevar stock por ubicación.</p>
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
                      active ? 'border-brand-blue ring-2 ring-brand-blue/30' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-xs font-bold text-white">{warehouse.codigo}</span>
                      {warehouse.activo ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Activo</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">Inactivo</span>
                      )}
                    </div>
                    <p className="mt-2 truncate font-bold text-brand-blue">{warehouse.nombre}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      <strong className="text-slate-900">{warehouse.totalItems}</strong> ítems ·{' '}
                      <strong className="text-slate-900">{warehouse.totalUnidades}</strong> uds.
                    </p>
                    {canUpdate && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Editar ${warehouse.codigo}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-blue"
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
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={`Stock de ${selected.codigo}`}>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-brand-blue">Stock · {selected.nombre}</h2>
              <p className="mt-0.5 text-xs text-slate-500">Saldos por repuesto en este almacén.</p>
            </div>
            <label className="relative sm:w-72">
              <span className="sr-only">Buscar en stock</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                value={balanceSearch}
                onChange={(event) => setBalanceSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Buscar repuesto o código"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3 font-semibold">Código</th><th className="px-4 py-3 font-semibold">Repuesto</th><th className="px-4 py-3 text-right font-semibold">Precio</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th></tr>
              </thead>
              <tbody>
                {balancesQuery.isPending ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">Cargando stock...</td></tr>
                ) : filteredBalances.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500"><Boxes className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-2">Sin saldos registrados.</p></td></tr>
                ) : filteredBalances.map((balance) => (
                  <tr key={balance.catalogItemId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{balance.codigo ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{balance.nombre}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatClp(balance.precio)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`rounded-md px-2 py-1 text-sm font-bold ${balance.cantidad > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{balance.cantidad}</span>
                      {balance.bajoMinimo && <span className="ml-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800" title={`Mínimo configurado: ${balance.stockMinimo}`}>Bajo mínimo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Kardex de movimientos">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[170px_170px_1fr]">
          <label className="text-xs font-semibold uppercase text-slate-500">Fecha desde<input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700" aria-label="Fecha desde" /></label>
          <label className="text-xs font-semibold uppercase text-slate-500">Fecha hasta<input type="date" value={fechaHasta} min={fechaDesde} onChange={(event) => setFechaHasta(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700" aria-label="Fecha hasta" /></label>
          <div className="flex items-end gap-2 text-sm text-slate-500"><History className="mb-2.5 h-4 w-4" aria-hidden="true" /><p className="pb-2">Kardex: cada ingreso, salida y ajuste con su saldo resultante.</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 font-semibold">Repuesto</th><th className="px-4 py-3 font-semibold">Almacén</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th><th className="px-4 py-3 text-right font-semibold">Saldo</th><th className="px-4 py-3 font-semibold">Motivo</th></tr>
            </thead>
            <tbody>
              {movementsQuery.isPending ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Cargando movimientos...</td></tr>
              ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Sin movimientos en el período.</td></tr>
              ) : movementsQuery.data?.items.map((movement) => (
                <tr key={movement.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(movement.fecha)}</td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold ${MOVEMENT_TYPE_STYLES[movement.tipo]}`}>{MOVEMENT_TYPE_LABELS[movement.tipo]}</span></td>
                  <td className="px-4 py-3"><span className="font-medium text-slate-800">{movement.nombre}</span><span className="block font-mono text-xs text-slate-500">{movement.codigo ?? 'Sin código'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-700">{movement.warehouseCodigo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{movement.tipo === 'salida' ? `-${movement.cantidad}` : `+${movement.cantidad}`}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-blue">{movement.saldoResultante}</td>
                  <td className="max-w-64 truncate px-4 py-3 text-slate-600" title={movement.motivo}>{movement.motivo}</td>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar almacén" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="warehouse-modal-title">
        <h2 id="warehouse-modal-title" className="text-xl font-bold text-brand-blue">
          {warehouse ? `Editar ${warehouse.codigo}` : 'Nuevo almacén'}
        </h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {!warehouse && (
            <label className="block text-sm font-semibold text-slate-700">
              Código
              <input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-mono font-normal outline-none focus:border-brand-blue" placeholder="BOD-02" maxLength={20} />
            </label>
          )}
          <label className="block text-sm font-semibold text-slate-700">
            Nombre
            <input value={nombre} onChange={(event) => setNombre(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" placeholder="Bodega Norte" maxLength={120} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Dirección
            <input value={direccion} onChange={(event) => setDireccion(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" placeholder="Opcional" maxLength={255} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={activo} onChange={(event) => setActivo(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Almacén activo
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar movimiento" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title">
        <h2 id="movement-modal-title" className="text-xl font-bold text-brand-blue">Movimiento · {warehouse.codigo}</h2>
        <p className="mt-1 text-sm text-slate-500">{warehouse.nombre}</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de movimiento">
            {(['ingreso', 'salida', 'ajuste'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTipo(option)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-bold ${
                  tipo === option ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option === 'ingreso' ? <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" /> : option === 'salida' ? <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> : null}
                {MOVEMENT_TYPE_LABELS[option]}
              </button>
            ))}
          </div>
          <PartPicker selectedId={catalogItemId} onSelect={(item) => setCatalogItemId(item.id)} />
          <label className="block text-sm font-semibold text-slate-700">
            {tipo === 'ajuste' ? 'Nuevo saldo' : 'Cantidad'}
            <input type="number" min="1" step="1" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Motivo
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" placeholder="Compra proveedor, conteo físico..." maxLength={255} />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={mutation.isPending}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar traslado" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title">
        <h2 id="transfer-modal-title" className="text-xl font-bold text-brand-blue">Trasladar stock</h2>
        <p className="mt-1 text-sm text-slate-500">Salida en origen e ingreso en destino con la misma referencia.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Origen
              <select value={originId ?? ''} onChange={(event) => setOriginId(Number(event.target.value) || null)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue" aria-label="Almacén origen">
                {actives.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.codigo}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Destino
              <select value={destinationId ?? ''} onChange={(event) => setDestinationId(Number(event.target.value) || null)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue" aria-label="Almacén destino">
                {actives.filter((warehouse) => warehouse.id !== originId).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.codigo}</option>
                ))}
              </select>
            </label>
          </div>
          <PartPicker selectedId={catalogItemId} onSelect={(item) => setCatalogItemId(item.id)} />
          <label className="block text-sm font-semibold text-slate-700">
            Cantidad
            <input type="number" min="1" step="1" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Motivo
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" placeholder="Reposición de sucursal..." maxLength={255} />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={mutation.isPending}>
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
