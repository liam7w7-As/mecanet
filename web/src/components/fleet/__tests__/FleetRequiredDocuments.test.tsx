import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import FleetVehicleDetail from '../FleetVehicleDetail';

import type { FleetDocument, FleetVehicleDetail as Vehicle } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const document = (id: number, nombre: string, extra: Partial<FleetDocument> = {}): FleetDocument => ({
  id, fleetVehicleId: 3, nombre, referencia: null, notas: null, fechaEmision: null, fechaVencimiento: null,
  archivoNombre: null, mimeType: null, sizeBytes: null, version: 0, tieneArchivo: false, subidoPor: null,
  expiry: { state: 'sin_vencimiento', daysRemaining: null }, createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z', ...extra,
});
let vehicle: Vehicle;
const renderDetail = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
  <MemoryRouter><FleetVehicleDetail vehicleId={3} onClose={vi.fn()} /></MemoryRouter>
</QueryClientProvider>);
const openDocuments = async () => {
  await screen.findByRole('heading', { name: 'ABCD12' });
  fireEvent.click(screen.getByRole('tab', { name: /^Documentos/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 1, nombre: 'Admin prueba', email: 'admin@example.test', role: 'admin' }, isAuthenticated: true, isLoading: false });
  vehicle = { id: 3, patente: 'ABCD12', codigoInterno: null, marca: 'Toyota', modelo: 'Hilux', ano: 2024, color: null,
    vinChasis: null, motor: null, kilometraje: 1000, combustible: null, transmision: null, estadoOperativo: 'disponible',
    sucursal: null, responsable: 'Responsable flota', createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z',
    documentSummary: { total: 0, expired: 0, expiringSoon: 0, nextExpiry: null }, documents: [] };
  vi.mocked(api.get).mockImplementation(async () => ({ data: { fleetVehicle: vehicle } }));
});

describe('Fixed fleet document slots and additional records', () => {
  it('shows the three missing slots without creating records and prefills the chosen document', async () => {
    renderDetail(); await openDocuments();
    const required = within(screen.getByRole('region', { name: 'Documentos obligatorios' }));
    expect(required.getAllByText('Pendiente de registro')).toHaveLength(3);
    expect(required.getByRole('region', { name: 'Permiso de circulación' })).toBeInTheDocument();
    expect(required.getByRole('region', { name: 'Seguro obligatorio SOAP' })).toBeInTheDocument();
    expect(required.getByRole('region', { name: 'Revisión técnica' })).toBeInTheDocument();
    fireEvent.click(required.getByRole('button', { name: 'Registrar Seguro obligatorio SOAP' }));
    const form = within(await screen.findByRole('dialog', { name: 'Agregar documento' }));
    expect(form.getByRole('combobox', { name: 'Nombre del documento' })).toHaveValue('Seguro obligatorio SOAP');
    expect(form.getByLabelText('Fecha de vencimiento', { exact: true })).toBeEnabled();
    expect(form.getByRole('checkbox', { name: 'Fecha de vencimiento pendiente' })).not.toBeChecked();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('reuses existing SOAP aliases and keeps additional documents without expiration separate', async () => {
    const soap = document(11, 'SOAP', { referencia: 'POLIZA-ANTERIOR', tieneArchivo: true, archivoNombre: 'poliza.pdf', mimeType: 'application/pdf', version: 2, fechaVencimiento: '2099-03-31', expiry: { state: 'vigente', daysRemaining: 99 } });
    vehicle.documents = [soap, document(12, 'Padrón del vehículo', { tieneArchivo: true, archivoNombre: 'padron.pdf' })];
    renderDetail(); await openDocuments();
    const required = within(screen.getByRole('region', { name: 'Seguro obligatorio SOAP' }));
    expect(required.getByText('SOAP')).toBeInTheDocument();
    expect(required.getByText(/POLIZA-ANTERIOR/)).toBeInTheDocument();
    expect(required.queryByRole('button', { name: /Registrar/ })).not.toBeInTheDocument();
    expect(required.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/api/fleet-vehicles/3/documents/11/file');
    const extras = within(screen.getByRole('region', { name: 'Documentos adicionales' }));
    expect(extras.getByText('Padrón del vehículo')).toBeInTheDocument();
    expect(extras.getAllByText('Sin vencimiento').length).toBeGreaterThan(0);
    expect(extras.queryByText('SOAP')).not.toBeInTheDocument();
    fireEvent.click(required.getByRole('button', { name: 'Editar' }));
    const form = within(await screen.findByRole('dialog', { name: 'Editar documento' }));
    expect(form.getByRole('combobox', { name: 'Nombre del documento' })).toHaveValue('SOAP');
    expect(form.getByLabelText('Fecha de vencimiento')).toHaveValue('2099-03-31');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps version history and authenticated links available to read-only roles', async () => {
    useAuthStore.setState({ user: { id: 2, nombre: 'Lectura flota', email: 'read@example.test', role: 'vendedor', permissions: [{ modulo: 'flota', accion: 'read' }] } });
    const soap = document(11, 'Seguro obligatorio', { tieneArchivo: true, archivoNombre: 'vigente.pdf', version: 2 });
    vehicle.documents = [soap];
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/fleet-vehicles/3/documents/11/versions'
      ? { current: soap, versions: [{ id: 8, version: 1, archivoNombre: 'anterior.pdf', mimeType: 'application/pdf', sizeBytes: 100, fechaEmision: null, fechaVencimiento: null, referencia: null, notas: null, subidoPor: 1, createdAt: soap.createdAt, esActual: false }] }
      : { fleetVehicle: vehicle } }));
    renderDetail(); await openDocuments();
    expect(screen.queryByRole('button', { name: 'Agregar documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Registrar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Versiones' }));
    expect(await screen.findByText('anterior.pdf')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver' }).some((link) => link.getAttribute('href') === '/api/fleet-vehicles/3/documents/11/file?versionId=8')).toBe(true);
    expect(api.post).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
  });

  it('retains duplicate legacy records instead of hiding one or creating placeholders', async () => {
    vehicle.documents = [document(11, 'SOAP'), document(12, 'Seguro obligatorio')];
    renderDetail(); await openDocuments();
    const required = within(screen.getByRole('region', { name: 'Seguro obligatorio SOAP' }));
    expect(required.getAllByRole('button', { name: 'Editar' })).toHaveLength(2);
    expect(required.getByText('SOAP')).toBeInTheDocument(); expect(required.getByText('Seguro obligatorio')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
  });
});
