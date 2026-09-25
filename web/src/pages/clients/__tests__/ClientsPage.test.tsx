import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuickVehicleSearch from '../../../components/common/QuickVehicleSearch';
import VehicleFormModal from '../../../components/vehicles/VehicleFormModal';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import ClientsPage from '../ClientsPage';

import type {
  Client,
  PaginatedResponse,
  QuickSearchResult,
  Vehicle,
  WorkOrder,
  Quotation,
} from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const client: Client = {
  id: 7,
  rut: '123456785',
  nombre: 'Cliente Demo',
  tipo: 'cliente',
  email: 'cliente@demo.cl',
  telefono: '+56 9 1234 5678',
  direccion: 'Av. Central 100',
  region: 'Metropolitana',
  comuna: 'Santiago',
  notas: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  vehiclesCount: 2,
};

const clientsResponse: PaginatedResponse<Client> = {
  items: [client],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const vehicle: Vehicle = {
  id: 4,
  patente: 'ABCD12',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2022,
  color: null,
  vinChasis: null,
  motor: null,
  kilometraje: 45000,
  combustible: 'bencina',
  transmision: null,
  clientId: client.id,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
};
const order: WorkOrder = {
  id: 31,
  codigo: 'OT-2026-0031',
  clientId: client.id,
  vehicleId: vehicle.id,
  estado: 'en_progreso',
  descripcion: 'Cambio de aceite',
  kilometrajeIngreso: 45000,
  fechaIngreso: client.createdAt,
  fechaEntrega: null,
  createdBy: 1,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
  client,
  contact: { clientId: 8, nombre: 'Pedro Contacto', rut: null, telefono: null, email: null },
  billing: {
    clientId: 9,
    nombre: 'Empresa Facturada',
    rut: '123456785',
    telefono: null,
    email: null,
    tipo: 'empresa',
    direccion: null,
    region: null,
    comuna: null,
  },
};
const quotation: Quotation = {
  id: 41,
  codigo: 'COT-2026-0041',
  clientId: client.id,
  vehicleId: vehicle.id,
  workOrderId: order.id,
  asesorId: 1,
  estadoPago: 'parcial',
  subtotal: 100000,
  total: 100000,
  pagado: 25000,
  notas: null,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
};
const mockClientProfile = (getVehicles = () => [vehicle]) => {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === '/clients/7')
      return Promise.resolve({
        data: { client: { ...client, vehicles: getVehicles() } },
      } as AxiosResponse);
    if (url === '/work-orders')
      return Promise.resolve({ data: { ...clientsResponse, items: [order] } } as AxiosResponse);
    if (url === '/quotations')
      return Promise.resolve({ data: { ...clientsResponse, items: [quotation] } } as AxiosResponse);
    return Promise.resolve({ data: clientsResponse } as AxiosResponse);
  });
};

const createWrapper = (children: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockResolvedValue({ data: clientsResponse } as AxiosResponse<
      PaginatedResponse<Client>
    >);
  });

  it('renderiza el listado numerado con datos de clientes', async () => {
    createWrapper(<ClientsPage />);

    expect(await screen.findByText('Cliente Demo')).toBeInTheDocument();
    expect(screen.getByText('123456785')).toBeInTheDocument();
    expect(screen.getByText('cliente@demo.cl')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('actualiza la consulta al cambiar entre Personas y Empresas', async () => {
    createWrapper(<ClientsPage />);
    await screen.findByText('Cliente Demo');

    fireEvent.click(screen.getByRole('tab', { name: 'Personas' }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clients', {
        params: expect.objectContaining({ tipo: 'cliente' }),
      });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Empresas' }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clients', {
        params: expect.objectContaining({ tipo: 'empresa' }),
      });
    });
  });

  it('abre el modal y crea un cliente mediante la mutación', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { client } } as AxiosResponse<{
      client: Client;
    }>);
    createWrapper(<ClientsPage />);
    await screen.findByText('Cliente Demo');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Nuevo Cliente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/clients',
        expect.objectContaining({ nombre: 'Nuevo Cliente', tipo: 'cliente' }),
      );
    });
  });

  it('normaliza la patente del formulario de vehículo a mayúsculas y sin separadores', () => {
    createWrapper(<VehicleFormModal onClose={vi.fn()} />);
    const plateInput = screen.getByLabelText('Patente');

    fireEvent.change(plateInput, { target: { value: 'ab-cd 12' } });

    expect(plateInput).toHaveValue('ABCD12');
  });

  it('abre la ficha con historiales y distingue responsable, contacto y facturación', async () => {
    mockClientProfile();
    createWrapper(<ClientsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver Cliente Demo' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ficha del cliente' }));
    expect(await dialog.findByText(client.email!)).toBeInTheDocument();
    expect(dialog.getByRole('link', { name: 'Nueva OT' })).toHaveAttribute(
      'href',
      '/work-orders/new?clientId=7',
    );
    fireEvent.click(dialog.getByRole('tab', { name: /Vehículos/ }));
    expect(await dialog.findByRole('link', { name: /ABCD12 Toyota/ })).toHaveAttribute(
      'href',
      '/vehicles?vehicleId=4',
    );
    expect(dialog.getByRole('link', { name: 'Nueva OT para ABCD12' })).toHaveAttribute(
      'href',
      '/work-orders/new?clientId=7&vehicleId=4',
    );
    fireEvent.click(dialog.getByRole('tab', { name: /Órdenes/ }));
    expect(await dialog.findByText('OT-2026-0031')).toBeInTheDocument();
    expect(dialog.getByText('Pedro Contacto')).toBeInTheDocument();
    expect(dialog.getByText('Empresa Facturada')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { clientId: 7, page: 1, pageSize: 5 },
    });
    fireEvent.click(dialog.getByRole('tab', { name: /Cotizaciones/ }));
    expect(await dialog.findByText('COT-2026-0041')).toBeInTheDocument();
    expect(dialog.getByText('Saldo $75.000')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Ficha del cliente' })).not.toBeInTheDocument();
  });

  it('crea un vehículo con el cliente preseleccionado y actualiza su ficha sin salir', async () => {
    let saved = false;
    const newVehicle = { ...vehicle, id: 99, patente: 'WXYZ12' };
    mockClientProfile(() => (saved ? [vehicle, newVehicle] : [vehicle]));
    vi.mocked(api.post).mockImplementation(() => {
      saved = true;
      return Promise.resolve({ data: { vehicle: newVehicle } } as AxiosResponse);
    });
    createWrapper(<ClientsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver Cliente Demo' }));
    const detail = within(await screen.findByRole('dialog', { name: 'Ficha del cliente' }));
    fireEvent.click(await detail.findByRole('tab', { name: /Vehículos/ }));
    fireEvent.click(detail.getByRole('button', { name: 'Nuevo vehículo' }));
    const form = within(await screen.findByRole('dialog', { name: 'Nuevo vehículo' }));
    expect(form.getByRole('checkbox', { name: 'Sin dueño asignado por ahora' })).not.toBeChecked();
    fireEvent.change(form.getByLabelText('Patente'), { target: { value: 'wxyz12' } });
    fireEvent.click(form.getByRole('button', { name: 'Crear vehículo' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/vehicles',
        expect.objectContaining({ patente: 'WXYZ12', clientId: 7 }),
      ),
    );
    expect(await detail.findByText('WXYZ12')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nuevo vehículo' })).not.toBeInTheDocument();
  });

  it('despliega resultados de búsqueda rápida después de escribir dos caracteres', async () => {
    const quickResult: QuickSearchResult = {
      clients: [],
      vehicles: [
        {
          id: 4,
          patente: 'ABCD12',
          marca: 'Toyota',
          modelo: 'Corolla',
          ano: 2022,
          client: { id: 7, nombre: 'Cliente Demo', rut: '123456785' },
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/search/quick') {
        return Promise.resolve({ data: quickResult } as AxiosResponse<QuickSearchResult>);
      }
      return Promise.resolve({ data: clientsResponse } as AxiosResponse<PaginatedResponse<Client>>);
    });
    createWrapper(<QuickVehicleSearch onSelectVehicle={vi.fn()} />);

    const quickSearchInput = screen.getByRole('combobox');
    fireEvent.focus(quickSearchInput);
    fireEvent.change(quickSearchInput, { target: { value: 'AB' } });

    expect(await screen.findByText('ABCD12', {}, { timeout: 1500 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/search/quick', {
      params: { q: 'AB', limit: 10 },
    });
  });
});
