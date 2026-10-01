import { createClientSchema, formatRut, isValidRut, updateClientSchema } from '@unithor/shared';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  MapPin,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { CHILE_REGIONS } from '../../data/chile-locations';
import { useCreateClientMutation, useUpdateClientMutation } from '../../hooks/useClients';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage, getApiFieldErrors, isApiConflict } from '../../lib/api-error';
import {
  findChileRegion,
  findCommuneRegion,
  normalizeLocationText,
  regionOptions,
} from '../../lib/chile-locations';
import { getFieldErrors } from '../../lib/form-errors';
import ModalHeader from '../common/ModalHeader';
import RutInput from '../common/RutInput';
import SearchableSelect from '../common/SearchableSelect';

import type { Client } from '../../types/entities';
import type { ReactNode } from 'react';

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
  rut: formatRut(client?.rut ?? ''),
  nombre: client?.nombre ?? '',
  tipo: client?.tipo ?? 'cliente',
  email: client?.email ?? '',
  telefono: client?.telefono ?? '',
  direccion: client?.direccion ?? '',
  region: client?.region ?? '',
  comuna: client?.comuna ?? '',
  notas: client?.notas ?? '',
});

const additionalFields = ['direccion', 'region', 'comuna', 'notas'];
const inputClassName =
  'h-11 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none transition placeholder:text-brand-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk disabled:bg-brand-light';

const Field = ({
  name,
  label,
  optional,
  error,
  children,
  className = '',
}: {
  name: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`min-w-0 ${className}`}>
    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-medium text-brand-ink">
      <label htmlFor={`client-${name}`}>{label}</label>
      <span aria-hidden="true" className="text-xs font-normal text-brand-muted">
        {optional ? 'Opcional' : 'Obligatorio'}
      </span>
    </div>
    {children}
    {error && (
      <p id={`client-${name}-error`} className="mt-1.5 text-xs text-brand-coralInk">
        {error}
      </p>
    )}
  </div>
);

export const ClientFormModal = ({ client, onClose, onSaved }: ClientFormModalProps) => {
  const [initial] = useState(() => getInitialState(client));
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showAdditional, setShowAdditional] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorFocus = useRef<string | null>(null);
  const createMutation = useCreateClientMutation();
  const updateMutation = useUpdateClientMutation();
  const isEditing = Boolean(client);
  const activeMutation = isEditing ? updateMutation : createMutation;
  const hasChanges = (Object.keys(form) as Array<keyof ClientFormState>).some(
    (key) => form[key] !== initial[key],
  );
  const selectedRegion = findChileRegion(form.region);
  const communeOptions = (selectedRegion ? [selectedRegion] : CHILE_REGIONS).flatMap((region) =>
    region.communes.map((name) => ({
      value: name,
      label: name,
      description: selectedRegion ? undefined : region.name,
    })),
  );

  const close = (): void => {
    if (!activeMutation.isPending) onClose();
  };
  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose: close,
    isPending: activeMutation.isPending,
    initialFocusRef: nameRef,
  });

  useLayoutEffect(() => {
    if (!errorFocus.current) return;
    const input = formRef.current?.elements.namedItem(errorFocus.current);
    if (input instanceof HTMLElement) input.focus();
    errorFocus.current = null;
  }, [fieldErrors, showAdditional]);

  const setValue = <K extends keyof ClientFormState>(key: K, value: ClientFormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (activeMutation.isError) activeMutation.reset();
  };

  const showErrors = (errors: Record<string, string>): void => {
    setFieldErrors(errors);
    if (additionalFields.some((key) => errors[key])) setShowAdditional(true);
    errorFocus.current = Object.keys(errors).find((key) => key in form) ?? null;
  };

  const selectRegion = (value: string): void => {
    const region = findChileRegion(value);
    const commune = region?.communes.find(
      (name) => normalizeLocationText(name) === normalizeLocationText(form.comuna),
    );
    setValue('region', value);
    setValue('comuna', commune ?? '');
  };

  const selectCommune = (value: string): void => {
    setValue('comuna', value);
    const region = findCommuneRegion(value);
    if (region) setValue('region', region.name);
  };

  const onMutationError = (error: unknown): void => {
    showErrors(
      isApiConflict(error)
        ? {
            rut: 'Ya existe un cliente con este RUN/RUT. Revisa el número o busca al cliente registrado.',
          }
        : getApiFieldErrors(error),
    );
  };

  const fieldProps = (key: keyof ClientFormState) => ({
    id: `client-${key}`,
    name: key,
    'aria-invalid': Boolean(fieldErrors[key]),
    'aria-describedby': fieldErrors[key]
      ? `client-${key}-error`
      : key === 'rut'
        ? 'client-rut-hint'
        : undefined,
    onBlur: () => {
      if (isEditing && form[key] === initial[key]) return;
      const result = createClientSchema.shape[key].safeParse(form[key]);
      if (!result.success)
        setFieldErrors((current) => ({ ...current, [key]: result.error.issues[0].message }));
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (activeMutation.isPending) return;
    activeMutation.reset();
    const callbacks = {
      onSuccess: (saved: Client) => {
        onSaved?.(saved);
        onClose();
      },
      onError: onMutationError,
    };
    if (client) {
      const changed = Object.fromEntries(
        Object.entries(form).filter(
          ([key, value]) => value !== initial[key as keyof ClientFormState],
        ),
      );
      const result = updateClientSchema.safeParse(changed);
      if (!result.success) {
        showErrors(getFieldErrors(result.error.issues));
        return;
      }
      setFieldErrors({});
      updateMutation.mutate({ id: client.id, data: result.data }, callbacks);
    } else {
      const result = createClientSchema.safeParse(form);
      if (!result.success) {
        showErrors(getFieldErrors(result.error.issues));
        return;
      }
      setFieldErrors({});
      createMutation.mutate(result.data, callbacks);
    }
  };

  const hasErrors = Object.keys(fieldErrors).length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="fixed inset-0 bg-brand-scrim/35 backdrop-blur-sm"
        aria-label="Cerrar formulario de cliente"
        onClick={close}
        disabled={activeMutation.isPending}
        tabIndex={-1}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-lg border border-brand-line bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="client-form-title"
      >
        <div className="shrink-0">
          <ModalHeader
            id="client-form-title"
            title={isEditing ? 'Editar cliente' : 'Nuevo cliente'}
            onClose={close}
          />
        </div>
        <form
          ref={formRef}
          className="flex min-h-0 flex-col"
          noValidate
          onSubmit={handleSubmit}
          aria-busy={activeMutation.isPending}
        >
          <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-7">
            <fieldset disabled={activeMutation.isPending} className="min-w-0 space-y-5">
              <legend className="sr-only">Datos del cliente</legend>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-brand-ink">Tipo de cliente</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'cliente', label: 'Persona natural', icon: UserRound },
                      { value: 'empresa', label: 'Empresa', icon: Building2 },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <label key={value} className="relative min-w-0 cursor-pointer">
                      <input
                        type="radio"
                        name="tipo"
                        value={value}
                        checked={form.tipo === value}
                        onChange={() => setValue('tipo', value)}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand-line px-2 py-2 text-center text-sm font-semibold text-brand-muted transition peer-checked:border-brand-primary peer-checked:bg-brand-pale peer-checked:text-brand-primaryInk peer-focus-visible:ring-2 peer-focus-visible:ring-brand-primary peer-focus-visible:ring-offset-2">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="nombre"
                  label={form.tipo === 'empresa' ? 'Razón social' : 'Nombre completo'}
                  error={fieldErrors.nombre}
                  className="sm:col-span-2"
                >
                  <input
                    {...fieldProps('nombre')}
                    ref={nameRef}
                    required
                    className={inputClassName}
                    autoComplete={form.tipo === 'empresa' ? 'organization' : 'name'}
                    value={form.nombre}
                    onChange={(event) => setValue('nombre', event.target.value)}
                    placeholder={
                      form.tipo === 'empresa' ? 'Nombre legal de la empresa' : 'Nombre y apellido'
                    }
                  />
                </Field>
                <Field
                  name="rut"
                  label={form.tipo === 'empresa' ? 'RUT de la empresa' : 'RUN / RUT'}
                  optional
                  error={fieldErrors.rut}
                  className="sm:col-span-2"
                >
                  <div className="relative">
                    <RutInput
                      {...fieldProps('rut')}
                      className={`${inputClassName} pr-10 font-mono`}
                      value={form.rut}
                      onChange={(value) => setValue('rut', value)}
                      placeholder="12.345.678-5"
                    />
                    {isValidRut(form.rut) && !fieldErrors.rut && (
                      <CheckCircle2
                        className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-brand-mintInk"
                        aria-label="Dígito verificador correcto"
                      />
                    )}
                  </div>
                  {!fieldErrors.rut && (
                    <p id="client-rut-hint" className="mt-1.5 text-xs text-brand-muted">
                      Número de cédula o RUT, incluido el último dígito o K.
                    </p>
                  )}
                </Field>
              </div>

              <section
                className="border-t border-brand-line pt-4"
                aria-labelledby="client-contact-heading"
              >
                <h3
                  id="client-contact-heading"
                  className="mb-3 text-sm font-semibold text-brand-primaryInk"
                >
                  Contacto
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="telefono" label="Teléfono" optional error={fieldErrors.telefono}>
                    <input
                      {...fieldProps('telefono')}
                      className={inputClassName}
                      type="tel"
                      autoComplete="tel"
                      value={form.telefono}
                      onChange={(event) => setValue('telefono', event.target.value)}
                      placeholder="+56 9 1234 5678"
                    />
                  </Field>
                  <Field name="email" label="Correo electrónico" optional error={fieldErrors.email}>
                    <input
                      {...fieldProps('email')}
                      className={inputClassName}
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => setValue('email', event.target.value)}
                      placeholder="nombre@correo.cl"
                    />
                  </Field>
                </div>
              </section>

              <section className="border-t border-brand-line pt-1">
                <button
                  type="button"
                  aria-expanded={showAdditional}
                  aria-controls="client-additional-fields"
                  onClick={() => setShowAdditional((current) => !current)}
                  className="flex min-h-12 w-full items-center gap-2 text-left text-sm font-semibold text-brand-primaryInk"
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Dirección y notas
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 transition-transform ${showAdditional ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <div id="client-additional-fields" hidden={!showAdditional}>
                  <div className="grid gap-4 pt-2 sm:grid-cols-2">
                    <Field
                      name="direccion"
                      label="Dirección"
                      optional
                      error={fieldErrors.direccion}
                      className="sm:col-span-2"
                    >
                      <input
                        {...fieldProps('direccion')}
                        className={inputClassName}
                        autoComplete="street-address"
                        value={form.direccion}
                        onChange={(event) => setValue('direccion', event.target.value)}
                        placeholder="Calle y número"
                      />
                    </Field>
                    <Field name="region" label="Región" optional error={fieldErrors.region}>
                      <SearchableSelect
                        {...fieldProps('region')}
                        className={inputClassName}
                        options={regionOptions}
                        value={form.region}
                        onChange={selectRegion}
                        placeholder="Buscar región"
                        clearLabel="Limpiar región"
                        listLabel="Regiones de Chile"
                        disabled={activeMutation.isPending}
                      />
                    </Field>
                    <Field name="comuna" label="Comuna" optional error={fieldErrors.comuna}>
                      <SearchableSelect
                        {...fieldProps('comuna')}
                        className={inputClassName}
                        options={communeOptions}
                        value={form.comuna}
                        onChange={selectCommune}
                        placeholder="Buscar comuna"
                        clearLabel="Limpiar comuna"
                        listLabel="Comunas de Chile"
                        disabled={activeMutation.isPending}
                      />
                    </Field>
                    <Field
                      name="notas"
                      label="Notas"
                      optional
                      error={fieldErrors.notas}
                      className="sm:col-span-2"
                    >
                      <textarea
                        {...fieldProps('notas')}
                        className={`${inputClassName} min-h-20 resize-y py-2.5`}
                        value={form.notas}
                        onChange={(event) => setValue('notas', event.target.value)}
                        placeholder="Antecedentes del cliente"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              {(hasErrors || activeMutation.error) && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale p-3 text-sm text-brand-coralInk"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {hasErrors
                      ? 'Revisa los campos marcados antes de guardar.'
                      : getApiErrorMessage(activeMutation.error)}
                  </span>
                </div>
              )}
            </fieldset>
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-brand-line bg-white px-5 py-4 sm:px-7">
            <button
              type="button"
              className="secondary-button"
              onClick={close}
              disabled={activeMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={activeMutation.isPending || (isEditing && !hasChanges)}
            >
              {activeMutation.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
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
