import { AlertCircle, Car, LoaderCircle, Mail, MapPin, Pencil, Phone, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimateIcon } from '../animate-ui';
import { useClient, useDeleteClientMutation } from '../../hooks/useClients';
import { getApiErrorMessage } from '../../lib/api-error';

import type { Client } from '../../types/entities';

interface ClientDetailModalProps {
  clientId: number;
  canDelete: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
}

export const ClientDetailModal = ({
  clientId,
  canDelete,
  canEdit,
  onClose,
  onEdit,
}: ClientDetailModalProps) => {
  const clientQuery = useClient(clientId, true);
  const deleteMutation = useDeleteClientMutation();
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);

  const handleDelete = (): void => {
    deleteMutation.mutate(clientId, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar detalle" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-detail-title"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Ficha del cliente</p>
            <h2 id="client-detail-title" className="mt-0.5 text-xl font-semibold text-brand-blue">
              {clientQuery.data?.nombre ?? 'Cargando cliente...'}
            </h2>
          </div>
          <button type="button" className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <AnimateIcon icon={X} animation="spin" size={18} />
          </button>
        </header>

        {clientQuery.isPending && (
          <div className="flex min-h-72 items-center justify-center text-brand-blue" role="status">
            <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
            <span className="sr-only">Cargando cliente</span>
          </div>
        )}

        {clientQuery.isError && (
          <div className="m-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(clientQuery.error, 'No fue posible cargar el cliente')}
          </div>
        )}

        {clientQuery.data && (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-1 text-xs font-semibold ${clientQuery.data.tipo === 'empresa' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                {clientQuery.data.tipo === 'empresa' ? 'Empresa' : 'Persona natural'}
              </span>
              <span className="text-sm font-medium text-slate-600">{clientQuery.data.rut ?? 'Sin identificación'}</span>
            </div>

            <dl className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="flex items-center gap-2 text-slate-500"><Phone className="h-4 w-4" aria-hidden="true" />Teléfono</dt>
                <dd className="font-medium text-slate-800">{clientQuery.data.telefono ?? 'No registrado'}</dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="flex items-center gap-2 text-slate-500"><Mail className="h-4 w-4" aria-hidden="true" />Correo</dt>
                <dd className="break-all font-medium text-slate-800">{clientQuery.data.email ?? 'No registrado'}</dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="flex items-center gap-2 text-slate-500"><MapPin className="h-4 w-4" aria-hidden="true" />Dirección</dt>
                <dd className="font-medium text-slate-800">
                  {[clientQuery.data.direccion, clientQuery.data.comuna, clientQuery.data.region].filter(Boolean).join(', ') || 'No registrada'}
                </dd>
              </div>
            </dl>

            <section aria-labelledby="client-vehicles-title">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="client-vehicles-title" className="flex items-center gap-2 font-semibold text-brand-blue">
                  <Car className="h-5 w-5" aria-hidden="true" /> Vehículos asociados
                </h3>
                <span className="text-sm text-slate-500">{clientQuery.data.vehicles?.length ?? 0}</span>
              </div>
              {clientQuery.data.vehicles?.length ? (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {clientQuery.data.vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-brand-blue">{vehicle.patente}</p>
                        <p className="truncate text-sm text-slate-500">
                          {[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') || 'Sin detalles'}
                        </p>
                      </div>
                      <Link
                        to={`/vehicles?search=${encodeURIComponent(vehicle.patente)}`}
                        className="shrink-0 text-sm font-semibold text-brand-blue hover:underline"
                        onClick={onClose}
                      >
                        Abrir vehículo
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-y border-slate-100 py-6 text-center text-sm text-slate-500">Sin vehículos asociados</p>
              )}
            </section>

            {clientQuery.data.notas && (
              <section>
                <h3 className="text-sm font-semibold text-brand-blue">Notas</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{clientQuery.data.notas}</p>
              </section>
            )}

            {deleteMutation.isError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {getApiErrorMessage(deleteMutation.error)}
              </div>
            )}

            <footer className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
              {canDelete ? (
                <button
                  type="button"
                  className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <AnimateIcon icon={Trash2} animation="bounce" size={16} /> Eliminar cliente
                </button>
              ) : <span />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" onClick={onClose}>Cerrar</button>
                {canEdit && (
                  <button
                    type="button"
                    className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-all hover:bg-brand-dark active:scale-95"
                    onClick={() => onEdit(clientQuery.data!)}
                  >
                    <AnimateIcon icon={Pencil} animation="wiggle" size={16} /> Editar
                  </button>
                )}
              </div>
            </footer>

            {canDelete && isConfirmingDelete && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Confirmar eliminación</p>
                <p className="mt-1">El registro se ocultará de los listados y conservará su historial.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="h-9 rounded-lg border border-red-200 bg-white px-3 font-semibold text-red-700" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                  <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-700 px-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60" onClick={handleDelete} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />} Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.section>
    </div>
  );
};

export default ClientDetailModal;
