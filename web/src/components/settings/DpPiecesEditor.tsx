import { Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { nextDpId } from './dp-configuration-ui';
import { DpActiveField, DpField, DpNumberField } from './DpConfigurationFields';

import type { DpEditorProps } from './DpConfigurationFields';

export default function DpPiecesEditor({ configuration: config, edit, disabled }: DpEditorProps) {
  const [bodyId, setBodyId] = useState(config.bodyTypes[0]?.id ?? '');
  const [pieceId, setPieceId] = useState('');
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('es');
  const rows = config.rates.map((rate, index) => ({ rate, index })).filter(({ rate }) =>
    rate.bodyTypeId === bodyId && (!pieceId || rate.pieceId === pieceId) &&
    (!term || `${config.pieces.find((piece) => piece.id === rate.pieceId)?.label} ${rate.positionLabel}`.toLocaleLowerCase('es').includes(term)),
  );
  const addRate = () => edit((c) => c.rates.push({
    bodyTypeId: bodyId, pieceId: pieceId || c.pieces[0].id,
    positionId: nextDpId('ubicacion', c.rates.filter((rate) => rate.bodyTypeId === bodyId && rate.pieceId === (pieceId || c.pieces[0].id)).map((rate) => ({ id: rate.positionId }))),
    positionLabel: '', paintingFactor: 1, repairFactor: 1, dismantlingFactor: 1, active: true,
  }));

  return <fieldset disabled={disabled} className="dp-editor-fields dp-pieces-layout">
    <section className="dp-piece-section" aria-labelledby="dp-pieces-heading">
    <div className="dp-section-title"><h3 id="dp-pieces-heading">Piezas</h3>
      <button type="button" className="dp-secondary" onClick={() => edit((c) => c.pieces.push({ id: nextDpId('pieza', c.pieces), label: '', active: true }))}><Plus aria-hidden="true" />Nueva pieza</button>
    </div>
    <div className="dp-rate-table-wrapper"><table className="dp-table dp-pieces-table"><caption className="sr-only">Piezas disponibles</caption>
      <thead><tr><th scope="col">Pieza</th><th scope="col">Estado</th></tr></thead>
      <tbody>{config.pieces.map((piece, index) => <tr key={piece.id}>
        <td><DpField label="Nombre de pieza"><input maxLength={180} placeholder="Nombre de pieza" value={piece.label} onChange={(e) => edit((c) => { c.pieces[index].label = e.target.value; })} /></DpField></td>
        <td><DpActiveField label={`Activar pieza ${piece.label}`} active={piece.active} onChange={(value) => edit((c) => { c.pieces[index].active = value; })} /></td>
      </tr>)}</tbody>
    </table></div>
    </section>
    <section className="dp-location-section" aria-labelledby="dp-locations-heading">
    <div className="dp-section-title"><h3 id="dp-locations-heading">Ubicaciones y factores</h3></div>
    <div className="dp-filter-grid dp-location-filters">
      <DpField label="Carrocería de las tarifas"><select value={bodyId} onChange={(e) => { setBodyId(e.target.value); setSearch(''); }}>
        {config.bodyTypes.map((body) => <option key={body.id} value={body.id}>{body.label || 'Carrocería sin nombre'}{!body.active ? ' (inactiva)' : ''}</option>)}
      </select></DpField>
      <DpField label="Filtrar por pieza"><select value={pieceId} onChange={(e) => { setPieceId(e.target.value); setSearch(''); }}><option value="">Todas las piezas</option>
        {config.pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.label || 'Pieza sin nombre'}{!piece.active ? ' (inactiva)' : ''}</option>)}
      </select></DpField>
      <DpField label="Buscar ubicación"><span className="dp-search"><Search aria-hidden="true" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pieza o ubicación" /></span></DpField>
      <button type="button" className="dp-secondary" disabled={!bodyId} onClick={() => { setSearch(''); addRate(); }}><Plus aria-hidden="true" />Nueva ubicación</button>
    </div>
    <div className="dp-rate-table-wrapper"><table className="dp-table dp-rate-table"><caption className="sr-only">Factores por pieza y ubicación</caption>
      <thead><tr><th scope="col">Pieza</th><th scope="col">Ubicación</th><th scope="col">Pintura</th><th scope="col">Reparación</th><th scope="col">Desmontaje / montaje</th><th scope="col">Estado</th></tr></thead>
      <tbody>{rows.map(({ rate, index }) => {
        const name = `${config.pieces.find((piece) => piece.id === rate.pieceId)?.label ?? ''} ${rate.positionLabel}`;
        return <tr key={`${rate.bodyTypeId}:${rate.pieceId}:${rate.positionId}`}>
          <td><DpField label={`Pieza de ubicación ${index + 1}`}><select value={rate.pieceId} onChange={(e) => edit((c) => { c.rates[index].pieceId = e.target.value; })}>
            {config.pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.label || 'Sin nombre'}</option>)}
          </select></DpField></td>
          <td><DpField label={`Ubicación de ${name}`}><input value={rate.positionLabel} placeholder="Delantera izquierda…" onChange={(e) => edit((c) => { c.rates[index].positionLabel = e.target.value; })} /></DpField></td>
          <td><DpNumberField label={`Pintura de ${name}`} value={rate.paintingFactor} min={0.0001} step="any" onChange={(value) => edit((c) => { c.rates[index].paintingFactor = value ?? Number.NaN; })} /></td>
          <td><DpNumberField label={`Reparación de ${name}`} value={rate.repairFactor} min={0.0001} step="any" onChange={(value) => edit((c) => { c.rates[index].repairFactor = value ?? Number.NaN; })} /></td>
          <td><DpNumberField label={`Desmontaje de ${name}`} value={rate.dismantlingFactor} min={0.0001} step="any" onChange={(value) => edit((c) => { c.rates[index].dismantlingFactor = value ?? Number.NaN; })} /></td>
          <td><DpActiveField label={`Activar ubicación ${name}`} active={rate.active} onChange={(value) => edit((c) => { c.rates[index].active = value; })} /></td>
        </tr>;
      })}</tbody>
    </table></div>
    {rows.length === 0 && <p className="dp-empty">Sin ubicaciones para estos filtros.</p>}
    </section>
  </fieldset>;
}
