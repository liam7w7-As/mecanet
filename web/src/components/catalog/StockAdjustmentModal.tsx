import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  useCreateStockMovementMutation,
  useWarehouseBalances,
  useWarehouses,
} from '../../hooks/useWarehouses';
import { getApiErrorMessage } from '../../lib/api-error';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

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

  useEffect(() => {
    if (warehouseId === null && activeWarehouses[0]) {
      setWarehouseId(activeWarehouses[0].id);
    }
  }, [activeWarehouses, warehouseId]);
  const dirty =
    movementType !== 'ingreso' ||
    quantity !== '1' ||
    reason !== '' ||
    (warehouseId !== null && warehouseId !== activeWarehouses[0]?.id);
  return (
    <FormDialog
      id="stock-adjustment-title"
      title="Movimiento de inventario"
      code={item.codigo ?? 'SIN CÓDIGO'}
      context={item.nombre}
      submitLabel="Confirmar movimiento"
      dirty={dirty}
      pending={movementMutation.isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      headerVariant="plain"
      className="inventory-form reference-form-dialog stock-form-dialog catalog-stock-dialog"
      submitDisabled={
        warehousesQuery.isPending ||
        warehousesQuery.isError ||
        balancesQuery.isPending ||
        balancesQuery.isError ||
        activeWarehouses.length === 0 ||
        selectedWarehouse === undefined
      }
    >
      <div className="inventory-form-fields catalog-stock-fields">
        <div className="inventory-profile-hero">
          <Boxes aria-hidden="true" />
          <div>
            <small>Repuesto · Stock global {item.stock}</small>
            <h3>{item.nombre}</h3>
          </div>
        </div>
        <div className="catalog-movement-selector grid grid-cols-2 gap-2" role="group" aria-label="Tipo de movimiento">
          <button
            type="button"
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${
              movementType === 'ingreso'
                ? 'border-brand-mintInk bg-brand-mintPale text-brand-mintInk'
                : 'border-brand-line text-brand-muted hover:bg-brand-pale'
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
                ? 'border-brand-coralInk bg-brand-coralPale text-brand-coralInk'
                : 'border-brand-line text-brand-muted hover:bg-brand-pale'
            }`}
            onClick={() => changeMovementType('salida')}
            aria-pressed={movementType === 'salida'}
          >
            <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" /> Salida
          </button>
        </div>

        <label className="block text-sm font-semibold text-brand-ink">
          Almacén
          <span className="relative mt-1 block">
            <WarehouseIcon
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
              aria-hidden="true"
            />
            <select
              value={warehouseId ?? ''}
              onChange={(event) => {
                setWarehouseId(event.target.value ? Number(event.target.value) : null);
                setFieldErrors({});
              }}
              className="h-10 w-full rounded-lg border border-brand-line bg-white pl-9 pr-3 text-sm font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
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
            <span className="mt-1 block text-xs text-brand-coralInk" role="alert">
              {fieldErrors.warehouseId}
            </span>
          )}
        </label>

        <div className="catalog-stock-preview grid grid-cols-3 overflow-hidden rounded-lg border border-brand-line bg-brand-line/40 text-center" aria-live="polite" aria-atomic="true">
          <div className="p-3">
            <p className="text-[11px] font-semibold uppercase text-brand-muted">En bodega</p>
            <p className="mt-1 text-xl font-bold text-brand-primaryInk" data-testid="current-stock">
              {balancesQuery.isPending ? '…' : warehouseStock}
            </p>
          </div>
          <div className="border-x border-brand-line p-3">
            <p className="text-[11px] font-semibold uppercase text-brand-muted">Quedará</p>
            <p
              className={`mt-1 text-xl font-bold ${nextWarehouseStock < 0 ? 'text-brand-coralInk' : 'text-brand-primaryInk'}`}
              data-testid="next-stock"
            >
              {nextWarehouseStock}
            </p>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-semibold uppercase text-brand-muted">Global</p>
            <p className="mt-1 text-xl font-bold text-brand-ink">{nextGlobalStock}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
          <label className="block text-sm font-semibold text-brand-ink">
            Cantidad
            <input
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk"
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
              <span className="mt-1 block text-xs text-brand-coralInk" role="alert">
                {fieldErrors.cantidad}
              </span>
            )}
          </label>
          <label className="block text-sm font-semibold text-brand-ink">
            Motivo
            <input
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk"
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
              <span className="mt-1 block text-xs text-brand-coralInk" role="alert">
                {fieldErrors.motivo}
              </span>
            )}
          </label>
        </div>

        {warehousesQuery.isError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
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
              className="flex items-start gap-2 rounded-lg border border-brand-line bg-brand-goldPale px-3 py-2.5 text-sm text-brand-goldInk"
              role="alert"
            >
              <Boxes className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Cree o active un almacén antes de registrar movimientos.
            </div>
          )}
        {movementMutation.error && (
          <div
            className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(movementMutation.error)}
          </div>
        )}

        {balancesQuery.isError && (
          <p className="inventory-alert" role="alert">
            No se pudo consultar el saldo del almacén. Reintente antes de registrar el movimiento.
          </p>
        )}
      </div>
    </FormDialog>
  );
};

export default StockAdjustmentModal;
