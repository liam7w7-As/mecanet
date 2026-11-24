import { Car } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDpConfiguration } from '../../hooks/useDpConfiguration';
import { useUpdateVehicleMutation, useVehicle } from '../../hooks/useVehicles';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import FormDialog from '../common/FormDialog';

import type { Vehicle } from '../../types/entities';

interface Props {
  vehicleId: number;
  onReady: (vehicle: Vehicle) => void;
  onClose: () => void;
}

/** A candidate is not selected until its classification has been checked/saved. */
export default function VehicleDpDetailsModal({ vehicleId, onReady, onClose }: Props) {
  const vehicle = useVehicle(vehicleId);
  const query = useDpConfiguration('catalog');
  const save = useUpdateVehicleMutation();
  const actor = useAuthStore((state) => state.user);
  const canEdit = Boolean(actor && (hasUserPermission(actor, 'taller', 'update') || hasUserPermission(actor, 'comercial', 'update')));
  const [bodyId, setBodyId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const initialized = useRef(false);
  const delivered = useRef(false);
  const bodies = query.data?.configuration.bodyTypes.filter((entry) => entry.active) ?? [];
  const body = bodies.find((entry) => entry.id === bodyId);
  const sizes = body?.sizes.filter((entry) => entry.active) ?? [];
  useEffect(() => {
    if (!vehicle.data || !query.data || initialized.current) return;
    initialized.current = true;
    const storedBody = query.data.configuration.bodyTypes.find((entry) => entry.id === vehicle.data.dpBodyTypeId && entry.active);
    if (storedBody?.sizes.some((entry) => entry.id === vehicle.data.dpSizeId && entry.active)) {
      delivered.current = true;
      onReady(vehicle.data);
    } else {
      setBodyId(storedBody?.id ?? '');
    }
  }, [vehicle.data, query.data, onReady]);
  const error = vehicle.error ?? query.error ?? save.error;
  const loading = vehicle.isPending || query.isPending;
  return <FormDialog id="vehicle-dp-title" title="Completar datos del vehículo"
    code={vehicle.data?.patente ?? 'Vehículo'} context="Carrocería y tamaño obligatorios"
    headerVariant="brand" headerIcon={<Car aria-hidden="true" />} className="vehicle-dp-dialog"
    submitLabel="Guardar y seleccionar" pending={save.isPending} dirty={Boolean(bodyId || sizeId)}
    submitDisabled={loading || !canEdit || !body || !sizes.some((entry) => entry.id === sizeId)}
    statusText="Estos datos se guardan en la ficha del vehículo." onClose={onClose}
    onSubmit={(event) => {
      event.preventDefault();
      if (delivered.current || save.isPending || !canEdit) return;
      delivered.current = true;
      void save.mutateAsync({ id: vehicleId, data: { dpBodyTypeId: bodyId, dpSizeId: sizeId } })
        .then(onReady).catch(() => { delivered.current = false; });
    }}>
    {loading ? <p role="status">Consultando datos del vehículo…</p> : <>
      <p>Antes de seleccionar este vehículo, completa su clasificación para mostrar las piezas y tarifas correctas.</p>
      <div className="dp-service-operation-grid mt-4">
        <label className="service-field"><span>Carrocería</span><select value={bodyId} disabled={!canEdit} onChange={(event) => { setBodyId(event.target.value); setSizeId(''); }}>
          <option value="">Seleccionar carrocería</option>
          {bodies.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
        </select></label>
        <label className="service-field"><span>Tamaño del vehículo</span><select value={sizeId} disabled={!body || !canEdit} onChange={(event) => setSizeId(event.target.value)}>
          <option value="">Seleccionar tamaño</option>
          {sizes.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
        </select></label>
      </div>
      {!canEdit && <p role="alert" className="service-error">Necesitas permiso para actualizar vehículos. Solicita que completen estos datos antes de continuar.</p>}
    </>}
    {error && <div role="alert" className="service-error">{getApiErrorMessage(error)}
      {(vehicle.isError || query.isError) && <button type="button" onClick={() => { void vehicle.refetch(); void query.refetch(); }}>Reintentar</button>}
    </div>}
  </FormDialog>;
}
