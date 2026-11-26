import { Building2, ChevronDown, RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';

import { CHILE_REGIONS } from '../../data/chile-locations';
import { findChileRegion, findCommuneRegion, regionOptions } from '../../lib/chile-locations';
import RutInput from '../common/RutInput';
import SearchableSelect from '../common/SearchableSelect';

import type { WorkOrderRecovery } from '../../lib/form-recovery.schemas';
import type { ReactNode } from 'react';

type BillingDetails = NonNullable<WorkOrderRecovery['billingDetails']>;

export default function ReceptionBillingFields({
  value,
  errors,
  edited,
  onChange,
  onChangeClient,
  onReset,
}: {
  value: BillingDetails;
  errors: Record<string, string>;
  edited: boolean;
  onChange: (value: BillingDetails) => void;
  onChangeClient: () => void;
  onReset: () => void;
}) {
  const id = useId();
  const [detailsOpen, setDetailsOpen] = useState(edited);
  const hasDetailErrors = ['email', 'telefono', 'direccion', 'region', 'comuna'].some((key) =>
    Boolean(errors[`billing.${key}`]),
  );
  const detailsSummary = [value.email, value.telefono, value.direccion, value.comuna]
    .filter(Boolean)
    .join(' · ');
  const region = findChileRegion(value.region ?? '');
  const communes = (region ? [region] : CHILE_REGIONS).flatMap((item) =>
    item.communes.map((commune) => ({ value: commune, label: commune, description: item.name })),
  );
  const field = (key: keyof BillingDetails, label: string, input: ReactNode, wide = false) => (
    <div
      className={
        wide ? 'reception-billing-field reception-billing-wide' : 'reception-billing-field'
      }
    >
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
      {errors[`billing.${key}`] && (
        <p id={`${id}-${key}-error`} role="alert">
          {errors[`billing.${key}`]}
        </p>
      )}
    </div>
  );
  const inputProps = (key: keyof BillingDetails) => ({
    id: `${id}-${key}`,
    'aria-invalid': Boolean(errors[`billing.${key}`]),
    'aria-describedby': errors[`billing.${key}`] ? `${id}-${key}-error` : undefined,
  });
  return (
    <section className="reception-billing-editor" aria-labelledby={`${id}-title`}>
      <header>
        <Building2 aria-hidden="true" />
        <div>
          <h3 id={`${id}-title`}>Datos de facturación</h3>
        </div>
        <button type="button" aria-label="Cambiar datos de facturación" onClick={onChangeClient}>
          Cambiar cliente
        </button>
      </header>
      <div className="reception-billing-fields">
        {field(
          'nombre',
          'Nombre o razón social',
          <input
            {...inputProps('nombre')}
            value={value.nombre}
            maxLength={180}
            onChange={(event) => onChange({ ...value, nombre: event.target.value })}
          />,
          true,
        )}
        {field(
          'rut',
          'RUN/RUT de facturación',
          <RutInput
            {...inputProps('rut')}
            value={value.rut ?? ''}
            onChange={(rut) => onChange({ ...value, rut })}
          />,
        )}
        {field(
          'tipo',
          'Tipo de facturación',
          <select
            {...inputProps('tipo')}
            value={value.tipo}
            onChange={(event) =>
              onChange({ ...value, tipo: event.target.value as BillingDetails['tipo'] })
            }
          >
            <option value="cliente">Persona natural</option>
            <option value="empresa">Empresa</option>
          </select>,
        )}
      </div>
      <details
        className="reception-billing-details"
        open={detailsOpen || hasDetailErrors}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Contacto y dirección de facturación</strong>
            <small>{detailsSummary || 'Correo, teléfono y dirección (opcional)'}</small>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="reception-billing-fields">
          {field(
            'email',
            'Correo de facturación',
            <input
              {...inputProps('email')}
              type="email"
              value={value.email ?? ''}
              maxLength={180}
              onChange={(event) => onChange({ ...value, email: event.target.value })}
            />,
          )}
          {field(
            'telefono',
            'Teléfono de facturación',
            <input
              {...inputProps('telefono')}
              type="tel"
              value={value.telefono ?? ''}
              maxLength={30}
              onChange={(event) => onChange({ ...value, telefono: event.target.value })}
            />,
          )}
          {field(
            'direccion',
            'Dirección de facturación',
            <input
              {...inputProps('direccion')}
              value={value.direccion ?? ''}
              maxLength={255}
              onChange={(event) => onChange({ ...value, direccion: event.target.value })}
            />,
            true,
          )}
          {field(
            'region',
            'Región de facturación',
            <SearchableSelect
              {...inputProps('region')}
              value={value.region ?? ''}
              options={regionOptions}
              listLabel="Regiones de facturación"
              clearLabel="Limpiar región de facturación"
              onChange={(next) => {
                const nextRegion = findChileRegion(next);
                onChange({
                  ...value,
                  region: next,
                  comuna: nextRegion?.communes.includes(value.comuna ?? '') ? value.comuna : null,
                });
              }}
            />,
          )}
          {field(
            'comuna',
            'Comuna de facturación',
            <SearchableSelect
              {...inputProps('comuna')}
              value={value.comuna ?? ''}
              options={communes}
              listLabel="Comunas de facturación"
              clearLabel="Limpiar comuna de facturación"
              onChange={(comuna) =>
                onChange({
                  ...value,
                  comuna,
                  region: findCommuneRegion(comuna)?.name ?? value.region,
                })
              }
            />,
          )}
        </div>
      </details>
      <footer>
        <p>Los cambios se guardan solo en esta orden.</p>
        {edited && (
          <button type="button" onClick={onReset}>
            <RotateCcw aria-hidden="true" />
            Restablecer datos del cliente
          </button>
        )}
      </footer>
    </section>
  );
}
