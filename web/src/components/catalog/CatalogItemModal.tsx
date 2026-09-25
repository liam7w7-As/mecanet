import { createCatalogItemSchema, updateCatalogItemSchema, UNIT_MEASURES, UNIT_MEASURE_LABELS } from '@unithor/shared';
import { AlertCircle, Boxes, LoaderCircle, Package, Settings2, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useCreateCatalogItemMutation,
  useUpdateCatalogItemMutation,
} from '../../hooks/useCatalog';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { CatalogItem } from '../../types/entities';
import type { CatalogType } from '@unithor/shared';

interface CatalogItemModalProps {
  item?: CatalogItem | null;
  onClose: () => void;
}

interface CatalogFormState {
  tipo: CatalogType;
  codigo: string;
  nombre: string;
  descripcion: string;
  unidadMedida: CatalogItem['unidadMedida'];
  precio: string;
  stock: string;
  stockMinimo: string;
}

const typeOptions = [
  { value: 'estandar', label: 'Servicio estándar', icon: Wrench },
  { value: 'parte', label: 'Repuesto', icon: Package },
  { value: 'especifico', label: 'Servicio específico', icon: Settings2 },
] as const;

const inputClassName =
  'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 aria-[invalid=true]:border-red-500';

const getInitialState = (item?: CatalogItem | null): CatalogFormState => ({
  tipo: item?.tipo ?? 'estandar',
  codigo: item?.codigo ?? '',
  nombre: item?.nombre ?? '',
   descripcion: item?.descripcion ?? '',
   unidadMedida: item?.unidadMedida ?? 'unidad',
   precio: String(item?.precio ?? 0),
  stock: String(item?.stock ?? 0),
  stockMinimo: String(item?.stockMinimo ?? 0),
});

export const CatalogItemModal = ({ item, onClose }: CatalogItemModalProps) => {
  const [form, setForm] = useState<CatalogFormState>(() => getInitialState(item));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateCatalogItemMutation();
  const updateMutation = useUpdateCatalogItemMutation();
  const isEditing = Boolean(item);
  const activeMutation = isEditing ? updateMutation : createMutation;
  const pricePreview = Number(form.precio);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !activeMutation.isPending) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeMutation.isPending, onClose]);

  const setValue = <K extends keyof CatalogFormState>(
    key: K,
    value: CatalogFormState[K],
  ): void => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'tipo' && value !== 'parte' ? { stock: '0', stockMinimo: '0' } : {}),
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    updateMutation.reset();
    setFieldErrors({});

    const payload = {
      tipo: form.tipo,
      codigo: form.codigo,
      nombre: form.nombre,
       descripcion: form.descripcion,
       unidadMedida: form.unidadMedida,
       precio: form.precio,
      stock: form.tipo === 'parte' ? form.stock : '0',
      stockMinimo: form.tipo === 'parte' ? form.stockMinimo : '0',
    };
    if (item) {
      const result = updateCatalogItemSchema.safeParse(payload);
      if (!result.success) {
        setFieldErrors(getFieldErrors(result.error.issues));
        return;
      }
      updateMutation.mutate(
        { id: item.id, data: result.data },
        { onSuccess: onClose },
      );
      return;
    }

    const result = createCatalogItemSchema.safeParse(payload);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }
    createMutation.mutate(result.data, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55"
        aria-label="Cerrar formulario de catálogo"
        onClick={onClose}
      />
      <section
        className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-form-title"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="catalog-form-title" className="text-lg font-semibold text-brand-blue">
              {isEditing ? 'Editar item' : 'Nuevo item de catálogo'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Servicio, trabajo específico o repuesto</p>
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de item</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {typeOptions.map((option) => {
                const Icon = option.icon;
                const selected = form.tipo === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${selected ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 text-slate-600 hover:border-brand-blue/40'}`}
                    onClick={() => setValue('tipo', option.value)}
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              {form.tipo === 'parte' ? 'Código de repuesto' : 'Código interno (opcional)'}
              <input className={`${inputClassName} uppercase`} value={form.codigo} onChange={(event) => setValue('codigo', event.target.value.toUpperCase())} aria-invalid={Boolean(fieldErrors.codigo)} placeholder={form.tipo === 'parte' ? 'REP-001' : 'SRV-001'} />
              {fieldErrors.codigo && <span className="mt-1 block text-xs text-red-600">{fieldErrors.codigo}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Nombre
              <input className={inputClassName} value={form.nombre} onChange={(event) => setValue('nombre', event.target.value)} aria-invalid={Boolean(fieldErrors.nombre)} placeholder="Nombre visible en órdenes y cotizaciones" />
              {fieldErrors.nombre && <span className="mt-1 block text-xs text-red-600">{fieldErrors.nombre}</span>}
            </label>
             <label className="text-sm font-medium text-slate-700">
               Precio
               <CurrencyInput value={form.precio} onChange={(value) => setValue('precio', value)} className={inputClassName} aria-label="Precio" aria-invalid={Boolean(fieldErrors.precio)} />
               {fieldErrors.precio && <span className="mt-1 block text-xs text-red-600">{fieldErrors.precio}</span>}
               <span className="mt-1 block text-xs font-semibold text-brand-blue">{Number.isFinite(pricePreview) ? formatClp(pricePreview) : formatClp(0)}</span>
             </label>
             <label className="text-sm font-medium text-slate-700">
               Unidad de medida
               <select className={inputClassName} value={form.unidadMedida} onChange={(event) => setValue('unidadMedida', event.target.value as CatalogItem['unidadMedida'])} aria-label="Unidad de medida">
                 {UNIT_MEASURES.map((unit) => <option key={unit} value={unit}>{UNIT_MEASURE_LABELS[unit]}</option>)}
               </select>
               {fieldErrors.unidadMedida && <span className="mt-1 block text-xs text-red-600">{fieldErrors.unidadMedida}</span>}
             </label>
            <label className="text-sm font-medium text-slate-700">
              Stock inicial
              <input className={inputClassName} type="number" min="0" step="1" value={form.stock} onChange={(event) => setValue('stock', event.target.value)} disabled={form.tipo !== 'parte'} aria-label="Stock inicial" aria-invalid={Boolean(fieldErrors.stock)} />
              {fieldErrors.stock && <span className="mt-1 block text-xs text-red-600">{fieldErrors.stock}</span>}
              {form.tipo !== 'parte' && <span className="mt-1 block text-xs text-slate-500">Los servicios no manejan inventario.</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Stock mínimo
              <input className={inputClassName} type="number" min="0" step="1" value={form.stockMinimo} onChange={(event) => setValue('stockMinimo', event.target.value)} disabled={form.tipo !== 'parte'} aria-label="Stock mínimo" aria-invalid={Boolean(fieldErrors.stockMinimo)} />
              {fieldErrors.stockMinimo && <span className="mt-1 block text-xs text-red-600">{fieldErrors.stockMinimo}</span>}
              {form.tipo === 'parte' && <span className="mt-1 block text-xs text-slate-500">Avisa en dashboard y almacén al llegar a este nivel.</span>}
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Descripción
              <textarea className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={form.descripcion} onChange={(event) => setValue('descripcion', event.target.value)} placeholder="Detalle técnico o comercial opcional" />
            </label>
          </div>

          {activeMutation.error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isApiConflict(activeMutation.error) ? 'Ya existe un item con ese código.' : getApiErrorMessage(activeMutation.error)}</span>
            </div>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={activeMutation.isPending}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60" disabled={activeMutation.isPending}>
              {activeMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Boxes className="h-4 w-4" aria-hidden="true" />}
              {activeMutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear item'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default CatalogItemModal;
