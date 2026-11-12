import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { saveFormDraft } from '../../../lib/form-recovery';
import { workOrderRecoverySchema } from '../../../lib/form-recovery.schemas';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderCreatePage from '../WorkOrderCreatePage';

import type { Vehicle } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

vi.mock('../../../components/vehicles/VehicleFormModal', () => ({
  default: ({ onSaved, onClose }: { onSaved: (vehicle: Vehicle) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Nuevo vehículo">
      <button type="button" onClick={() => onSaved(savedVehicle)}>Guardar vehículo de prueba</button>
      <button type="button" onClick={onClose}>Cancelar vehículo</button>
    </div>
  ),
}));

const person = { id: 7, nombre: 'Cliente recepción', rut: null, tipo: 'cliente' as const, email: null, telefono: null, direccion: null };
const savedVehicle: Vehicle = {
  id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Yaris', ano: 2024,
  clientId: 7, client: person, kilometraje: 12345,
  color: null, vinChasis: null, motor: null, combustible: null, transmision: null,
  createdAt: '2026-11-12T12:00:00Z', updatedAt: '2026-11-12T12:00:00Z',
};
const vehicleError = 'Seleccione o cree el vehículo que ingresa al taller.';

const renderCreate = (path = '/work-orders/new') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
        <Route path="/quotations/:quotationId/convert-to-ot" element={<WorkOrderCreatePage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const recoverVehicleStep = async () => {
  await saveFormDraft(1, 'work-order:new', workOrderRecoverySchema.parse({
    activeStep: 2, client: person, contactClient: person, billingClient: person, vehicle: null,
    assignedMechanicId: null, kilometrajeIngreso: '', descripcion: 'Revisión solicitada',
    fechaIngreso: '2026-11-12T10:00', fechaEntrega: '', items: [],
    inspection: { nivelCombustible: '', llantaDelanteraIzquierda: '', llantaDelanteraDerecha: '',
      llantaTraseraIzquierda: '', llantaTraseraDerecha: '', inventario: [], objetosValor: '', observaciones: '' },
    photos: [], createdOrder: null, uploadedSlots: [],
  }), 'vehicle-validation');
  renderCreate();
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
  await screen.findByRole('heading', { name: '¿Qué vehículo ingresa?' });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByText(vehicleError)).toBeInTheDocument();
};

describe('WorkOrderCreatePage vehicle validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor' }, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation(async (url) => ({ data:
      url === '/clients/7' ? { client: person }
        : url === '/clients' ? { items: [person] }
          : url === '/search/quick' ? { clients: [], vehicles: [savedVehicle] }
            : url === '/vehicles' ? { items: [savedVehicle], total: 1, totalPages: 1 }
              : { mechanics: [] },
    }));
  });

  it('quita la validación al crear el vehículo desde el wizard y conserva su kilometraje', async () => {
    await recoverVehicleStep();
    fireEvent.click(screen.getByRole('button', { name: 'Crear vehículo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar vehículo de prueba' }));
    expect(screen.queryByText(vehicleError)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nuevo vehículo' })).not.toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '¿Qué vehículo ingresa?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('heading', { name: '¿Cómo ingresa el vehículo?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kilometraje de entrada')).toHaveValue(12345);
    expect(screen.getByLabelText('Motivo de ingreso / diagnóstico preliminar')).toHaveValue('Revisión solicitada');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('quita la validación al seleccionar un vehículo existente', async () => {
    await recoverVehicleStep();
    fireEvent.click(await screen.findByRole('button', { name: /ABCD-12/ }));
    expect(screen.queryByText(vehicleError)).not.toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('heading', { name: '¿Cómo ingresa el vehículo?' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva la validación cuando se cancela la creación sin resolver el vehículo', async () => {
    await recoverVehicleStep();
    fireEvent.click(screen.getByRole('button', { name: 'Crear vehículo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar vehículo' }));
    expect(screen.getByText(vehicleError)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '¿Qué vehículo ingresa?' })).toBeInTheDocument();
  });

  it.each([null, 4])('abre la conversión de COT en recepción paso 3, con vehículo %s, sin crear una OT', async (vehicleId) => {
    const quotation = { id: 10, codigo: 'COT-26-10', clientId: 7, vehicleId, workOrderId: null,
      total: 10000, notas: 'Trabajo cotizado', items: [] };
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/quotations/10') return Promise.resolve({ data: { quotation } });
      if (url === '/vehicles/4') return Promise.resolve({ data: { vehicle: savedVehicle } });
      return baseGet(url, config);
    });
    renderCreate('/quotations/10/convert-to-ot');
    expect(await screen.findByRole('heading', { name: '¿Qué vehículo ingresa?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3. Vehículo' })).toHaveAttribute('aria-current', 'step');
    await waitFor(() => expect(screen.queryByText('Cargando cotización...')).not.toBeInTheDocument());
    if (vehicleId) expect(screen.getByText('ABCD12')).toBeInTheDocument();
    else expect(screen.getByRole('button', { name: 'Crear vehículo' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
