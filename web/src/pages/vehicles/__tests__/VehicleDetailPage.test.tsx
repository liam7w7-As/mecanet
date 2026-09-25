import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import VehicleDetailPage from '../VehicleDetailPage';
import VehiclesPage from '../VehiclesPage';

import type { PaginatedResponse, Quotation, Vehicle, WorkOrder } from '../../../types/entities';
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

const vehicle: Vehicle = {
  id: 12,
  patente: 'ABCD12',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2022,
  color: 'Blanco',
  vinChasis: 'VIN123',
  motor: null,
  kilometraje: 45200,
  combustible: 'bencina',
  transmision: 'automatica',
  clientId: 7,
  client: {
    id: 7,
    rut: '12345678-5',
    nombre: 'Cliente Demo',
    tipo: 'cliente',
    telefono: '+56 9 1234 5678',
  },
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const workOrder: WorkOrder = {
  id: 31,
  codigo: 'OT-2026-0031',
  clientId: 7,
  vehicleId: 12,
  estado: 'en_progreso',
  descripcion: 'Cambio de distribución',
  kilometrajeIngreso: 45500,
  fechaIngreso: '2026-09-20T10:00:00.000Z',
  fechaEntrega: null,
  createdBy: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const quotation: Quotation = {
  id: 41,
  codigo: 'COT-2026-0041',
  workOrderId: 31,
  clientId: 7,
  vehicleId: 12,
  asesorId: 1,
  estadoPago: 'parcial',
  subtotal: 150000,
  total: 150000,
  pagado: 50000,
  notas: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const paginated = <T,>(items: T[]): PaginatedResponse<T> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 100,
  totalPages: items.length > 0 ? 1 : 0,
});

const renderRoutes = (initialRoute = '/vehicles?vehicleId=12') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('VehicleDetailPage', () => {
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
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/vehicles/12') {
        return Promise.resolve({ data: { vehicle } } as AxiosResponse<{ vehicle: Vehicle }>);
      }
      if (url === '/vehicles') {
        return Promise.resolve({ data: paginated([vehicle]) } as AxiosResponse<
          PaginatedResponse<Vehicle>
        >);
      }
      if (url === '/work-orders') {
        return Promise.resolve({ data: paginated([workOrder]) } as AxiosResponse<
          PaginatedResponse<WorkOrder>
        >);
      }
      if (url === '/quotations') {
        return Promise.resolve({ data: paginated([quotation]) } as AxiosResponse<
          PaginatedResponse<Quotation>
        >);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  it('muestra ficha técnica, propietario e historiales relacionados', async () => {
    renderRoutes();

    const detail = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo' }));
    expect(await detail.findByRole('heading', { name: 'ABCD12' })).toBeInTheDocument();
    expect(screen.getAllByText('Cliente Demo')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Ficha' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Taller/ }));
    expect(await screen.findByText('OT-2026-0031')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /OT-2026-0031/ })).toHaveAttribute(
      'href',
      '/work-orders/31',
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: /Taller/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Cotizaciones/ })).toHaveFocus();
    expect(await screen.findByText('COT-2026-0041')).toBeInTheDocument();
    expect(screen.queryByText('OT-2026-0031')).not.toBeInTheDocument();
    expect(screen.getByText('$100.000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva OT' })).toHaveAttribute(
      'href',
      '/work-orders/new?vehicleId=12',
    );
  });

  it('abre la ficha al seleccionar la patente desde el listado', async () => {
    renderRoutes('/vehicles');

    expect(await screen.findByText('#1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de ABCD12' }));

    const detail = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo' }));
    expect(await detail.findByRole('heading', { name: 'ABCD12' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/vehicles/12');
  });
});
