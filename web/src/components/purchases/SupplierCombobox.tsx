import { BadgeAlert, Check, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useSupplierSearch } from '../../hooks/usePurchases';

export interface SupplierSelection {
  supplierId: number | null;
  nombre: string;
  datosCompletos?: boolean;
}

interface SupplierComboboxProps {
  value: SupplierSelection;
  onChange: (value: SupplierSelection) => void;
  error?: string;
  id?: string;
}

const searchable = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Buscador de proveedores con alta diferida: si el nombre escrito no existe, la
 * compra se guarda con ese nombre y el backend crea el proveedor incompleto para
 * que administración lo complete después.
 */
export const SupplierCombobox = ({
  value,
  onChange,
  error,
  id = 'purchase-supplier',
}: SupplierComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.nombre);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const suppliersQuery = useSupplierSearch(query, open);
  const suppliers = suppliersQuery.data?.items ?? [];
  const exactMatch = suppliers.some(
    (supplier) => searchable(supplier.nombre) === searchable(query),
  );
  const canCreate = query.trim().length >= 2 && !exactMatch;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (value.supplierId === null && value.nombre === '') {
      setQuery('');
    } else if (value.supplierId !== null) {
      setQuery(value.nombre);
    }
  }, [value.supplierId, value.nombre]);

  const select = (selection: SupplierSelection): void => {
    setQuery(selection.nombre);
    onChange(selection);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block text-sm font-semibold text-brand-ink">
        Proveedor
      </label>
      <div className="relative mt-2">
        <Search
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={Boolean(error)}
          className={`h-10 w-full rounded-lg border bg-white pl-9 pr-16 text-sm text-brand-ink outline-none focus:ring-2 ${
            error
              ? 'border-brand-coralInk focus:border-brand-coralInk focus:ring-brand-coralPale'
              : 'border-brand-line focus:border-brand-primary focus:ring-brand-primary/15'
          }`}
          placeholder="Buscar por nombre, RUT o teléfono"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            setOpen(true);
            onChange({ supplierId: null, nombre: text, datosCompletos: false });
          }}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {(query !== '' || value.supplierId !== null) && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-muted hover:bg-brand-pale"
              aria-label="Limpiar proveedor"
              title="Limpiar proveedor"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery('');
                onChange({ supplierId: null, nombre: '' });
                inputRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <LoaderCircle
            className={`h-4 w-4 text-brand-muted ${suppliersQuery.isFetching && open ? 'animate-spin' : 'hidden'}`}
            aria-hidden="true"
          />
        </div>
      </div>

      {value.supplierId !== null && value.datosCompletos === false && (
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-brand-goldPale px-2 py-1 text-xs font-semibold text-brand-goldInk">
          <BadgeAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Proveedor con datos incompletos
        </p>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-brand-line bg-white py-1 shadow-xl">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
            {query.trim() ? 'Coincidencias' : 'Proveedores recientes'}
          </p>
          {suppliersQuery.isPending && (
            <p className="px-3 py-2 text-sm text-brand-muted">Buscando proveedores...</p>
          )}
          {!suppliersQuery.isPending && suppliers.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-sm text-brand-muted">Sin coincidencias.</p>
          )}
          {suppliers.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              role="option"
              aria-selected={value.supplierId === supplier.id}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-brand-pale"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                select({
                  supplierId: supplier.id,
                  nombre: supplier.nombre,
                  datosCompletos: supplier.datosCompletos,
                })
              }
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{supplier.nombre}</span>
                <span className="mt-0.5 block text-xs text-brand-muted">
                  {[supplier.rut, supplier.telefono, supplier.email].filter(Boolean).join(' · ') ||
                    'Sin RUT ni contacto registrado'}
                </span>
              </span>
              {!supplier.datosCompletos && (
                <span className="shrink-0 rounded bg-brand-goldPale px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-goldInk">
                  Incompleto
                </span>
              )}
              {value.supplierId === supplier.id && (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
              )}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-brand-line px-3 py-2.5 text-left text-sm font-semibold text-brand-primaryInk hover:bg-brand-pale"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                select({
                  supplierId: null,
                  nombre: query.trim(),
                  datosCompletos: false,
                })
              }
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              Usar «{query.trim()}» como proveedor nuevo
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="mt-1 text-sm text-brand-coralInk" role="alert">
          {error}
        </p>
      )}
      <p className="mt-1.5 text-xs text-brand-muted">
        Si no existe, escribe el nombre completo. Se creará con datos incompletos.
      </p>
    </div>
  );
};

export default SupplierCombobox;
