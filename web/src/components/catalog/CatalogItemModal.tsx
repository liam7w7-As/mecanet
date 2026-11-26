import {
  createCatalogItemSchema,
  updateCatalogItemSchema,
  UNIT_MEASURES,
  UNIT_MEASURE_LABELS,
  type CatalogDivision,
  type CatalogSubtype,
  type CatalogType,
} from '@unithor/shared';
import {
  AlertCircle,
  Package,
  Settings2,
  Wrench,
  ShoppingBag,
} from 'lucide-react';
import { useState } from 'react';

import { useCreateCatalogItemMutation, useUpdateCatalogItemMutation } from '../../hooks/useCatalog';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import CurrencyInput from '../common/CurrencyInput';
import FormDialog from '../common/FormDialog';

import type { CatalogItem } from '../../types/entities';

interface CatalogItemModalProps {
  item?: CatalogItem | null;
  defaultDivision?: 'ACC' | 'MEC';
  onClose: () => void;
}

interface CatalogFormState {
  division: CatalogDivision;
  subtipo: CatalogSubtype;
  tipo: CatalogType;
  codigo: string;
  nombre: string;
  descripcion: string;
  unidadMedida: CatalogItem['unidadMedida'];
  precio: string;
  horasHombreEstandar: string;
  stock: string;
  stockMinimo: string;
}

const inputClassName =
  'mt-1 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 disabled:cursor-not-allowed disabled:bg-brand-pale disabled:text-brand-muted aria-[invalid=true]:border-brand-coralInk';

const getInitialState = (
  item?: CatalogItem | null,
  defaultDivision: 'ACC' | 'MEC' = 'MEC',
): CatalogFormState => {
  const division: CatalogDivision = item?.division ?? (item?.tipo === 'parte' ? 'ACC' : defaultDivision);
  let subtipo: CatalogSubtype =
    item?.subtipo ??
    (division === 'ACC' ? 'en_stock' : item?.tipo === 'especifico' ? 'especifico' : 'estandar');

  if (division === 'DP') {
    subtipo = 'servicio_dp';
  }

  let tipo: CatalogType = item?.tipo ?? 'estandar';
  if (division === 'ACC') {
    tipo = 'parte';
  } else if (division === 'DP') {
    tipo = 'estandar';
  } else {
    tipo = subtipo === 'especifico' ? 'especifico' : 'estandar';
  }

  return {
    division,
    subtipo,
    tipo,
    codigo: item?.codigo ?? '',
    nombre: item?.nombre ?? '',
    descripcion: item?.descripcion ?? '',
    unidadMedida: item?.unidadMedida ?? (division === 'ACC' ? 'unidad' : 'servicio'),
    precio: String(item?.precio ?? (subtipo === 'especifico' ? 1 : 0)),
    horasHombreEstandar:
      item?.horasHombreEstandar === null || item?.horasHombreEstandar === undefined
        ? ''
        : String(item.horasHombreEstandar),
    stock: String(item?.stock ?? 0),
    stockMinimo: String(item?.stockMinimo ?? 0),
  };
};

export const CatalogItemModal = ({
  item,
  defaultDivision = 'MEC',
  onClose,
}: CatalogItemModalProps) => {
  const user = useAuthStore((state) => state.user);
  const action = item ? 'update' : 'create';
  const canSave = Boolean(
    user && (hasUserPermission(user, 'taller', action) || hasUserPermission(user, 'admin', action)),
  );
  const canInitializeStock = Boolean(
    user && hasUserPermission(user, 'almacen', 'read') && hasUserPermission(user, 'almacen', 'create'),
  );
  const [form, setForm] = useState<CatalogFormState>(() => getInitialState(item, defaultDivision));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateCatalogItemMutation();
  const updateMutation = useUpdateCatalogItemMutation();
  const isEditing = Boolean(item);
  const activeMutation = isEditing ? updateMutation : createMutation;
  const pricePreview = Number(form.precio);
  const stockPermissionMissing =
    !item &&
    form.division === 'ACC' &&
    form.subtipo === 'en_stock' &&
    Number(form.stock) > 0 &&
    !canInitializeStock;

  const setValue = <K extends keyof CatalogFormState>(key: K, value: CatalogFormState[K]): void => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const selectDivision = (nextDivision: 'ACC' | 'MEC'): void => {
    setForm((current) => {
      let nextSubtipo: CatalogSubtype = 'estandar';
      let nextTipo: CatalogType = 'estandar';
      let nextPrecio = current.precio;
      let nextUnidad = current.unidadMedida;

      if (nextDivision === 'ACC') {
        nextSubtipo = current.subtipo === 'a_pedido' ? 'a_pedido' : 'en_stock';
        nextTipo = 'parte';
        nextUnidad = current.unidadMedida === 'servicio' ? 'unidad' : current.unidadMedida;
      } else {
        nextSubtipo = current.subtipo === 'especifico' ? 'especifico' : 'estandar';
        nextTipo = nextSubtipo === 'especifico' ? 'especifico' : 'estandar';
        nextUnidad = 'servicio';
        if (nextSubtipo === 'especifico' && (!current.precio || current.precio === '0')) {
          nextPrecio = '1';
        }
      }

      return {
        ...current,
        division: nextDivision,
        subtipo: nextSubtipo,
        tipo: nextTipo,
        unidadMedida: nextUnidad,
        precio: nextPrecio,
        stock: nextDivision === 'ACC' && nextSubtipo === 'en_stock' ? current.stock : '0',
        stockMinimo: nextDivision === 'ACC' && nextSubtipo === 'en_stock' ? current.stockMinimo : '0',
      };
    });
  };

  const selectSubtipo = (nextSubtipo: CatalogSubtype): void => {
    setForm((current) => {
      let nextTipo = current.tipo;
      let nextPrecio = current.precio;
      if (current.division === 'MEC') {
        nextTipo = nextSubtipo === 'especifico' ? 'especifico' : 'estandar';
        if (nextSubtipo === 'especifico' && (!current.precio || current.precio === '0')) {
          nextPrecio = '1';
        }
      } else if (current.division === 'ACC') {
        nextTipo = 'parte';
      }
      return {
        ...current,
        subtipo: nextSubtipo,
        tipo: nextTipo,
        precio: nextPrecio,
        ...(nextSubtipo === 'a_pedido' ? { stock: '0', stockMinimo: '0' } : {}),
      };
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSave || stockPermissionMissing || activeMutation.isPending) return;
    createMutation.reset();
    updateMutation.reset();
    setFieldErrors({});

    const payload = {
      division: form.division,
      subtipo: form.subtipo,
      tipo: form.tipo,
      codigo: form.codigo,
      nombre: form.nombre,
      descripcion: form.descripcion,
      unidadMedida: form.unidadMedida,
      precio: form.precio,
      horasHombreEstandar: form.division === 'ACC' ? null : form.horasHombreEstandar,
      ...(!item && form.division === 'ACC' && form.subtipo === 'en_stock'
        ? { stock: form.stock }
        : !item
          ? { stock: '0' }
          : {}),
      stockMinimo:
        form.division === 'ACC' && form.subtipo === 'en_stock' ? form.stockMinimo : '0',
    };

    if (item) {
      const result = updateCatalogItemSchema.safeParse(payload);
      if (!result.success) {
        setFieldErrors(getFieldErrors(result.error.issues));
        return;
      }
      updateMutation.mutate({ id: item.id, data: result.data }, { onSuccess: onClose });
      return;
    }

    const result = createCatalogItemSchema.safeParse(payload);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }
    createMutation.mutate(result.data, { onSuccess: onClose });
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(getInitialState(item, defaultDivision));
  const isPartStock = form.division === 'ACC' && form.subtipo === 'en_stock';

  return (
    <FormDialog
      id="catalog-form-title"
      title={isEditing ? 'Editar item' : 'Nuevo item de catálogo'}
      code="Catálogo"
      context={form.division === 'ACC' ? 'Repuestos y Accesorios' : form.division === 'DP' ? 'Registro D&P' : 'Mecánica General'}
      submitLabel={isEditing ? 'Guardar cambios' : 'Crear item'}
      dirty={dirty}
      pending={activeMutation.isPending}
      submitDisabled={!canSave || stockPermissionMissing}
      onClose={onClose}
      onSubmit={handleSubmit}
      headerVariant="plain"
      className="inventory-form reference-form-dialog catalog-form-dialog"
    >
      <fieldset disabled={!canSave} className="inventory-form-fields catalog-editor-fields min-w-0">
        {!canSave && (
          <p role="status">
            Solo lectura en catálogo.
          </p>
        )}

        {/* Selector de División: solo ACC y MEC (D&P se configura en Tarifas D&P) */}
        <fieldset className="catalog-division-selector mb-4">
          <legend className="mb-2 text-sm font-semibold text-brand-ink">
            División
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="Repuesto"
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                form.division === 'ACC'
                  ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                  : 'border-brand-line bg-white text-brand-muted hover:border-amber-300'
              }`}
              onClick={() => selectDivision('ACC')}
              aria-pressed={form.division === 'ACC'}
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              ACC · Repuestos
            </button>
            <button
              type="button"
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                form.division === 'MEC'
                  ? 'border-brand-primaryInk bg-brand-primaryInk text-white shadow-sm'
                  : 'border-brand-line bg-white text-brand-muted hover:border-brand-primary/40'
              }`}
              onClick={() => selectDivision('MEC')}
              aria-pressed={form.division === 'MEC'}
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              MEC · Mecánica
            </button>
          </div>
        </fieldset>

        {/* Subtipo según División */}
        {form.division === 'MEC' && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="Servicio estándar"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                form.subtipo === 'estandar'
                  ? 'border-brand-primary bg-brand-pale text-brand-primaryInk'
                  : 'border-brand-line bg-white text-brand-muted hover:bg-brand-pale/40'
              }`}
              onClick={() => selectSubtipo('estandar')}
              aria-pressed={form.subtipo === 'estandar'}
            >
              <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
              Estándar (precio fijo)
            </button>
            <button
              type="button"
              aria-label="Servicio específico"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                form.subtipo === 'especifico'
                  ? 'border-brand-primary bg-brand-pale text-brand-primaryInk'
                  : 'border-brand-line bg-white text-brand-muted hover:bg-brand-pale/40'
              }`}
              onClick={() => selectSubtipo('especifico')}
              aria-pressed={form.subtipo === 'especifico'}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Específico (diagnóstico)
            </button>
          </div>
        )}

        {form.division === 'ACC' && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="En stock físico"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                form.subtipo === 'en_stock'
                  ? 'border-amber-600 bg-amber-50 text-amber-900'
                  : 'border-brand-line bg-white text-brand-muted hover:bg-amber-50/40'
              }`}
              onClick={() => selectSubtipo('en_stock')}
              aria-pressed={form.subtipo === 'en_stock'}
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              En stock
            </button>
            <button
              type="button"
              aria-label="A pedido"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                form.subtipo === 'a_pedido'
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-brand-line bg-white text-brand-muted hover:bg-blue-50/40'
              }`}
              onClick={() => selectSubtipo('a_pedido')}
              aria-pressed={form.subtipo === 'a_pedido'}
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              A pedido
            </button>
          </div>
        )}

        {/* Grid de campos puramente contextual */}
        <div className="catalog-field-grid grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-brand-ink">
            {form.division === 'ACC' ? 'Código de repuesto' : 'Código (opcional)'}
            <input
              className={`${inputClassName} uppercase`}
              value={form.codigo}
              onChange={(event) => setValue('codigo', event.target.value.toUpperCase())}
              aria-invalid={Boolean(fieldErrors.codigo)}
              placeholder={form.division === 'ACC' ? 'REP-001' : 'SRV-001'}
            />
            {fieldErrors.codigo && (
              <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.codigo}</span>
            )}
          </label>
          <label className="text-sm font-medium text-brand-ink">
            Nombre
            <input
              className={inputClassName}
              value={form.nombre}
              onChange={(event) => setValue('nombre', event.target.value)}
              aria-invalid={Boolean(fieldErrors.nombre)}
              placeholder={
                form.division === 'ACC' ? 'Ej.: Parachoque delantero' : 'Ej.: Cambio de aceite'
              }
            />
            {fieldErrors.nombre && (
              <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.nombre}</span>
            )}
          </label>

          <label className="text-sm font-medium text-brand-ink">
            {form.subtipo === 'especifico' ? 'Valor referencial' : 'Precio neto'}
            <CurrencyInput
              value={form.precio}
              onChange={(value) => setValue('precio', value)}
              className={inputClassName}
              aria-label="Precio"
              aria-invalid={Boolean(fieldErrors.precio)}
            />
            {fieldErrors.precio && (
              <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.precio}</span>
            )}
            <span className="mt-1 block text-xs font-semibold text-brand-primaryInk">
              {Number.isFinite(pricePreview) ? formatClp(pricePreview) : formatClp(0)}
              {form.subtipo === 'especifico' && ' · Se valora tras diagnóstico'}
            </span>
          </label>

          <label className="text-sm font-medium text-brand-ink">
            Unidad
            <select
              className={inputClassName}
              value={form.unidadMedida}
              onChange={(event) =>
                setValue('unidadMedida', event.target.value as CatalogItem['unidadMedida'])
              }
              aria-label="Unidad de medida"
            >
              {UNIT_MEASURES.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_MEASURE_LABELS[unit]}
                </option>
              ))}
            </select>
            {fieldErrors.unidadMedida && (
              <span className="mt-1 block text-xs text-brand-coralInk">
                {fieldErrors.unidadMedida}
              </span>
            )}
          </label>

          {/* HH solo en servicios (MEC / DP legacy), nunca en ACC */}
          {form.division !== 'ACC' && (
            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              Horas hombre (HH)
              <input
                className={inputClassName}
                type="number"
                min="0"
                max="999.99"
                step="0.25"
                value={form.horasHombreEstandar}
                onChange={(event) => setValue('horasHombreEstandar', event.target.value)}
                aria-label="Horas hombre estándar por unidad"
                aria-invalid={Boolean(fieldErrors.horasHombreEstandar)}
                placeholder="Ej.: 1.5"
              />
              {fieldErrors.horasHombreEstandar && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.horasHombreEstandar}
                </span>
              )}
            </label>
          )}

          {/* Stock solo en ACC En stock */}
          {isPartStock && (
            <>
              <label className="text-sm font-medium text-brand-ink">
                {isEditing ? 'Stock actual' : 'Stock inicial'}
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) => setValue('stock', event.target.value)}
                  disabled={isEditing || !canInitializeStock}
                  aria-label={isEditing ? 'Stock actual' : 'Stock inicial'}
                  aria-invalid={Boolean(fieldErrors.stock)}
                />
                {fieldErrors.stock && (
                  <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.stock}</span>
                )}
              </label>

              <label className="text-sm font-medium text-brand-ink">
                Stock mínimo
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockMinimo}
                  onChange={(event) => setValue('stockMinimo', event.target.value)}
                  aria-label="Stock mínimo"
                  aria-invalid={Boolean(fieldErrors.stockMinimo)}
                />
                {fieldErrors.stockMinimo && (
                  <span className="mt-1 block text-xs text-brand-coralInk">
                    {fieldErrors.stockMinimo}
                  </span>
                )}
              </label>
            </>
          )}

          <label className="text-sm font-medium text-brand-ink sm:col-span-2">
            Descripción / Notas
            <textarea
              className="mt-1 min-h-20 w-full resize-y rounded-lg border border-brand-line px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
              value={form.descripcion}
              onChange={(event) => setValue('descripcion', event.target.value)}
              placeholder="Notas técnicas o compatibilidad"
            />
          </label>
        </div>

        {activeMutation.error && (
          <div
            className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{getApiErrorMessage(activeMutation.error)}</span>
          </div>
        )}
      </fieldset>
    </FormDialog>
  );
};

export default CatalogItemModal;
