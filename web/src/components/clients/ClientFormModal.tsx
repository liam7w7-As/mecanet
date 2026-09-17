import { createClientSchema } from '@unithor/shared';
import { AlertCircle, Building2, LoaderCircle, UserRound, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { AnimateIcon } from '../animate-ui';
import { useCreateClientMutation, useUpdateClientMutation } from '../../hooks/useClients';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { Client } from '../../types/entities';

interface ClientFormModalProps {
  client?: Client | null;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}

interface ClientFormState {
  rut: string;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  email: string;
  telefono: string;
  direccion: string;
  region: string;
  comuna: string;
  notas: string;
}

const getInitialState = (client?: Client | null): ClientFormState => ({
  rut: client?.rut ?? '',
  nombre: client?.nombre ?? '',
  tipo: client?.tipo ?? 'cliente',
  email: client?.email ?? '',
  telefono: client?.telefono ?? '',
  direccion: client?.direccion ?? '',
  region: client?.region ?? '',
  comuna: client?.comuna ?? '',
  notas: client?.notas ?? '',
});

const inputClassName =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500';

export const ClientFormModal = ({ client, onClose, onSaved }: ClientFormModalProps) => {
  const [form, setForm] = useState<ClientFormState>(() => getInitialState(client));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateClientMutation();
  const updateMutation = useUpdateClientMutation();
  const isEditing = Boolean(client);
  const activeMutation = isEditing ? updateMutation : createMutation;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !activeMutation.isPending) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeMutation.isPending, onClose]);

  const setValue = <K extends keyof ClientFormState>(key: K, value: ClientFormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    createMutation.reset();
    updateMutation.reset();

    const result = createClientSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }

    if (client) {
      updateMutation.mutate(
        { id: client.id, data: result.data },
        {
          onSuccess: (savedClient) => {
            onSaved?.(savedClient);
            onClose();
          },
        },
      );
      return;
    }

    createMutation.mutate(result.data, {
      onSuccess: (savedClient) => {
        onSaved?.(savedClient);
        onClose();
      },
    });
  };

  const mutationError = activeMutation.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55"
        aria-label="Cerrar formulario de cliente"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-title"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="client-form-title" className="text-lg font-semibold text-brand-blue">
              {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Datos de identificación y contacto</p>
          </div>
          <button
            type="button"
            className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-blue"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <AnimateIcon icon={X} animation="spin" size={18} />
          </button>
        </header>

        <form className="space-y-6 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de cliente</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'cliente', label: 'Persona natural', icon: UserRound },
                { value: 'empresa', label: 'Empresa', icon: Building2 },
              ] as const).map((option) => {
                const Icon = option.icon;
                const selected = form.tipo === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`group flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                      selected
                        ? 'border-brand-blue bg-brand-blue text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-brand-blue/40'
                    }`}
                    onClick={() => setValue('tipo', option.value)}
                    aria-pressed={selected}
                  >
                    <AnimateIcon icon={Icon} animation="hover-lift" size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              RUT / Identificación
              <input
                className={inputClassName}
                value={form.rut}
                onChange={(event) => setValue('rut', event.target.value)}
                aria-invalid={Boolean(fieldErrors.rut)}
                placeholder="12.345.678-9"
              />
              {fieldErrors.rut && <span className="mt-1 block text-xs text-red-600">{fieldErrors.rut}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              {form.tipo === 'empresa' ? 'Razón social' : 'Nombre completo'}
              <input
                className={inputClassName}
                value={form.nombre}
                onChange={(event) => setValue('nombre', event.target.value)}
                aria-invalid={Boolean(fieldErrors.nombre)}
                placeholder={form.tipo === 'empresa' ? 'Empresa SpA' : 'Nombre y apellido'}
              />
              {fieldErrors.nombre && (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.nombre}</span>
              )}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Correo electrónico
              <input
                className={inputClassName}
                type="email"
                value={form.email}
                onChange={(event) => setValue('email', event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                placeholder="contacto@empresa.cl"
              />
              {fieldErrors.email && (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>
              )}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Teléfono
              <input
                className={inputClassName}
                value={form.telefono}
                onChange={(event) => setValue('telefono', event.target.value)}
                aria-invalid={Boolean(fieldErrors.telefono)}
                placeholder="+56 9 1234 5678"
              />
              {fieldErrors.telefono && (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.telefono}</span>
              )}
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Dirección
              <input
                className={inputClassName}
                value={form.direccion}
                onChange={(event) => setValue('direccion', event.target.value)}
                aria-invalid={Boolean(fieldErrors.direccion)}
                placeholder="Calle, número y referencia"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Región
              <input
                className={inputClassName}
                value={form.region}
                onChange={(event) => setValue('region', event.target.value)}
                aria-invalid={Boolean(fieldErrors.region)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Comuna
              <input
                className={inputClassName}
                value={form.comuna}
                onChange={(event) => setValue('comuna', event.target.value)}
                aria-invalid={Boolean(fieldErrors.comuna)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Notas
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                value={form.notas}
                onChange={(event) => setValue('notas', event.target.value)}
                placeholder="Antecedentes relevantes del cliente"
              />
            </label>
          </div>

          {mutationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isApiConflict(mutationError)
                  ? 'Ya existe un cliente con ese RUT.'
                  : getApiErrorMessage(mutationError)}
              </span>
            </div>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              disabled={activeMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={activeMutation.isPending}
            >
              {activeMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {activeMutation.isPending
                ? 'Guardando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear cliente'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default ClientFormModal;
