import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  dpBodyTypeId: 'hatchback', dpSizeId: 'S',
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

  it('keeps both panels and edits contact and billing independently without changing the shared client', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    const contact = { ...person, id: 8, nombre: 'Contacto del taller', telefono: '912345678' };
    vi.mocked(api.get).mockImplementation((url, config) => url === '/clients'
      ? Promise.resolve({ data: { items: [person, contact] } }) : baseGet(url, config));
    renderCreate();
    expect(screen.getByRole('region', { name: 'Responsable del ingreso' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contacto y facturación' })).toBeInTheDocument();
    const responsible = await screen.findByRole('button', { name: /Cliente recepción Sin RUT/ });
    await waitFor(() => expect(responsible).not.toBeDisabled());
    fireEvent.click(responsible);

    const billing = screen.getByRole('button', { name: 'Editar facturación' });
    const contactToggle = screen.getByRole('button', { name: 'Cambiar contacto' });
    expect(billing).toHaveAttribute('aria-expanded', 'false');
    expect(contactToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: 'Nombre o razón social' })).not.toBeInTheDocument();

    fireEvent.click(billing);
    fireEvent.change(screen.getByLabelText('Nombre o razón social'), { target: { value: 'Razón social de esta OT' } });
    fireEvent.click(contactToggle);
    expect(billing).toHaveAttribute('aria-expanded', 'false');
    const picker = within(screen.getByRole('region', { name: 'Datos de contacto' }));
    expect(picker.getByRole('textbox', { name: 'Datos de contacto' })).toHaveFocus();
    fireEvent.click(await picker.findByRole('button', { name: /Contacto del taller/ }));
    expect(contactToggle).toHaveAttribute('aria-expanded', 'false');
    expect(contactToggle).toHaveTextContent('Contacto del taller');
    expect(contactToggle).toHaveFocus();
    expect(billing).toHaveTextContent('Razón social de esta OT');
    expect(within(screen.getByRole('region', { name: 'Responsable del ingreso' })).getByText(person.nombre)).toBeInTheDocument();

    fireEvent.click(billing);
    expect(screen.getByLabelText('Nombre o razón social')).toHaveValue('Razón social de esta OT');
    fireEvent.click(screen.getByRole('button', { name: /^Listo$/ }));
    expect(billing).toHaveAttribute('aria-expanded', 'false');
    expect(billing).toHaveFocus();
    fireEvent.click(billing);
    fireEvent.click(screen.getByRole('button', { name: 'Usar datos del responsable' }));
    expect(billing).toHaveTextContent('Se factura al responsable');
    expect(contactToggle).toHaveTextContent('Contacto del taller');
    expect(person.nombre).toBe('Cliente recepción');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('reopens a collapsed billing editor when validation fails without losing edits', async () => {
    renderCreate();
    const responsible = await screen.findByRole('button', { name: /Cliente recepción Sin RUT/ });
    await waitFor(() => expect(responsible).not.toBeDisabled());
    fireEvent.click(responsible);
    const billing = screen.getByRole('button', { name: 'Editar facturación' });
    fireEvent.click(billing);
    fireEvent.change(screen.getByLabelText('Nombre o razón social'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contacto' }));
    expect(billing).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(billing).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Nombre o razón social' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Nombre o razón social' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: '1. Cliente y facturación' })).toHaveAttribute('aria-current', 'step');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('expands secondary billing details on error and retains them when the editor is collapsed', async () => {
    renderCreate();
    const responsible = await screen.findByRole('button', { name: /Cliente recepción Sin RUT/ });
    await waitFor(() => expect(responsible).not.toBeDisabled());
    fireEvent.click(responsible);
    const billing = screen.getByRole('button', { name: 'Editar facturación' });
    fireEvent.click(billing);
    const details = screen.getByText('Contacto y dirección de facturación').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Contacto y dirección de facturación'));
    fireEvent.change(screen.getByLabelText('Correo de facturación'), { target: { value: 'correo inválido' } });
    fireEvent.change(screen.getByLabelText('Dirección de facturación'), { target: { value: 'Dirección de esta OT' } });
    fireEvent.click(screen.getByText('Contacto y dirección de facturación'));
    fireEvent.click(billing);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(billing).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveAttribute('open');
    expect(screen.getByLabelText('Dirección de facturación')).toHaveValue('Dirección de esta OT');
    expect(screen.getByRole('alert')).toHaveTextContent('Email inválido');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('recovers editable billing, validates it in the combined step and submits the snapshot without changing the shared client', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === '/catalog'
      ? Promise.resolve({ data: { items: [], total: 0, totalPages: 0 } }) : baseGet(url, config));
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: { id: 20, codigo: 'OT-26-20' } } });
    await saveFormDraft(1, 'work-order:new', workOrderRecoverySchema.parse({
      activeStep: 1, client: person, contactClient: person, billingClient: person,
      billingDetails: { ...person, nombre: 'Factura recuperada', direccion: 'Calle de facturación 123' },
      vehicle: savedVehicle, assignedMechanicId: null, kilometrajeIngreso: '', descripcion: '',
      fechaIngreso: '2026-11-12T10:00', fechaEntrega: '', items: [],
      inspection: { nivelCombustible: '', llantaDelanteraIzquierda: '', llantaDelanteraDerecha: '',
        llantaTraseraIzquierda: '', llantaTraseraDerecha: '', inventario: [], objetosValor: '', observaciones: '' },
      photos: [], createdOrder: null, uploadedSlots: [],
    }), 'billing-recovery');
    renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByLabelText('Nombre o razón social')).toHaveValue('Factura recuperada');
    expect(screen.getByLabelText('Dirección de facturación')).toHaveValue('Calle de facturación 123');
    fireEvent.change(screen.getByLabelText('Correo de facturación'), { target: { value: 'correo inválido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email inválido');
    expect(screen.getByLabelText('Nombre o razón social')).toHaveValue('Factura recuperada');
    fireEvent.change(screen.getByLabelText('Correo de facturación'), { target: { value: 'FACTURA@EXAMPLE.COM' } });
    fireEvent.click(screen.getByRole('button', { name: '4. Servicios' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar y crear orden' }));
    const review = await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' });
    expect(within(review).getByText('Factura recuperada')).toBeInTheDocument();
    fireEvent.click(within(review).getByRole('button', { name: 'Confirmar y crear orden' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
      billingClientId: person.id, billing: expect.objectContaining({ nombre: 'Factura recuperada', email: 'factura@example.com' }),
    })));
    expect(person.nombre).toBe('Cliente recepción');
    expect(api.patch).not.toHaveBeenCalled();
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

  it('restaura Servicios desde un borrador nuevo sin remapearlo como legado', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === '/catalog'
      ? Promise.resolve({ data: { items: [], total: 0, totalPages: 0 } }) : baseGet(url, config));
    await saveFormDraft(1, 'work-order:new', workOrderRecoverySchema.parse({
      activeStep: 3, stepVersion: 2, client: person, contactClient: person, billingClient: person,
      vehicle: savedVehicle, assignedMechanicId: null, kilometrajeIngreso: '', descripcion: '',
      fechaIngreso: '2026-11-12T10:00', fechaEntrega: '', items: [],
      inspection: { nivelCombustible: '', llantaDelanteraIzquierda: '', llantaDelanteraDerecha: '',
        llantaTraseraIzquierda: '', llantaTraseraDerecha: '', inventario: [], objetosValor: '', observaciones: '' },
      photos: [], createdOrder: null, uploadedSlots: [],
    }), 'services-new-version');
    renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByRole('heading', { name: '¿Qué trabajos vamos a realizar?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4. Servicios' })).toHaveAttribute('aria-current', 'step');
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([null, 4])('abre la conversión de COT en recepción paso 2, con vehículo %s, sin crear una OT', async (vehicleId) => {
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
    expect(screen.getByRole('button', { name: '2. Vehículo' })).toHaveAttribute('aria-current', 'step');
    await waitFor(() => expect(screen.queryByText('Cargando cotización...')).not.toBeInTheDocument());
    if (vehicleId) expect(screen.getByText('ABCD12')).toBeInTheDocument();
    else expect(screen.getByRole('button', { name: 'Crear vehículo' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
