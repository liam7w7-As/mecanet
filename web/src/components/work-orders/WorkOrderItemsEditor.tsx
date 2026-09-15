import { LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useCatalogItems } from '../../hooks/useWorkOrders';
import { formatClp } from '../../lib/formatters';

import type { CatalogItem } from '../../types/entities';

let itemSequence = 0;

export interface EditableWorkOrderItem {
  key: string;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
}

export const createEmptyWorkOrderItem = (): EditableWorkOrderItem => ({
  key: `work-item-${itemSequence += 1}`,
  catalogItemId: null,
  descripcion: '',
  cantidad: '1',
  precioUnitario: '0',
});

export const getWorkOrderItemSubtotal = (item: EditableWorkOrderItem): number =>
  Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precioUnitario) || 0);

export const calculateItemsTotal = (items: EditableWorkOrderItem[]): number =>
  items.reduce((total, item) => total + getWorkOrderItemSubtotal(item), 0);

interface CatalogPickerProps {
  index: number;
  item: EditableWorkOrderItem;
  onChange: (patch: Partial<EditableWorkOrderItem>) => void;
}

const CatalogPicker = ({ index, item, onChange }: CatalogPickerProps) => {
  const [isFocused, setFocused] = useState(false);
  const catalogQuery = useCatalogItems(item.descripcion);

  const selectCatalogItem = (catalogItem: CatalogItem): void => {
    onChange({
      catalogItemId: catalogItem.id,
      descripcion: catalogItem.nombre,
      precioUnitario: String(catalogItem.precio),
    });
    setFocused(false);
  };

  return (
    <div className="relative min-w-52">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
      <input
        value={item.descripcion}
        onChange={(event) => onChange({ descripcion: event.target.value, catalogItemId: null })}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-9 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        placeholder="Servicio, repuesto o trabajo libre"
        aria-label={`Descripción ${index + 1}`}
        autoComplete="off"
      />
      {catalogQuery.isFetching && <LoaderCircle className="absolute right-3 top-3 h-4 w-4 animate-spin text-brand-blue" aria-hidden="true" />}
      {isFocused && catalogQuery.data && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {catalogQuery.data.items.length > 0 ? catalogQuery.data.items.map((catalogItem) => (
            <button
              key={catalogItem.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCatalogItem(catalogItem)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{catalogItem.nombre}</span>
                <span className="block text-xs text-slate-500">{catalogItem.codigo ?? catalogItem.tipo}</span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-brand-blue">{formatClp(catalogItem.precio)}</span>
            </button>
          )) : <p className="px-3 py-3 text-sm text-slate-500">Sin coincidencias. Puede usar una descripción libre.</p>}
        </div>
      )}
    </div>
  );
};

interface WorkOrderItemsEditorProps {
  items: EditableWorkOrderItem[];
  onChange: (items: EditableWorkOrderItem[]) => void;
  errors?: Record<string, string>;
  title?: string;
  description?: string;
  emptyMessage?: string;
  totalLabel?: string;
  totalTestId?: string;
}

export const WorkOrderItemsEditor = ({
  items,
  onChange,
  errors = {},
  title = 'Trabajos y repuestos',
  description = 'Busque en el catálogo o escriba un trabajo particular.',
  emptyMessage = 'La orden puede guardarse sin ítems para realizar un diagnóstico inicial.',
  totalLabel = 'Total estimado',
  totalTestId = 'work-order-total',
}: WorkOrderItemsEditorProps) => {
  const updateItem = (index: number, patch: Partial<EditableWorkOrderItem>): void => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const removeItem = (index: number): void => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="border-t border-slate-200 pt-6" aria-labelledby="work-items-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="work-items-title" className="text-lg font-bold text-brand-blue">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-blue px-4 text-sm font-semibold text-brand-blue hover:bg-brand-blue hover:text-white" onClick={() => onChange([...items, createEmptyWorkOrderItem()])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Añadir ítem
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-3 font-semibold">Descripción</th><th className="w-28 px-3 py-3 font-semibold">Cantidad</th><th className="w-44 px-3 py-3 font-semibold">Precio unitario</th><th className="w-36 px-3 py-3 text-right font-semibold">Subtotal</th><th className="w-14 px-3 py-3"><span className="sr-only">Eliminar</span></th></tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.key} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <CatalogPicker index={index} item={item} onChange={(patch) => updateItem(index, patch)} />
                    {errors[`items.${index}.descripcion`] && <p className="mt-1 text-xs text-red-700">{errors[`items.${index}.descripcion`]}</p>}
                  </td>
                  <td className="px-3 py-3"><input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(event) => updateItem(index, { cantidad: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" aria-label={`Cantidad ${index + 1}`} /></td>
                  <td className="px-3 py-3"><div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-400">$</span><input type="number" min="0" step="1" value={item.precioUnitario} onChange={(event) => updateItem(index, { precioUnitario: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 pl-7 pr-3 text-sm outline-none focus:border-brand-blue" aria-label={`Precio unitario ${index + 1}`} /></div></td>
                  <td className="px-3 py-5 text-right font-semibold text-brand-blue" data-testid={`item-subtotal-${index}`}>{formatClp(getWorkOrderItemSubtotal(item))}</td>
                  <td className="px-3 py-3"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => removeItem(index)} aria-label={`Eliminar ítem ${index + 1}`} title="Eliminar ítem"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-sm border-t-2 border-brand-blue pt-3 text-right">
          <p className="text-xs font-semibold uppercase text-slate-500">{totalLabel}</p>
          <p className="mt-1 text-2xl font-bold text-brand-blue" data-testid={totalTestId}>{formatClp(calculateItemsTotal(items))}</p>
        </div>
      </div>
    </section>
  );
};

export default WorkOrderItemsEditor;
