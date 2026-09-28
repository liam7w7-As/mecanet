import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  LoaderCircle,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { AnimateIcon } from '../animate-ui';
import {
  useCreateStockMovementMutation,
  useWarehouseBalances,
  useWarehouses,
} from '../../hooks/useWarehouses';
import { getApiErrorMessage } from '../../lib/api-error';
import { notifySuccess } from '../../stores/toast.store';

import type { CatalogItem } from '../../types/entities';

interface StockAdjustmentModalProps {
  item: Pick<CatalogItem, 'id' | 'codigo' | 'nombre' | 'stock'>;
  onClose: () => void;
}

type MovementType = 'ingreso' | 'salida';

export const StockAdjustmentModal = ({ item, onClose }: StockAdjustmentModalProps) => {
  const warehousesQuery = useWarehouses({ page: 1, pageSize: 100, soloActivos: true });
  const activeWarehouses = useMemo(
    () => warehousesQuery.data?.items.filter((warehouse) => warehouse.activo) ?? [],
    [warehousesQuery.data],
  );
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [movementType, setMovementType] = useState<MovementType>('ingreso');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const balancesQuery = useWarehouseBalances(warehouseId);
  const movementMutation = useCreateStockMovementMutation();

  useEffect(() => {
    if (warehouseId === null && activeWarehouses[0]) {
      setWarehouseId(activeWarehouses[0].id);
    }
  }, [activeWarehouses, warehouseId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !movementMutation.isPending) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [movementMutation.isPending, onClose]);

  const selectedWarehouse = activeWarehouses.find((warehouse) => warehouse.id === warehouseId);
  const warehouseStock =
    balancesQuery.data?.find((balance) => balance.catalogItemId === item.id)?.cantidad ?? 0;
  const numericQuantity = Number(quantity);
  const signedQuantity = movementType === 'ingreso' ? numericQuantity : -numericQuantity;
  const nextWarehouseStock =
    warehouseStock + (Number.isFinite(signedQuantity) ? signedQuantity : 0);
  const nextGlobalStock = item.stock + (Number.isFinite(signedQuantity) ? signedQuantity : 0);

  const changeMovementType = (nextType: MovementType): void => {
    setMovementType(nextType);
    setFieldErrors({});
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    movementMutation.reset();
    const errors: Record<string, string> = {};

    if (warehouseId === null) errors.warehouseId = 'Seleccione el almacén del movimiento';
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      errors.cantidad = 'La cantidad debe ser un entero mayor a 0';
    }
    if (movementType === 'salida' && numericQuantity > warehouseStock) {
      errors.cantidad = `La salida no puede superar las ${warehouseStock} unidades disponibles en esta bodega`;
    }
    if (reason.trim().length < 2) {
      errors.motivo = 'Indique un motivo para conservar la trazabilidad';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || warehouseId === null) return;

    movementMutation.mutate(
      {
        catalogItemId: item.id,
        warehouseId,
        tipo: movementType,
        cantidad: numericQuantity,
        motivo: reason.trim(),
      },
      {
        onSuccess: (movement) => {
          notifySuccess(
            `${movementType === 'ingreso' ? 'Entrada' : 'Salida'} registrada en ${movement.warehouseCodigo}.`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
        aria-label="Cerrar ajuste de stock"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-adjustment-title"
      >
        <header className="bg-brand-blue px-5 py-4 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-white/65">
                Movimiento de inventario
              </p>
              <h2 id="stock-adjustment-title" className="mt-1 text-xl font-bold">
                {item.nombre}
              </h2>
              <p className="mt-1 truncate font-mono text-xs text-white/70">
                {item.codigo ?? 'SIN CÓDIGO'} · Stock global {item.stock}
              </p>
            </div>
            <button
              type="button"
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
            >
              <AnimateIcon icon={X} animation="spin" size={17} />
            </button>
          </div>
        </header>

        <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de movimiento">
            <button
              type="button"
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${
                movementType === 'ingreso'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => changeMovementType('ingreso')}
              aria-pressed={movementType === 'ingreso'}
            >
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> Entrada
            </button>
            <button
              type="button"
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${
                movementType === 'salida'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => changeMovementType('salida')}
              aria-pressed={movementType === 'salida'}
            >
              <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" /> Salida
            </button>
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            Almacén
            <span className="relative mt-1 block">
              <WarehouseIcon
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={warehouseId ?? ''}
                onChange={(event) => {
                  setWarehouseId(event.target.value ? Number(event.target.value) : null);
                  setFieldErrors({});
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                aria-invalid={Boolean(fieldErrors.warehouseId)}
                disabled={warehousesQuery.isPending || activeWarehouses.length === 0}
              >
                {activeWarehouses.length === 0 && <option value="">Sin almacenes activos</option>}
                {activeWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.codigo} · {warehouse.nombre}
                  </option>
                ))}
              </select>
            </span>
            {fieldErrors.warehouseId && (
              <span className="mt-1 block text-xs text-red-600" role="alert">
                {fieldErrors.warehouseId}
              </span>
            )}
          </label>

          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center">
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500">En bodega</p>
              <p className="mt-1 text-xl font-bold text-brand-blue" data-testid="current-stock">
                {balancesQuery.isPending ? '…' : warehouseStock}
              </p>
            </div>
            <div className="border-x border-slate-200 p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Quedará</p>
              <p
                className={`mt-1 text-xl font-bold ${nextWarehouseStock < 0 ? 'text-red-600' : 'text-brand-blue'}`}
                data-testid="next-stock"
              >
                {nextWarehouseStock}
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Global</p>
              <p className="mt-1 text-xl font-bold text-slate-800">{nextGlobalStock}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
            <label className="block text-sm font-semibold text-slate-700">
              Cantidad
              <input
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setFieldErrors({});
                }}
                aria-invalid={Boolean(fieldErrors.cantidad)}
              />
              {fieldErrors.cantidad && (
                <span className="mt-1 block text-xs text-red-600" role="alert">
                  {fieldErrors.cantidad}
                </span>
              )}
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Motivo
              <input
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setFieldErrors({});
                }}
                placeholder={
                  movementType === 'ingreso' ? 'Recepción de proveedor' : 'Entrega a taller'
                }
                aria-invalid={Boolean(fieldErrors.motivo)}
              />
              {fieldErrors.motivo && (
                <span className="mt-1 block text-xs text-red-600" role="alert">
                  {fieldErrors.motivo}
                </span>
              )}
            </label>
          </div>

          {warehousesQuery.isError && (
            <div
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              No se pudieron cargar los almacenes.
            </div>
          )}
          {activeWarehouses.length === 0 &&
            !warehousesQuery.isPending &&
            !warehousesQuery.isError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
                role="alert"
              >
                <Boxes className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Cree o active un almacén antes de registrar movimientos.
              </div>
            )}
          {movementMutation.error && (
            <div
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {getApiErrorMessage(movementMutation.error)}
            </div>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              disabled={movementMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-5 text-sm font-bold text-brand-dark hover:bg-yellow-400 disabled:opacity-60"
              disabled={
                movementMutation.isPending ||
                activeWarehouses.length === 0 ||
                selectedWarehouse === undefined
              }
            >
              {movementMutation.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {movementMutation.isPending ? 'Registrando...' : 'Confirmar movimiento'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default StockAdjustmentModal;
