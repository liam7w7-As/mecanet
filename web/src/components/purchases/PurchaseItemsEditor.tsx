import { Boxes, LoaderCircle, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useCatalogParts } from '../../hooks/useWarehouses';
import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { FieldErrors } from '../../lib/form-errors';
import type { CatalogItem, Warehouse } from '../../types/entities';

export interface PurchaseItemDraft {
  key: string;
  catalogItemId: number | null;
  catalogItem: CatalogItem | null;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  afectaStock: boolean;
  warehouseId: number | null;
}

let itemSequence = 0;
const nextKey = (): string => {
  itemSequence += 1;
  return `purchase-item-${itemSequence}`;
};

export const createEmptyPurchaseItem = (): PurchaseItemDraft => ({
  key: nextKey(),
  catalogItemId: null,
  catalogItem: null,
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  afectaStock: false,
  warehouseId: null,
});

const lineSubtotal = (item: PurchaseItemDraft): number =>
  Math.round(
    (Number(item.cantidad || 0) * Number(item.precioUnitario || 0) + Number.EPSILON) * 100,
  ) / 100;

const CatalogSearchPanel = ({
  onSelect,
  onClose,
}: {
  onSelect: (item: CatalogItem) => void;
  onClose: () => void;
}) => {
  const [term, setTerm] = useState('');
  const query = useCatalogParts(term);
  const parts = query.data?.items ?? [];

  return (
    <div className="mt-2 rounded-lg border border-brand-line bg-white p-2 shadow-lg">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
          aria-hidden="true"
        />
        <input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="h-10 w-full rounded-lg border border-brand-line pl-9 pr-9 text-sm outline-none focus:border-brand-primary"
          placeholder="Buscar repuesto por nombre o código"
          aria-label="Buscar repuesto del catálogo"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded text-brand-muted hover:bg-brand-pale"
          onClick={onClose}
          aria-label="Cerrar búsqueda de catálogo"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 max-h-44 overflow-y-auto">
        {query.isPending && (
          <p className="flex items-center gap-2 px-2 py-2 text-sm text-brand-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Buscando...
          </p>
        )}
        {!query.isPending && parts.length === 0 && (
          <p className="px-2 py-2 text-sm text-brand-muted">Sin repuestos que coincidan.</p>
        )}
        {parts.map((part) => (
          <button
            key={part.id}
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-brand-pale"
            onClick={() => onSelect(part)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-brand-ink">
                {part.nombre}
              </span>
              <span className="block font-mono text-xs text-brand-muted">
                {part.codigo ?? 'Sin código'} · Stock global {part.stock}
              </span>
            </span>
            <span className="whitespace-nowrap text-sm font-semibold text-brand-primaryInk">
              {formatClp(part.precio)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface PurchaseItemsEditorProps {
  items: PurchaseItemDraft[];
  warehouses: Warehouse[];
  onChange: (items: PurchaseItemDraft[]) => void;
  errors?: FieldErrors;
}

export const PurchaseItemsEditor = ({
  items,
  warehouses,
  onChange,
  errors = {},
}: PurchaseItemsEditorProps) => {
  const [catalogOpenKey, setCatalogOpenKey] = useState<string | null>(null);

  const updateItem = (key: string, patch: Partial<PurchaseItemDraft>): void => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeItem = (key: string): void => {
    if (items.length === 1) {
      onChange([createEmptyPurchaseItem()]);
      return;
    }
    onChange(items.filter((item) => item.key !== key));
  };

  return (
    <section className="rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-brand-primaryInk">Ítems de la compra</h2>
          <p className="mt-0.5 text-xs text-brand-muted">
            Los precios se ingresan netos. El stock se recibe solo si vinculas un repuesto del
            catálogo y eliges almacén.
          </p>
        </div>
        <span className="rounded-md bg-brand-pale px-2 py-1 text-xs font-semibold text-brand-primaryInk">
          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => {
          const subtotal = lineSubtotal(item);
          const descriptionError = errors[`items.${index}.descripcion`];
          const quantityError = errors[`items.${index}.cantidad`];
          const priceError = errors[`items.${index}.precioUnitario`];
          const stockError =
            errors[`items.${index}.catalogItemId`] ?? errors[`items.${index}.warehouseId`];

          return (
            <div
              key={item.key}
              className="rounded-xl border border-brand-line bg-brand-pale/20 p-4"
              aria-label={`Ítem ${index + 1}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primaryInk text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="truncate text-sm font-semibold text-brand-ink">
                    {item.descripcion || 'Nuevo ítem'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-bold text-brand-primaryInk">
                    {formatClp(subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-coralPale hover:text-brand-coralInk"
                    aria-label={`Eliminar ítem ${index + 1}`}
                    title="Eliminar ítem"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_150px]">
                <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Descripción
                  <input
                    value={item.descripcion}
                    onChange={(event) => updateItem(item.key, { descripcion: event.target.value })}
                    className="mt-1.5 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-brand-ink outline-none focus:border-brand-primary"
                    placeholder="Repuesto, insumo o servicio adquirido"
                    maxLength={255}
                    aria-invalid={Boolean(descriptionError)}
                  />
                  {descriptionError && (
                    <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-brand-coralInk">
                      {descriptionError}
                    </span>
                  )}
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Cantidad
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.cantidad}
                    onChange={(event) => updateItem(item.key, { cantidad: event.target.value })}
                    className="mt-1.5 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-brand-ink outline-none focus:border-brand-primary"
                    aria-invalid={Boolean(quantityError)}
                  />
                  {quantityError && (
                    <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-brand-coralInk">
                      {quantityError}
                    </span>
                  )}
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Precio unitario neto
                  <CurrencyInput
                    value={item.precioUnitario}
                    onChange={(value) => updateItem(item.key, { precioUnitario: value })}
                    className="mt-1.5 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-brand-ink outline-none focus:border-brand-primary"
                    placeholder="0"
                    aria-invalid={Boolean(priceError)}
                  />
                  {priceError && (
                    <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-brand-coralInk">
                      {priceError}
                    </span>
                  )}
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {item.catalogItem ? (
                  <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-brand-primary/30 bg-brand-pale px-3 py-1.5 text-xs font-semibold text-brand-primaryInk">
                    <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {item.catalogItem.codigo ?? 'Sin código'} · {item.catalogItem.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(item.key, {
                          catalogItemId: null,
                          catalogItem: null,
                          afectaStock: false,
                          warehouseId: null,
                        })
                      }
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-brand-muted hover:bg-white"
                      aria-label="Desvincular repuesto del catálogo"
                      title="Desvincular repuesto"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setCatalogOpenKey(catalogOpenKey === item.key ? null : item.key)
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 text-xs font-semibold text-brand-primaryInk hover:border-brand-primary hover:bg-brand-pale"
                  >
                    <Package className="h-3.5 w-3.5" aria-hidden="true" />
                    Vincular repuesto de catálogo
                  </button>
                )}

                <label
                  className={`inline-flex items-center gap-2 text-xs font-semibold ${
                    item.catalogItemId === null ? 'text-brand-muted/70' : 'text-brand-ink'
                  }`}
                  title={
                    item.catalogItemId === null
                      ? 'Solo los repuestos del catálogo pueden ingresar stock'
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-brand-line"
                    checked={item.afectaStock}
                    disabled={item.catalogItemId === null}
                    onChange={(event) =>
                      updateItem(item.key, {
                        afectaStock: event.target.checked,
                        warehouseId: event.target.checked ? item.warehouseId : null,
                      })
                    }
                  />
                  Ingresar stock
                </label>

                {item.afectaStock && item.catalogItemId !== null && (
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-ink">
                    <Boxes className="h-4 w-4 text-brand-muted" aria-hidden="true" />
                    Almacén
                    <select
                      value={item.warehouseId ?? ''}
                      onChange={(event) =>
                        updateItem(item.key, {
                          warehouseId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      className="h-8 rounded-lg border border-brand-line bg-white px-2 text-xs font-normal text-brand-ink outline-none focus:border-brand-primary"
                      aria-label={`Almacén para el ítem ${index + 1}`}
                    >
                      <option value="">Seleccionar</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.codigo} · {warehouse.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {stockError && (
                <p className="mt-2 text-xs font-semibold text-brand-coralInk">{stockError}</p>
              )}
              {item.afectaStock && warehouses.length === 0 && (
                <p className="mt-2 text-xs font-semibold text-brand-goldInk">
                  No hay almacenes activos disponibles.
                </p>
              )}

              {catalogOpenKey === item.key && (
                <CatalogSearchPanel
                  onClose={() => setCatalogOpenKey(null)}
                  onSelect={(part) => {
                    updateItem(item.key, {
                      catalogItemId: part.id,
                      catalogItem: part,
                      descripcion: part.nombre,
                      precioUnitario: String(Math.round(part.precio)),
                      afectaStock: false,
                      warehouseId: null,
                    });
                    setCatalogOpenKey(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {errors.items && <p className="mt-2 text-sm text-brand-coralInk">{errors.items}</p>}

      <button
        type="button"
        onClick={() => onChange([...items, createEmptyPurchaseItem()])}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-brand-primaryInk bg-white px-4 text-sm font-semibold text-brand-primaryInk hover:bg-brand-pale"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Agregar ítem
      </button>
    </section>
  );
};

export default PurchaseItemsEditor;
