import { PAYMENT_METHODS } from '@unithor/shared';
import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useExpressFleet } from '../../hooks/usePurchasesExpress';
import { PAYMENT_METHOD_LABELS } from '../../lib/purchase-labels';
import CurrencyInput from '../common/CurrencyInput';

import type { ExpressFleetOption, ExpressRecovery } from '../../lib/purchase-express-recovery';
import type { PaymentMethod } from '@unithor/shared';

function FleetPicker({
  selection,
  pick,
  invalid,
}: {
  selection: ExpressFleetOption | null;
  pick: (next: ExpressFleetOption | null) => void;
  invalid: boolean;
}) {
  const [search, setSearch] = useState('');
  const query = useExpressFleet(useDebouncedValue(search.trim(), 250));
  return (
    <section>
      <label htmlFor="express-fleet-search">Vehículo de Flota</label>
      {selection ? (
        <div className="express-selected-order">
          <div>
            <strong>{selection.patente}</strong>
            <span>{[selection.marca, selection.modelo].filter(Boolean).join(' ')}</span>
          </div>
          <button type="button" className="express-secondary" onClick={() => pick(null)}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="express-order-picker">
          <div className="express-search">
            <Search aria-hidden="true" />
            <input
              id="express-fleet-search"
              type="search"
              placeholder="Buscar patente, marca o modelo"
              aria-invalid={invalid}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="express-order-results" aria-label="Vehículos de Flota" role="region">
            {query.isPending ? (
              <p role="status">Buscando vehículos…</p>
            ) : query.isError ? (
              <p role="alert">
                No se pudo cargar Flota.{' '}
                <button type="button" onClick={() => void query.refetch()}>
                  Reintentar
                </button>
              </p>
            ) : !query.data?.length ? (
              <p>Sin resultados</p>
            ) : (
              query.data.map((vehicle) => (
                <button type="button" key={vehicle.id} onClick={() => pick(vehicle)}>
                  <strong>{vehicle.patente}</strong>
                  <span>{[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ')}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ExpressInternalPurchaseFields({
  draft,
  update,
  errors,
}: {
  draft: ExpressRecovery;
  update: <K extends keyof ExpressRecovery>(key: K, value: ExpressRecovery[K]) => void;
  errors: Record<string, string>;
}) {
  const fieldError = (field: string) =>
    errors[field] && (
      <p role="alert" className="express-field-error">
        {errors[field]}
      </p>
    );
  return (
    <>
      {draft.destino === 'flota' && (
        <>
          <FleetPicker
            selection={draft.fleet}
            pick={(next) => update('fleet', next)}
            invalid={Boolean(errors.fleetVehicleId)}
          />
          {fieldError('fleetVehicleId')}
        </>
      )}
      <div className="express-expense-fields">
        <div className="express-expense-concept">
          <label htmlFor="express-expense-concept">Concepto</label>
          <input
            id="express-expense-concept"
            aria-invalid={Boolean(errors.concepto)}
            value={draft.concept}
            maxLength={255}
            onChange={(event) => update('concept', event.target.value)}
          />
          {fieldError('concepto')}
        </div>
        <div>
          <label htmlFor="express-expense-total">Monto</label>
          <CurrencyInput
            id="express-expense-total"
            aria-invalid={Boolean(errors.monto)}
            allowDecimals
            value={draft.amount}
            onChange={(value) => update('amount', value)}
          />
          {fieldError('monto')}
        </div>
        <div>
          <label htmlFor="express-expense-payment">Medio de pago</label>
          <select
            id="express-expense-payment"
            value={draft.metodoPago}
            onChange={(event) => update('metodoPago', event.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="express-expense-date">Fecha</label>
          <input
            id="express-expense-date"
            type="date"
            value={draft.fechaEmision}
            aria-invalid={Boolean(errors.fechaEmision)}
            onChange={(event) => update('fechaEmision', event.target.value)}
          />
          {fieldError('fechaEmision')}
        </div>
      </div>
      <details className="express-extra-fields" open={errors.proveedorNombre || errors.folio ? true : undefined}>
        <summary>
          <span>{[draft.proveedorNombre, draft.folio ? `Folio ${draft.folio}` : ''].filter(Boolean).join(' · ') || 'Proveedor y folio'}</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          <label htmlFor="express-expense-supplier">Proveedor</label>
          <input id="express-expense-supplier" maxLength={180} value={draft.proveedorNombre}
            aria-invalid={Boolean(errors.proveedorNombre)} onChange={(event) => update('proveedorNombre', event.target.value)} />
          {fieldError('proveedorNombre')}
          <label htmlFor="express-expense-folio">Folio</label>
          <input id="express-expense-folio" maxLength={50} value={draft.folio}
            aria-invalid={Boolean(errors.folio)} onChange={(event) => update('folio', event.target.value)} />
          {fieldError('folio')}
        </div>
      </details>
    </>
  );
}
