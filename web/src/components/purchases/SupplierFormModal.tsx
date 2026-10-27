import { updateSupplierSchema } from '@unithor/shared';
import { BadgeAlert, BadgeCheck, LoaderCircle, Save } from 'lucide-react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useUpdateSupplierMutation } from '../../hooks/usePurchases';
import { getApiFieldErrors, getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import ModalHeader from '../common/ModalHeader';
import RutInput from '../common/RutInput';

import type { FieldErrors } from '../../lib/form-errors';
import type { Supplier } from '../../types/entities';
import type { UpdateSupplierInput } from '@unithor/shared';

interface SupplierFormModalProps {
  supplier: Supplier;
  onClose: () => void;
  onSaved?: (supplier: Supplier) => void;
}

export const SupplierFormModal = ({ supplier, onClose, onSaved }: SupplierFormModalProps) => {
  const mutation = useUpdateSupplierMutation();
  const [nombre, setNombre] = useState(supplier.nombre);
  const [rut, setRut] = useState(supplier.rut ?? '');
  const [telefono, setTelefono] = useState(supplier.telefono ?? '');
  const [email, setEmail] = useState(supplier.email ?? '');
  const [direccion, setDireccion] = useState(supplier.direccion ?? '');
  const [contactoNombre, setContactoNombre] = useState(supplier.contactoNombre ?? '');
  const [notas, setNotas] = useState(supplier.notas ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useModalOverlay({ isOpen: true, onClose, isPending: mutation.isPending });

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFormError(null);

    const parsed = updateSupplierSchema.safeParse({
      nombre: nombre.trim(),
      rut: rut.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      direccion: direccion.trim(),
      contactoNombre: contactoNombre.trim(),
      notas: notas.trim(),
    });

    if (!parsed.success) {
      setErrors(getFieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    mutation.mutate(
      { supplierId: supplier.id, data: parsed.data as UpdateSupplierInput },
      {
        onSuccess: (updated) => {
          notifySuccess('Datos del proveedor actualizados.');
          onSaved?.(updated);
          onClose();
        },
        onError: (error) => {
          setErrors(getApiFieldErrors(error));
          const message = getApiErrorMessage(error);
          setFormError(message);
          notifyError(message);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-brand-scrim/60"
        aria-label="Cerrar proveedor"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
      >
        <ModalHeader
          id="supplier-modal-title"
          title="Datos del proveedor"
          description={
            supplier.datosCompletos
              ? 'Actualiza la información comercial del proveedor.'
              : 'Completa RUT y un canal de contacto para cerrar la ficha.'
          }
          onClose={onClose}
          badge={
            supplier.datosCompletos ? (
              <BadgeCheck className="h-6 w-6" aria-hidden="true" />
            ) : (
              <BadgeAlert className="h-6 w-6" aria-hidden="true" />
            )
          }
          tone={supplier.datosCompletos ? 'success' : 'gold'}
        />

        <form onSubmit={submit} className="px-7 pb-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-brand-ink sm:col-span-2">
              Nombre o razón social
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                maxLength={180}
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                aria-invalid={Boolean(errors.nombre)}
              />
              {errors.nombre && (
                <span className="mt-1 block text-xs text-brand-coralInk">{errors.nombre}</span>
              )}
            </label>
            <label className="block text-sm font-semibold text-brand-ink">
              RUT
              <RutInput
                value={rut}
                onChange={setRut}
                placeholder="12.345.678-5"
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                aria-invalid={Boolean(errors.rut)}
              />
              {errors.rut && (
                <span className="mt-1 block text-xs text-brand-coralInk">{errors.rut}</span>
              )}
            </label>
            <label className="block text-sm font-semibold text-brand-ink">
              Teléfono
              <input
                value={telefono}
                onChange={(event) => setTelefono(event.target.value)}
                maxLength={30}
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                aria-invalid={Boolean(errors.telefono)}
              />
              {errors.telefono && (
                <span className="mt-1 block text-xs text-brand-coralInk">{errors.telefono}</span>
              )}
            </label>
            <label className="block text-sm font-semibold text-brand-ink">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={180}
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && (
                <span className="mt-1 block text-xs text-brand-coralInk">{errors.email}</span>
              )}
            </label>
            <label className="block text-sm font-semibold text-brand-ink">
              Contacto
              <input
                value={contactoNombre}
                onChange={(event) => setContactoNombre(event.target.value)}
                maxLength={180}
                placeholder="Nombre del vendedor o ejecutivo"
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
              />
            </label>
            <label className="block text-sm font-semibold text-brand-ink sm:col-span-2">
              Dirección
              <input
                value={direccion}
                onChange={(event) => setDireccion(event.target.value)}
                maxLength={255}
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
              />
            </label>
            <label className="block text-sm font-semibold text-brand-ink sm:col-span-2">
              Notas
              <textarea
                value={notas}
                onChange={(event) => setNotas(event.target.value)}
                maxLength={1000}
                rows={3}
                className="mt-2 w-full rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary"
              />
            </label>
          </div>

          {formError && (
            <p className="mt-4 text-sm text-brand-coralInk" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-muted">
              Se considera completo con nombre, RUT y teléfono o email.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Guardar datos
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
};

export default SupplierFormModal;
