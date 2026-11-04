import { updateCompanySettingsSchema } from '@unithor/shared';
import { AlertCircle, Building2, Image as ImageIcon, LoaderCircle, RefreshCcw, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import FormDialog from '../../components/common/FormDialog';
import { buildLogoUrl, useCompanySettings, useDeleteCompanyLogo, useUpdateCompanySettings, useUploadCompanyLogo } from '../../hooks/useSettings';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatDateTime } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { CompanySettings } from '../../hooks/useSettings';

const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const LOGO_MAX_MB = 2;
interface FormState {
  razonSocial: string; nombreComercial: string; rut: string; giro: string; direccion: string;
  region: string; comuna: string; telefono: string; email: string; sitioWeb: string;
}
const EMPTY_FORM: FormState = {
  razonSocial: '', nombreComercial: '', rut: '', giro: '', direccion: '', region: '', comuna: '', telefono: '', email: '', sitioWeb: '',
};
const toFormState = (data: CompanySettings): FormState => ({
  razonSocial: data.razonSocial, nombreComercial: data.nombreComercial ?? '', rut: data.rut ?? '', giro: data.giro ?? '',
  direccion: data.direccion ?? '', region: data.region ?? '', comuna: data.comuna ?? '', telefono: data.telefono ?? '',
  email: data.email ?? '', sitioWeb: data.sitioWeb ?? '',
});

export const SettingsPage = () => {
  const user = useAuthStore((state) => state.user);
  const canEdit = Boolean(user && ['desarrollador', 'admin'].includes(user.role));
  const settingsQuery = useCompanySettings(canEdit);
  const updateMutation = useUpdateCompanySettings();
  const uploadMutation = useUploadCompanyLogo();
  const deleteMutation = useDeleteCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmRestore, setConfirmRestore] = useState(false);
  const savedForm = settingsQuery.data ? toFormState(settingsQuery.data) : EMPTY_FORM;
  const form = draft ?? savedForm;
  const dirty = draft !== null;
  const busy = updateMutation.isPending || uploadMutation.isPending || deleteMutation.isPending;

  useEffect(() => {
    if (!dirty && !busy) return undefined;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  const setField = (field: keyof FormState, value: string): void => {
    setDraft((current) => {
      const next = { ...(current ?? savedForm), [field]: value };
      return (Object.keys(next) as Array<keyof FormState>).every((key) => next[key] === savedForm[key]) ? null : next;
    });
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!dirty || busy) return;
    updateMutation.reset();
    const result = updateCompanySettingsSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      notifyError('Revisa los campos marcados antes de guardar.');
      return;
    }
    setFieldErrors({});
    updateMutation.mutate(result.data, {
      onSuccess: () => { setDraft(null); notifySuccess('Configuración de la empresa actualizada.'); },
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo guardar la configuración.')),
    });
  };
  const onPickFile = (file: File | undefined): void => {
    if (!file || busy) return;
    if (!LOGO_TYPES.includes(file.type)) { notifyError('Selecciona un logo JPEG, PNG, WebP o SVG.'); return; }
    if (file.size > LOGO_MAX_MB * 1024 * 1024) { notifyError(`El logo no puede superar ${LOGO_MAX_MB} MB.`); return; }
    uploadMutation.mutate(file, {
      onSuccess: () => notifySuccess('Logo actualizado. Se aplicará en el login, el menú y los documentos.'),
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo subir el logo.')),
    });
  };
  const removeLogo = (): void => {
    if (busy) return;
    deleteMutation.mutate(undefined, {
      onSuccess: () => { setConfirmRestore(false); notifySuccess('Se restauró el logo original del sistema.'); },
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo restaurar el logo.')),
    });
  };
  const logoSrc = settingsQuery.data ? buildLogoUrl({ ...settingsQuery.data, tieneLogo: settingsQuery.data.logo.tieneLogo, logoUpdatedAt: settingsQuery.data.logo.updatedAt }) : '/marca.webp';
  const renderField = (name: keyof FormState, label: string, options: { wide?: boolean; type?: 'email' | 'tel'; placeholder?: string; autoComplete?: string } = {}) =>
    <label key={name} htmlFor={`company-${name}`} className={options.wide ? 'administration-wide' : undefined}>
      <span>{label}</span><input id={`company-${name}`} type={options.type ?? 'text'} value={form[name]}
        onChange={(event) => setField(name, event.target.value)} placeholder={options.placeholder}
        autoComplete={options.autoComplete} aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `company-${name}-error` : undefined} />
      {fieldErrors[name] && <span id={`company-${name}-error`} className="administration-field-error">{fieldErrors[name]}</span>}
    </label>;

  if (!canEdit) return <div className="administration-notice">Solo los administradores pueden ver y modificar la configuración de la empresa.</div>;
  if (settingsQuery.isPending) return <div className="administration-empty" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><p>Cargando configuración</p></div>;
  if (settingsQuery.isError) return <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />
    {getApiErrorMessage(settingsQuery.error, 'No fue posible cargar la configuración')}
    <button type="button" onClick={() => void settingsQuery.refetch()}>Reintentar</button>
  </div>;

  return <div className="workspace-page workspace-settings administration-page">
    <header className="administration-heading"><h1>Configuración</h1><p>Identidad y documentos de la empresa</p></header>
    <section className="administration-settings-panel" aria-labelledby="settings-company-title">
      <header className="administration-panel-heading"><Building2 aria-hidden="true" /><div><h2 id="settings-company-title">Datos de la empresa</h2>
        <p>Esta información aparece en las órdenes de trabajo, cotizaciones y documentos del taller.</p></div></header>
      <form onSubmit={submit} noValidate aria-busy={updateMutation.isPending}>
        {updateMutation.error && <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />{getApiErrorMessage(updateMutation.error)}</div>}
        <fieldset disabled={busy} className="administration-settings-fields">
          <div className="administration-form-grid">
            {renderField('razonSocial', 'Razón social *', { autoComplete: 'organization' })}
            {renderField('nombreComercial', 'Nombre comercial', { placeholder: 'UNITHOR' })}
            {renderField('rut', 'R.U.T.', { placeholder: '77.374.788-1' })}
            {renderField('giro', 'Giro', { placeholder: 'Servicios de mantenimiento vehicular' })}
            {renderField('direccion', 'Dirección', { wide: true, autoComplete: 'street-address' })}
            {renderField('region', 'Región', { autoComplete: 'address-level1' })}
            {renderField('comuna', 'Comuna', { autoComplete: 'address-level2' })}
          </div>
          <h3 className="administration-settings-subtitle">Contacto</h3>
          <div className="administration-form-grid">
            {renderField('telefono', 'Teléfono', { type: 'tel', autoComplete: 'tel', placeholder: '+56 9 2375 7478' })}
            {renderField('email', 'Correo de contacto', { type: 'email', autoComplete: 'email', placeholder: 'contacto@unithor.cl' })}
            {renderField('sitioWeb', 'Sitio web', { wide: true, autoComplete: 'url', placeholder: 'unithor.cl' })}
          </div>
        </fieldset>
        <footer className="administration-settings-footer"><div aria-live="polite">
          <p>{busy ? 'Guardando cambios…' : dirty ? 'Hay cambios sin guardar' : updateMutation.isSuccess ? 'Configuración guardada' : 'Sin cambios pendientes'}</p>
          <small>{settingsQuery.data?.lastEditor ? `Última edición: ${settingsQuery.data.lastEditor.nombre} · ${formatDateTime(settingsQuery.data.updatedAt)}` : 'Sin ediciones registradas'}</small>
        </div><div>
          <button type="button" className="administration-secondary" disabled={!dirty || busy}
            onClick={() => { setDraft(null); setFieldErrors({}); updateMutation.reset(); }}><RotateCcw aria-hidden="true" />Descartar</button>
          <button type="submit" className="administration-primary" disabled={!dirty || busy}>
            {updateMutation.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Guardar cambios
          </button>
        </div></footer>
      </form>
    </section>
    <section className="administration-settings-panel" aria-labelledby="settings-logo-title">
      <header className="administration-panel-heading"><ImageIcon aria-hidden="true" /><div><h2 id="settings-logo-title">Logo de la empresa</h2>
        <p>Se muestra en el menú, el inicio de sesión y los documentos imprimibles.</p></div></header>
      <div className="administration-branding-body"><div className="administration-logo-preview">
        <img src={logoSrc} alt={settingsQuery.data?.logo.tieneLogo ? 'Logo configurado' : 'Logo original del sistema'} />
        {!settingsQuery.data?.logo.tieneLogo && <p>Logo original del sistema</p>}
      </div><div className="administration-logo-controls">
        <p>JPEG, PNG, WebP o SVG de hasta {LOGO_MAX_MB} MB. Preferiblemente horizontal y con fondo transparente.</p>
        <input ref={fileInputRef} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" aria-label="Seleccionar logo" disabled={busy}
          onChange={(event) => { onPickFile(event.target.files?.[0]); event.target.value = ''; }} />
        <div><button type="button" className="administration-primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          {uploadMutation.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}Subir logo</button>
          {settingsQuery.data?.logo.tieneLogo && <button type="button" className="administration-secondary" disabled={busy}
            onClick={() => { deleteMutation.reset(); setConfirmRestore(true); }}><Trash2 aria-hidden="true" />Restaurar logo original</button>}
        </div>
        {uploadMutation.isPending && <p role="status">Subiendo logo…</p>}
        {uploadMutation.error && <p role="alert" className="administration-field-error">{getApiErrorMessage(uploadMutation.error, 'No se pudo subir el logo.')}</p>}
        {settingsQuery.data?.logo.tieneLogo && settingsQuery.data.logo.updatedAt && <small><RefreshCcw aria-hidden="true" />Actualizado el {formatDateTime(settingsQuery.data.logo.updatedAt)}</small>}
        {dirty && <p className="administration-logo-note">Los cambios de identidad pendientes se conservarán al actualizar el logo.</p>}
      </div></div>
    </section>
    {confirmRestore && <FormDialog id="restore-logo-title" title="Restaurar logo original" code="Identidad visual" context="Logo de la empresa"
      submitLabel="Restaurar logo" dirty={false} pending={deleteMutation.isPending} headerVariant="plain"
      className="administration-form administration-confirm" statusText="Confirmación de identidad visual"
      onClose={() => setConfirmRestore(false)} onSubmit={(event) => { event.preventDefault(); removeLogo(); }}>
      <p>Se volverá a utilizar el logo original de UNITHOR en el sistema y en los documentos.</p>
      {deleteMutation.error && <p role="alert" className="administration-alert">{getApiErrorMessage(deleteMutation.error)}</p>}
    </FormDialog>}
  </div>;
};

export default SettingsPage;
