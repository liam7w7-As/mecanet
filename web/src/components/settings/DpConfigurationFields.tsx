import { ArrowDown, ArrowUp, Plus } from 'lucide-react';

import { DP_FORMULA_LABELS, DP_SCOPE_LABELS, nextDpId } from './dp-configuration-ui';
import { formatClp } from '../../lib/formatters';

import type { DpConfiguration, DP_PRICE_FORMULAS } from '@unithor/shared';
import type { ReactNode } from 'react';

export interface DpEditorProps {
  configuration: DpConfiguration;
  edit: (update: (configuration: DpConfiguration) => void) => void;
  disabled: boolean;
}

export const DpField = ({ label, children }: { label: string; children: ReactNode }) =>
  <label className="dp-field"><span>{label}</span>{children}</label>;

export function DpNumberField({ label, value, onChange, nullable = false, min = 0, step = '0.01' }: {
  label: string; value: number | null; onChange: (value: number | null) => void; nullable?: boolean; min?: number; step?: string;
}) {
  return <DpField label={label}><input type="number" inputMode="decimal" min={min} step={step}
    value={value !== null && Number.isFinite(value) ? value : ''} placeholder={nullable ? 'Pendiente' : 'Requerido'}
    onChange={(event) => onChange(event.target.value === '' ? nullable ? null : Number.NaN : Number(event.target.value))} />
  </DpField>;
}

export const DpActiveField = ({ active, onChange, label }: { active: boolean; onChange: (value: boolean) => void; label: string }) =>
  <label className="dp-toggle"><input type="checkbox" checked={active} onChange={(event) => onChange(event.target.checked)} aria-label={label} /><span>{active ? 'Activo' : 'Inactivo'}</span></label>;

export function DpPricesEditor({ configuration: config, edit, disabled }: DpEditorProps) {
  return <fieldset disabled={disabled} className="dp-editor-fields">
    <div className="dp-section-title"><div><h3>Tablas de precios netos</h3><p>Los importes pendientes permanecen sin tarifa. El IVA se agrega al calcular.</p></div>
      <button type="button" className="dp-secondary" onClick={() => edit((c) => c.tables.push({ id: nextDpId('tabla', c.tables), label: '', formula: 'fixed', basePrice: null, active: true }))}><Plus aria-hidden="true" />Nueva tabla</button>
    </div>
    <div className="dp-editor-list">{config.tables.map((table, index) => <article className="dp-editor-row" key={table.id}>
      <DpField label="Nombre de tabla"><input value={table.label} onChange={(e) => edit((c) => { c.tables[index].label = e.target.value; })} /></DpField>
      <DpField label={`Fórmula de ${table.label || 'tabla nueva'}`}><select value={table.formula} onChange={(e) => edit((c) => { c.tables[index].formula = e.target.value as typeof DP_PRICE_FORMULAS[number]; })}>
        {Object.entries(DP_FORMULA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></DpField>
      <DpNumberField label={`Precio base de ${table.label || 'tabla nueva'}`} value={table.basePrice} nullable onChange={(value) => edit((c) => { c.tables[index].basePrice = value; })} />
      <DpActiveField label={`Activar tabla ${table.label}`} active={table.active} onChange={(value) => edit((c) => { c.tables[index].active = value; })} />
      <small>{table.basePrice === null ? 'Tarifa pendiente' : `${formatClp(table.basePrice, 2)} netos`}</small>
    </article>)}</div>
    <div className="dp-section-title"><div><h3>Operaciones, adicionales y servicios globales</h3><p>Una operación utiliza una tabla y su multiplicador. Un multiplicador vacío indica que falta definir la tarifa.</p></div>
      <button type="button" className="dp-secondary" onClick={() => edit((c) => c.operations.push({ id: nextDpId('operacion', c.operations), label: '', scope: 'piece', tableId: c.tables[0].id, multiplier: null, active: true, requiresDamage: false }))}><Plus aria-hidden="true" />Nuevo servicio</button>
    </div>
    <div className="dp-editor-list">{config.operations.map((operation, index) => <article className="dp-editor-row dp-operation-row" key={operation.id}>
      <DpField label="Nombre del servicio"><input value={operation.label} onChange={(e) => edit((c) => { c.operations[index].label = e.target.value; })} /></DpField>
      <DpField label={`Alcance de ${operation.label || 'servicio nuevo'}`}><select value={operation.scope} onChange={(e) => edit((c) => { c.operations[index].scope = e.target.value as typeof operation.scope; })}>
        {Object.entries(DP_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></DpField>
      <DpField label={`Tabla de ${operation.label || 'servicio nuevo'}`}><select value={operation.tableId} onChange={(e) => edit((c) => { c.operations[index].tableId = e.target.value; })}>
        {config.tables.map((table) => <option key={table.id} value={table.id}>{table.label || 'Tabla sin nombre'}{!table.active ? ' (inactiva)' : ''}</option>)}
      </select></DpField>
      <DpNumberField label={`Multiplicador de ${operation.label || 'servicio nuevo'}`} value={operation.multiplier} nullable min={0.0001} step="any" onChange={(value) => edit((c) => { c.operations[index].multiplier = value; })} />
      <label className="dp-toggle"><input type="checkbox" checked={operation.requiresDamage} onChange={(e) => edit((c) => { c.operations[index].requiresDamage = e.target.checked; })} />Requiere nivel de daño</label>
      <DpActiveField label={`Activar servicio ${operation.label}`} active={operation.active} onChange={(value) => edit((c) => { c.operations[index].active = value; })} />
    </article>)}</div>
  </fieldset>;
}

export function DpVehiclesEditor({ configuration: config, edit, disabled, onCancel, cancelDisabled }: DpEditorProps & {
  onCancel: () => void;
  cancelDisabled: boolean;
}) {
  return <fieldset disabled={disabled} className="dp-editor-fields">
    <div className="dp-section-title"><h3>Carrocerías y tamaños</h3>
      <div className="dp-section-actions">
        <button type="button" className="dp-secondary" disabled={cancelDisabled} onClick={onCancel}>Cancelar</button>
        <button type="button" className="dp-secondary" onClick={() => edit((c) => c.bodyTypes.push({ id: nextDpId('carroceria', c.bodyTypes), label: '', active: true, sizes: [{ id: 'm', label: 'M', factor: 1, active: true }] }))}><Plus aria-hidden="true" />Nueva carrocería</button>
      </div>
    </div>
    <div className="dp-vehicle-grid">{config.bodyTypes.map((body, index) => <article className="dp-vehicle-card" aria-label={body.label || 'Nueva carrocería'} key={body.id}>
      <header className="dp-vehicle-heading"><DpField label="Nombre de carrocería"><input maxLength={180} placeholder="Carrocería" value={body.label} onChange={(e) => edit((c) => { c.bodyTypes[index].label = e.target.value; })} /></DpField>
        <DpActiveField label={`Activar carrocería ${body.label}`} active={body.active} onChange={(value) => edit((c) => { c.bodyTypes[index].active = value; })} />
      </header>
      <table className="dp-table dp-size-table"><caption className="sr-only">Tamaños de {body.label || 'nueva carrocería'}</caption>
        <thead><tr><th scope="col">Tamaño</th><th scope="col">Factor</th><th scope="col">Estado</th></tr></thead>
        <tbody>{body.sizes.map((size, sizeIndex) => <tr key={size.id}>
          <td><DpField label={`Tamaño de ${body.label}`}><input maxLength={180} placeholder="M" value={size.label} onChange={(e) => edit((c) => { c.bodyTypes[index].sizes[sizeIndex].label = e.target.value; })} /></DpField></td>
          <td><DpNumberField label={`Factor ${body.label} ${size.label}`} value={size.factor} min={0.0001} step="any" onChange={(value) => edit((c) => { c.bodyTypes[index].sizes[sizeIndex].factor = value ?? Number.NaN; })} /></td>
          <td><DpActiveField label={`Activar tamaño ${body.label} ${size.label}`} active={size.active} onChange={(value) => edit((c) => { c.bodyTypes[index].sizes[sizeIndex].active = value; })} /></td>
        </tr>)}</tbody>
      </table>
      <footer><button type="button" className="dp-secondary" onClick={() => edit((c) => c.bodyTypes[index].sizes.push({ id: nextDpId('tamano', body.sizes), label: '', factor: 1, active: true }))}><Plus aria-hidden="true" />Agregar tamaño</button></footer>
    </article>)}</div>
  </fieldset>;
}

export function DpDamageEditor({ configuration: config, edit, disabled }: DpEditorProps) {
  return <fieldset disabled={disabled} className="dp-editor-fields">
    <div className="dp-section-title"><div><h3>Niveles de daño</h3><p>El incremento se suma al factor de tamaño en la reparación. No modifica el factor de pintura.</p></div>
      <button type="button" className="dp-secondary" onClick={() => edit((c) => c.damageLevels.push({ id: nextDpId('dano', c.damageLevels), label: '', increment: 0, active: true }))}><Plus aria-hidden="true" />Nuevo nivel</button>
    </div>
    {config.damageLevels.map((level, index) => <article className="dp-editor-row" key={level.id}>
      <DpField label="Nombre del nivel"><input value={level.label} onChange={(e) => edit((c) => { c.damageLevels[index].label = e.target.value; })} /></DpField>
      <DpNumberField label={`Incremento de ${level.label}`} value={level.increment} step="any" onChange={(value) => edit((c) => { c.damageLevels[index].increment = value ?? Number.NaN; })} />
      <DpActiveField label={`Activar nivel ${level.label}`} active={level.active} onChange={(value) => edit((c) => { c.damageLevels[index].active = value; })} />
    </article>)}
  </fieldset>;
}

export function DpStagesEditor({ configuration: config, edit, disabled }: DpEditorProps) {
  return <fieldset disabled={disabled} className="dp-editor-fields">
    <div className="dp-section-title"><div><h3>Cinco pasos obligatorios</h3><p>Edita el orden, nombre y especialidades de los cinco pasos. No se pueden omitir. Separa las especialidades con coma.</p></div></div>
    {config.stages.map((stage, index) => <article className="dp-editor-row" key={stage.key}>
      <strong className="dp-step-number">{index + 1}</strong>
      <DpField label={`Nombre del paso ${index + 1}`}><input value={stage.label} onChange={(e) => edit((c) => { c.stages[index].label = e.target.value; })} /></DpField>
      <DpField label={`Especialidades del paso ${index + 1}`}><input value={stage.specialties.join(',')} onChange={(e) => edit((c) => { c.stages[index].specialties = e.target.value.split(','); })} /></DpField>
      <div className="dp-inline-fields">
        <button type="button" className="dp-secondary" disabled={index === 0} aria-label={`Subir ${stage.label}`} onClick={() => edit((c) => { [c.stages[index - 1], c.stages[index]] = [c.stages[index], c.stages[index - 1]]; })}><ArrowUp aria-hidden="true" /></button>
        <button type="button" className="dp-secondary" disabled={index === config.stages.length - 1} aria-label={`Bajar ${stage.label}`} onClick={() => edit((c) => { [c.stages[index + 1], c.stages[index]] = [c.stages[index], c.stages[index + 1]]; })}><ArrowDown aria-hidden="true" /></button>
      </div>
      <small>La plantilla se reserva para trabajos nuevos; las etapas históricas se conservan.</small>
    </article>)}
  </fieldset>;
}
