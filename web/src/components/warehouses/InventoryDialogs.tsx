import {
  createStockMovementSchema,
  createStockTransferSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
} from '@unithor/shared';
import {
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  Search,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { useId, useState } from 'react';

import {
  useCatalogParts,
  useCreateStockMovementMutation,
  useCreateStockTransferMutation,
  useCreateWarehouseMutation,
  useDeliverWarehouseRequestMutation,
  useUpdateWarehouseMutation,
  useWarehouseBalances,
} from '../../hooks/useWarehouses';
import { getApiErrorMessage } from '../../lib/api-error';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type {
  CatalogItem,
  StockBalance,
  Warehouse,
  WarehouseWorkOrderRequest,
} from '../../types/entities';

type Part = Pick<CatalogItem, 'id' | 'nombre' | 'codigo'>;
const inputClass = 'inventory-field';

/** The selected record survives subsequent searches and can be replaced explicitly. */
function PartPicker({
  selected,
  onChange,
}: {
  selected: Part | null;
  onChange: (part: Part | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const query = useCatalogParts(search);
  const items = query.data?.items ?? [];
  const choose = (part: Part) => {
    onChange(part);
    setSearch('');
    setOpen(false);
  };
  return (
    <div className="inventory-part-picker">
      <label>
        <span>Repuesto</span>
        <span className="inventory-picker-input">
          <Search aria-hidden="true" />
          <input
            className={inputClass}
            value={
              selected ? [selected.codigo, selected.nombre].filter(Boolean).join(' · ') : search
            }
            aria-label="Buscar repuesto"
            placeholder="Buscar repuesto por nombre o código"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && items[activeIndex] ? listId + '-' + items[activeIndex].id : undefined
            }
            onFocus={() => {
              if (!selected) setOpen(true);
            }}
            onChange={(event) => {
              onChange(null);
              setSearch(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((index) =>
                  Math.max(
                    0,
                    Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                  ),
                );
              }
              if (event.key === 'Enter' && open) {
                event.preventDefault();
                if (items[activeIndex]) choose(items[activeIndex]);
              }
            }}
          />
          {selected && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(true);
              }}
              aria-label="Cambiar repuesto"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </span>
      </label>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Repuestos encontrados"
          className="inventory-picker-results"
        >
          {query.isPending ? (
            <p>Buscando…</p>
          ) : query.isError ? (
            <p role="alert">No se pudieron cargar los repuestos.</p>
          ) : items.length === 0 ? (
            <p>Sin resultados.</p>
          ) : (
            items.map((part, index) => (
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                key={part.id}
                id={listId + '-' + part.id}
                onClick={() => choose(part)}
              >
                <Boxes aria-hidden="true" />
                <span>
                  <strong>{part.nombre}</strong>
                  <small>
                    {part.codigo ?? 'Sin código'} · Stock global {part.stock}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BalancePreview({
  loading,
  current,
  next,
  error,
}: {
  loading: boolean;
  current: number;
  next: number;
  error: boolean;
}) {
  return (
    <div
      className={
        'inventory-balance-preview' + (next < 0 ? ' inventory-balance-preview--invalid' : '')
      }
      aria-live="polite"
    >
      <div>
        <small>Disponible en bodega</small>
        <strong>{loading || error ? '—' : current}</strong>
      </div>
      <ArrowLeftRight aria-hidden="true" />
      <div>
        <small>Saldo posterior</small>
        <strong>{loading || error ? '—' : next}</strong>
      </div>
      {error && <p role="alert">No se pudo consultar el stock. Reintente antes de confirmar.</p>}
      {!loading && !error && next < 0 && (
        <p role="alert">Stock insuficiente en el almacén seleccionado.</p>
      )}
    </div>
  );
}

export function WarehouseFormModal({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse | null;
  onClose: () => void;
}) {
  const initial = {
    codigo: warehouse?.codigo ?? '',
    nombre: warehouse?.nombre ?? '',
    direccion: warehouse?.direccion ?? '',
    activo: warehouse?.activo ?? true,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateWarehouseMutation();
  const updateMutation = useUpdateWarehouseMutation();
  const pending = createMutation.isPending || updateMutation.isPending;
  return (
    <FormDialog
      id="warehouse-modal-title"
      title={warehouse ? 'Editar ' + warehouse.codigo : 'Nuevo almacén'}
      code={warehouse?.codigo ?? 'Almacenes'}
      context="Datos de la bodega"
      submitLabel={warehouse ? 'Guardar cambios' : 'Crear almacén'}
      dirty={JSON.stringify(form) !== JSON.stringify(initial)}
      pending={pending}
      onClose={onClose}
      headerVariant="brand"
      headerIcon={<WarehouseIcon aria-hidden="true" />}
      className="inventory-form reference-form-dialog warehouse-form-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const callbacks = {
          onSuccess: () => {
            notifySuccess(warehouse ? 'Almacén actualizado.' : 'Almacén creado.');
            onClose();
          },
          onError: (failure: unknown) => setError(getApiErrorMessage(failure)),
        };
        if (warehouse) {
          const result = updateWarehouseSchema.safeParse({
            nombre: form.nombre,
            direccion: form.direccion,
            activo: form.activo,
          });
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? 'Revise los datos.');
            return;
          }
          updateMutation.mutate({ id: warehouse.id, data: result.data }, callbacks);
        } else {
          const result = createWarehouseSchema.safeParse(form);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? 'Revise los datos.');
            return;
          }
          createMutation.mutate(result.data, callbacks);
        }
      }}
    >
      <div className="inventory-form-fields">
        <div className="inventory-form-grid">
          <label>
            Código
            <input
              className={inputClass}
              value={form.codigo}
              readOnly={Boolean(warehouse)}
              onChange={(event) => setForm({ ...form, codigo: event.target.value.toUpperCase() })}
              placeholder="BOD-02"
              maxLength={20}
            />
          </label>
          <label>
            Nombre
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(event) => setForm({ ...form, nombre: event.target.value })}
              placeholder="Bodega Norte"
              maxLength={120}
            />
          </label>
        </div>
        <label>
          Dirección
          <input
            className={inputClass}
            value={form.direccion}
            onChange={(event) => setForm({ ...form, direccion: event.target.value })}
            placeholder="Opcional"
            maxLength={255}
          />
        </label>
        <label className="inventory-active-control">
          <span>
            <strong>Almacén activo</strong>
            <small>Permite registrar movimientos y despachar repuestos desde esta ubicación.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Almacén activo"
            checked={form.activo}
            onChange={(event) => setForm({ ...form, activo: event.target.checked })}
          />
          <span className="inventory-switch-track" aria-hidden="true" />
        </label>
        {error && (
          <p className="inventory-alert" role="alert">
            {error}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

export function StockMovementModal({
  warehouse,
  initialPart,
  onClose,
}: {
  warehouse: Warehouse;
  initialPart?: StockBalance | null;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<'ingreso' | 'salida' | 'ajuste'>('ingreso');
  const [part, setPart] = useState<Part | null>(
    initialPart
      ? { id: initialPart.catalogItemId, nombre: initialPart.nombre, codigo: initialPart.codigo }
      : null,
  );
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateStockMovementMutation();
  const balances = useWarehouseBalances(warehouse.id);
  const stock = balances.data?.find((balance) => balance.catalogItemId === part?.id)?.cantidad ?? 0;
  const amount = Number(cantidad) || 0;
  const next = tipo === 'ajuste' ? amount : stock + (tipo === 'salida' ? -amount : amount);
  const unavailable = balances.isPending || balances.isError || !warehouse.activo;
  return (
    <FormDialog
      id="movement-modal-title"
      title="Movimiento de inventario"
      code={warehouse.nombre}
      context="Entrada, salida o ajuste de existencias"
      submitLabel="Guardar movimiento"
      dirty={
        tipo !== 'ingreso' ||
        cantidad !== '1' ||
        motivo !== '' ||
        part?.id !== initialPart?.catalogItemId
      }
      pending={mutation.isPending}
      onClose={onClose}
      headerVariant="plain"
      className="inventory-form reference-form-dialog stock-form-dialog"
      submitDisabled={unavailable}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!part) {
          setError('Seleccione un repuesto del catálogo.');
          return;
        }
        const result = createStockMovementSchema.safeParse({
          catalogItemId: part.id,
          warehouseId: warehouse.id,
          tipo,
          cantidad,
          motivo,
        });
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? 'Revise los datos.');
          return;
        }
        if (next < 0) {
          setError(
            'La salida no puede superar las ' + stock + ' unidades disponibles en esta bodega.',
          );
          return;
        }
        mutation.mutate(result.data, {
          onSuccess: (movement) => {
            notifySuccess('Movimiento registrado. Saldo: ' + movement.saldoResultante + '.');
            onClose();
          },
          onError: (failure) => setError(getApiErrorMessage(failure)),
        });
      }}
    >
      <div className="inventory-form-fields">
        <div className="inventory-form-grid">
          <label>
            Almacén
            <input className={inputClass} value={warehouse.nombre} readOnly />
          </label>
          <label>
            Movimiento
            <select
              className={inputClass}
              value={tipo}
              onChange={(event) => {
                const value = event.target.value;
                if (value !== 'ingreso' && value !== 'salida' && value !== 'ajuste') return;
                setTipo(value);
                setError(null);
              }}
            >
              <option value="ingreso">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </label>
        </div>
        <PartPicker selected={part} onChange={setPart} />
        <label>
          {tipo === 'ajuste' ? 'Nuevo saldo' : 'Cantidad'}
          <input
            className={inputClass}
            type="number"
            min="0.01"
            step="any"
            value={cantidad}
            onChange={(event) => setCantidad(event.target.value)}
          />
        </label>
        {part && (
          <BalancePreview
            loading={balances.isPending}
            error={balances.isError}
            current={stock}
            next={next}
          />
        )}
        {tipo === 'ajuste' && (
          <p className="inventory-field-hint">
            En un ajuste, la cantidad corresponde al stock final del almacén.
          </p>
        )}
        <label>
          Motivo
          <input
            className={inputClass}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Compra proveedor, conteo físico…"
            maxLength={255}
          />
        </label>
        {!warehouse.activo && (
          <p className="inventory-alert" role="alert">
            Active el almacén antes de registrar movimientos.
          </p>
        )}
        {error && (
          <p className="inventory-alert" role="alert">
            {error}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

export function StockTransferModal({
  warehouses,
  defaultOriginId,
  onClose,
}: {
  warehouses: Warehouse[];
  defaultOriginId: number | null;
  onClose: () => void;
}) {
  const actives = warehouses.filter((warehouse) => warehouse.activo);
  const initialOrigin =
    actives.find((warehouse) => warehouse.id === defaultOriginId)?.id ?? actives[0]?.id ?? null;
  const initialDestination =
    actives.find((warehouse) => warehouse.id !== initialOrigin)?.id ?? null;
  const [originId, setOriginId] = useState<number | null>(initialOrigin);
  const [destinationId, setDestinationId] = useState<number | null>(initialDestination);
  const [part, setPart] = useState<Part | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateStockTransferMutation();
  const balances = useWarehouseBalances(originId);
  const stock = balances.data?.find((balance) => balance.catalogItemId === part?.id)?.cantidad ?? 0;
  const next = stock - (Number(cantidad) || 0);
  return (
    <FormDialog
      id="transfer-modal-title"
      title="Trasladar stock"
      code="Almacenes"
      context="Salida e ingreso con una misma referencia"
      submitLabel="Confirmar traslado"
      dirty={
        part !== null ||
        cantidad !== '1' ||
        motivo !== '' ||
        originId !== initialOrigin ||
        destinationId !== initialDestination
      }
      pending={mutation.isPending}
      onClose={onClose}
      headerVariant="plain"
      className="inventory-form reference-form-dialog stock-form-dialog"
      submitDisabled={balances.isPending || balances.isError || actives.length < 2}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!part) {
          setError('Seleccione un repuesto del catálogo.');
          return;
        }
        const result = createStockTransferSchema.safeParse({
          catalogItemId: part.id,
          originWarehouseId: originId,
          destinationWarehouseId: destinationId,
          cantidad,
          motivo,
        });
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? 'Revise los datos.');
          return;
        }
        if (next < 0) {
          setError('El traslado supera las ' + stock + ' unidades disponibles en origen.');
          return;
        }
        mutation.mutate(result.data, {
          onSuccess: (result) => {
            notifySuccess('Traslado ' + result.referencia + ' registrado.');
            onClose();
          },
          onError: (failure) => setError(getApiErrorMessage(failure)),
        });
      }}
    >
      <div className="inventory-form-fields">
        <div className="inventory-form-grid">
          <label>
            Origen
            <select
              className={inputClass}
              value={originId ?? ''}
              aria-label="Almacén origen"
              onChange={(event) => {
                const id = Number(event.target.value);
                setOriginId(id);
                if (destinationId === id)
                  setDestinationId(actives.find((warehouse) => warehouse.id !== id)?.id ?? null);
              }}
            >
              {actives.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.codigo} · {warehouse.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destino
            <select
              className={inputClass}
              value={destinationId ?? ''}
              aria-label="Almacén destino"
              onChange={(event) => setDestinationId(Number(event.target.value))}
            >
              {actives
                .filter((warehouse) => warehouse.id !== originId)
                .map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.codigo} · {warehouse.nombre}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <PartPicker selected={part} onChange={setPart} />
        {part && (
          <BalancePreview
            loading={balances.isPending}
            error={balances.isError}
            current={stock}
            next={next}
          />
        )}
        <label>
          Cantidad
          <input
            className={inputClass}
            type="number"
            min="1"
            step="1"
            value={cantidad}
            onChange={(event) => setCantidad(event.target.value)}
          />
        </label>
        <label>
          Motivo
          <input
            className={inputClass}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Reposición de sucursal…"
            maxLength={255}
          />
        </label>
        {error && (
          <p className="inventory-alert" role="alert">
            {error}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

export function WarehouseDeliveryModal({
  request,
  warehouses,
  defaultWarehouseId,
  onClose,
}: {
  request: WarehouseWorkOrderRequest;
  warehouses: Warehouse[];
  defaultWarehouseId: number | null;
  onClose: () => void;
}) {
  const initialWarehouseId =
    warehouses.find((warehouse) => warehouse.id === defaultWarehouseId && warehouse.activo)?.id ??
    null;
  const [warehouseId, setWarehouseId] = useState<number | null>(initialWarehouseId);
  const [comentario, setComentario] = useState('');
  const balances = useWarehouseBalances(warehouseId);
  const mutation = useDeliverWarehouseRequestMutation();
  const stock =
    balances.data?.find((balance) => balance.catalogItemId === request.catalogItemId)?.cantidad ??
    0;
  const insufficient = !balances.isPending && stock < request.cantidad;
  return (
    <FormDialog
      id="warehouse-delivery-title"
      title="Confirmar entrega de repuesto"
      code={request.workOrder.codigo}
      context={request.workOrder.vehicle?.patente ?? 'Sin patente'}
      submitLabel={mutation.isPending ? 'Entregando…' : 'Confirmar entrega'}
      dirty={comentario !== '' || warehouseId !== initialWarehouseId}
      pending={mutation.isPending}
      onClose={onClose}
      headerVariant="plain"
      className="inventory-form reference-form-dialog stock-form-dialog"
      submitDisabled={
        warehouseId === null || balances.isPending || balances.isError || insufficient
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (warehouseId === null || insufficient) return;
        mutation.mutate(
          { requestId: request.id, warehouseId, comentario: comentario.trim() || undefined },
          {
            onSuccess: (delivered) => {
              notifySuccess(
                delivered.catalogItem.nombre + ' entregado a ' + delivered.workOrder.codigo + '.',
              );
              onClose();
            },
          },
        );
      }}
    >
      <div className="inventory-form-fields">
        <div className="inventory-profile-hero">
          <PackageCheck aria-hidden="true" />
          <div>
            <small>
              {request.catalogItem.codigo ?? 'Sin código'} · {request.cantidad} unidades aprobadas
            </small>
            <h3>{request.catalogItem.nombre}</h3>
          </div>
        </div>
        <p className="inventory-field-hint">{request.motivo}</p>
        <label>
          Almacén de salida
          <select
            className={inputClass}
            value={warehouseId ?? ''}
            onChange={(event) => setWarehouseId(Number(event.target.value) || null)}
          >
            <option value="" disabled>
              Seleccione almacén
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.codigo} · {warehouse.nombre}
              </option>
            ))}
          </select>
        </label>
        <BalancePreview
          loading={balances.isPending}
          error={balances.isError}
          current={stock}
          next={stock - request.cantidad}
        />
        <label>
          Observación de entrega (opcional)
          <textarea
            className={inputClass}
            value={comentario}
            onChange={(event) => setComentario(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Serie, ubicación física, indicación para el mecánico…"
          />
        </label>
        {mutation.isError && (
          <p className="inventory-alert" role="alert">
            {getApiErrorMessage(mutation.error)}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
