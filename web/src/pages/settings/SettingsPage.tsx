import { updateCompanySettingsSchema } from '@unithor/shared';
import {
  AlertCircle,
  Building2,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  buildLogoUrl,
  useBranding,
  useCompanySettings,
  useDeleteCompanyLogo,
  useUpdateCompanySettings,
  useUploadCompanyLogo,
} from '../../hooks/useSettings';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatDateTime } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

const LOGO_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml';
const LOGO_MAX_MB = 2;

interface FormState {
  razonSocial: string;
  nombreComercial: string;
  rut: string;
  giro: string;
  direccion: string;
  region: string;
  comuna: string;
  telefono: string;
  email: string;
  sitioWeb: string;
}

const EMPTY_FORM: FormState = {
  razonSocial: '',
  nombreComercial: '',
  rut: '',
  giro: '',
  direccion: '',
  region: '',
  comuna: '',
  telefono: '',
  email: '',
  sitioWeb: '',
};

const toFormState = (data: {
  razonSocial: string;
  nombreComercial: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
  telefono: string | null;
  email: string | null;
  sitioWeb: string | null;
}): FormState => ({
  razonSocial: data.razonSocial,
  nombreComercial: data.nombreComercial ?? '',
  rut: data.rut ?? '',
  giro: data.giro ?? '',
  direccion: data.direccion ?? '',
  region: data.region ?? '',
  comuna: data.comuna ?? '',
  telefono: data.telefono ?? '',
  email: data.email ?? '',
  sitioWeb: data.sitioWeb ?? '',
});

const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15';

export const SettingsPage = () => {
  const user = useAuthStore((state) => state.user);
  const canEdit = Boolean(user && ['desarrollador', 'admin'].includes(user.role));

  const settingsQuery = useCompanySettings(canEdit);
  const brandingQuery = useBranding();
  const updateMutation = useUpdateCompanySettings();
  const uploadMutation = useUploadCompanyLogo();
  const deleteMutation = useDeleteCompanyLogo();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(toFormState(settingsQuery.data));
      setDirty(false);
    }
  }, [settingsQuery.data]);

  const setField = (field: keyof FormState, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    updateMutation.reset();
    setFieldErrors({});

    const result = updateCompanySettingsSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      notifyError('Revisa los campos marcados antes de guardar.');
      return;
    }

    updateMutation.mutate(result.data, {
      onSuccess: () => {
        setDirty(false);
        notifySuccess('Configuración de la empresa actualizada.');
      },
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo guardar la configuración.')),
    });
  };

  const onPickFile = (file: File | undefined): void => {
    if (!file) return;
    if (file.size > LOGO_MAX_MB * 1024 * 1024) {
      notifyError(`El logo no puede superar ${LOGO_MAX_MB} MB.`);
      return;
    }

    uploadMutation.mutate(file, {
      onSuccess: () => notifySuccess('Logo actualizado. Se aplicará en el login, el menú y los documentos.'),
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo subir el logo.')),
    });
  };

  const removeLogo = (): void => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => notifySuccess('Se restauró el logo original del sistema.'),
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo eliminar el logo.')),
    });
  };

  const logoSrc = settingsQuery.data?.logo.tieneLogo
    ? buildLogoUrl(brandingQuery.data)
    : '/marca.webp';

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Solo los administradores pueden ver y modificar la configuración de la empresa.
      </div>
    );
  }

  if (settingsQuery.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center text-brand-blue" role="status">
        <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
        <span className="sr-only">Cargando configuración</span>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {getApiErrorMessage(settingsQuery.error, 'No fue posible cargar la configuración')}
      </div>
    );
  }

  const errorMessage = updateMutation.isError ? getApiErrorMessage(updateMutation.error) : null;
  const logoBusy = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <p className="text-sm font-medium text-slate-500">Administración</p>
        <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Configuración</h1>
        <p className="mt-1 text-sm text-slate-600">
          Estos datos aparecen en el encabezado de la orden de trabajo, la cotización y el acta de entrega.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="settings-logo-title">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-blue">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="settings-logo-title" className="font-bold text-brand-blue">Logo de la empresa</h2>
              <p className="mt-1 text-sm text-slate-500">
                Se muestra en el menú lateral, el inicio de sesión y los documentos imprimibles.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[auto_1fr]">
          <div className="flex h-32 w-64 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
            {settingsQuery.data?.logo.tieneLogo ? (
              <img src={logoSrc} alt="Logo configurado" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-center">
                <img src="/marca.webp" alt="Logo original del sistema" className="mx-auto max-h-20 w-auto object-contain" />
                <p className="mt-2 text-xs text-slate-500">Logo original del sistema</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Acepta JPEG, PNG, WebP o SVG de hasta {LOGO_MAX_MB} MB. Se recomienda un logo horizontal
              con fondo transparente.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_ACCEPT}
                className="sr-only"
                aria-label="Seleccionar logo"
                onChange={(event) => {
                  onPickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {uploadMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                Subir logo
              </button>
              {settingsQuery.data?.logo.tieneLogo && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={logoBusy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Restaurar logo original
                </button>
              )}
            </div>
            {settingsQuery.data?.logo.tieneLogo && settingsQuery.data.logo.updatedAt && (
              <p className="text-xs text-slate-500">
                <RefreshCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />
                Actualizado el {formatDateTime(settingsQuery.data.logo.updatedAt)}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="settings-company-title">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-blue">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="settings-company-title" className="font-bold text-brand-blue">Identidad de la empresa</h2>
            <p className="mt-1 text-sm text-slate-500">Razón social, contacto y domicilio que se imprimen en los documentos.</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate>
          {errorMessage && (
            <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errorMessage}
            </div>
          )}

          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Razón social *
              <input className={inputClass} value={form.razonSocial} onChange={(event) => setField('razonSocial', event.target.value)} aria-invalid={Boolean(fieldErrors.razonSocial)} />
              {fieldErrors.razonSocial && <span className="mt-1 block text-xs text-red-600">{fieldErrors.razonSocial}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Nombre comercial
              <input className={inputClass} value={form.nombreComercial} onChange={(event) => setField('nombreComercial', event.target.value)} placeholder="UNITHOR" aria-invalid={Boolean(fieldErrors.nombreComercial)} />
              {fieldErrors.nombreComercial && <span className="mt-1 block text-xs text-red-600">{fieldErrors.nombreComercial}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              R.U.T.
              <input className={inputClass} value={form.rut} onChange={(event) => setField('rut', event.target.value)} placeholder="77.374.788-1" aria-invalid={Boolean(fieldErrors.rut)} />
              {fieldErrors.rut && <span className="mt-1 block text-xs text-red-600">{fieldErrors.rut}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Giro
              <input className={inputClass} value={form.giro} onChange={(event) => setField('giro', event.target.value)} placeholder="Servicios de mantenimiento vehicular" aria-invalid={Boolean(fieldErrors.giro)} />
              {fieldErrors.giro && <span className="mt-1 block text-xs text-red-600">{fieldErrors.giro}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Dirección
              <input className={inputClass} value={form.direccion} onChange={(event) => setField('direccion', event.target.value)} placeholder="Arturo Fernández 2101" aria-invalid={Boolean(fieldErrors.direccion)} />
              {fieldErrors.direccion && <span className="mt-1 block text-xs text-red-600">{fieldErrors.direccion}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Región
              <input className={inputClass} value={form.region} onChange={(event) => setField('region', event.target.value)} placeholder="Tarapacá" aria-invalid={Boolean(fieldErrors.region)} />
              {fieldErrors.region && <span className="mt-1 block text-xs text-red-600">{fieldErrors.region}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Comuna
              <input className={inputClass} value={form.comuna} onChange={(event) => setField('comuna', event.target.value)} placeholder="Iquique" aria-invalid={Boolean(fieldErrors.comuna)} />
              {fieldErrors.comuna && <span className="mt-1 block text-xs text-red-600">{fieldErrors.comuna}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Teléfono
              <input className={inputClass} value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} placeholder="+56 9 2375 7478" aria-invalid={Boolean(fieldErrors.telefono)} />
              {fieldErrors.telefono && <span className="mt-1 block text-xs text-red-600">{fieldErrors.telefono}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Correo de contacto
              <input className={inputClass} type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="contacto@unithor.cl" aria-invalid={Boolean(fieldErrors.email)} />
              {fieldErrors.email && <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Sitio web
              <input className={inputClass} value={form.sitioWeb} onChange={(event) => setField('sitioWeb', event.target.value)} placeholder="unithor.cl" aria-invalid={Boolean(fieldErrors.sitioWeb)} />
              {fieldErrors.sitioWeb && <span className="mt-1 block text-xs text-red-600">{fieldErrors.sitioWeb}</span>}
            </label>
          </div>

          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {settingsQuery.data?.lastEditor
                ? `Última edición: ${settingsQuery.data.lastEditor.nombre} · ${formatDateTime(settingsQuery.data.updatedAt)}`
                : 'Sin ediciones registradas'}
            </p>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs font-semibold text-amber-700">Hay cambios sin guardar</span>}
              <button
                type="button"
                onClick={() => {
                  if (settingsQuery.data) setForm(toFormState(settingsQuery.data));
                  setFieldErrors({});
                  setDirty(false);
                  updateMutation.reset();
                }}
                disabled={!dirty || updateMutation.isPending}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Descartar
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {updateMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Guardar cambios
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default SettingsPage;
