import { FileInput } from 'lucide-react';
import { useState } from 'react';

import { useClient } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useVehicle } from '../../hooks/useVehicles';
import { useWorkOrder, useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import FormDialog from '../common/FormDialog';

import type { Client, Vehicle, WorkOrder } from '../../types/entities';

export interface WorkOrderPrefillData {
  order: WorkOrder;
  client: Client;
  contact: Client;
  billing: Client;
  vehicle: Vehicle;
}

interface Props {
  onClose: () => void;
  onConfirm: (data: WorkOrderPrefillData) => void;
  currentClient?: string;
  currentVehicle?: string;
}

export default function WorkOrderPrefillModal({ onClose, onConfirm, currentClient, currentVehicle }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const term = useDebouncedValue(search.trim(), 300);
  const list = useWorkOrders({ page: 1, pageSize: 20, search: term || undefined }, !confirming);
  const detail = useWorkOrder(selectedId);
  const order = detail.data;
  const client = useClient(order?.clientId ?? null);
  const contact = useClient(order?.contactClientId ?? order?.clientId ?? null);
  const billing = useClient(order?.billingClientId ?? order?.clientId ?? null);
  const vehicle = useVehicle(order?.vehicleId ?? null);
  const ready = Boolean(order && client.data && contact.data && billing.data && vehicle.data);
  const error = detail.error ?? client.error ?? contact.error ?? billing.error ?? vehicle.error;
  return <FormDialog id="order-prefill-title" title={confirming ? 'Confirmar carga de datos' : 'Cargar desde una OT'}
    code="Nueva orden de trabajo" context={confirming ? order?.codigo : 'Buscar orden anterior'}
    headerVariant="brand" headerIcon={<FileInput aria-hidden="true" />} className="order-prefill-dialog"
    dirty={false} pending={false} submitLabel={confirming ? 'Confirmar y cargar datos' : 'Revisar datos'}
    submitDisabled={!ready} onClose={onClose} statusText="No se copian trabajos, pagos, estados, fechas ni fotos."
    onSubmit={(event) => {
      event.preventDefault();
      if (!ready || !order || !client.data || !contact.data || !billing.data || !vehicle.data) return;
      if (!confirming) { setConfirming(true); return; }
      onConfirm({ order, client: client.data, contact: contact.data, billing: billing.data, vehicle: vehicle.data });
    }}>
    {!confirming ? <>
      <label className="service-field"><span>Buscar OT, cliente o patente</span><input type="search" value={search} onChange={(event) => {
        setSearch(event.target.value); setSelectedId(0);
      }} placeholder="OT-26-6, cliente, patente…" /></label>
      <div className="order-prefill-list" aria-label="Órdenes para cargar datos" aria-busy={list.isFetching}>
        {list.isPending ? <p role="status">Cargando órdenes…</p> : list.isError ? <p role="alert">{getApiErrorMessage(list.error)}
          <button type="button" onClick={() => void list.refetch()}>Reintentar</button></p> :
          list.data?.items.map((entry) => <button type="button" key={entry.id} aria-pressed={selectedId === entry.id}
            onClick={() => setSelectedId(entry.id)}>
            <span><strong>{entry.codigo}</strong><small>{entry.client?.nombre ?? 'Sin cliente'}</small></span>
            <span>{entry.vehicle?.patente ?? 'Sin vehículo'}</span>
          </button>)}
        {list.data?.items.length === 0 && <p>No se encontraron órdenes.</p>}
      </div>
      {selectedId > 0 && !ready && !error && <p role="status" className="mt-3">
        {order && (!order.clientId || !order.vehicleId) ? 'Esta OT no tiene cliente y vehículo disponibles para cargar.' : 'Consultando cliente y vehículo…'}
      </p>}
    </> : <>
      <p className="mb-3 text-sm">Se reemplazarán los datos de identificación de esta nueva orden:</p>
      <dl className="order-prefill-preview">
        <div><dt>Responsable</dt><dd>{currentClient || 'Sin seleccionar'} → <strong>{client.data?.nombre}</strong></dd></div>
        <div><dt>Contacto</dt><dd>{contact.data?.nombre}</dd></div>
        <div><dt>Facturación</dt><dd>{order?.billing?.nombre ?? billing.data?.nombre}</dd></div>
        <div><dt>Vehículo</dt><dd>{currentVehicle || 'Sin seleccionar'} → <strong>{vehicle.data?.patente}</strong> · {vehicle.data?.marca} {vehicle.data?.modelo}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-brand-muted">Los trabajos, descuentos y datos de recepción actuales se conservan. Si cambia el vehículo, revisa las tarifas D&P, la inspección y las fotos antes de crear la orden.</p>
      <button type="button" className="mt-3 text-sm underline" onClick={() => setConfirming(false)}>Elegir otra OT</button>
    </>}
    {error && <p role="alert" className="service-error">{getApiErrorMessage(error)}</p>}
  </FormDialog>;
}
