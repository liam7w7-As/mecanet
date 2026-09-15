import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuickVehicleSearch from '../../../components/common/QuickVehicleSearch';
import VehicleFormModal from '../../../components/vehicles/VehicleFormModal';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import ClientsPage from '../ClientsPage';

import type { Client, PaginatedResponse, QuickSearchResult } from '../../../types/entities';
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

  it('renderiza la tabla con datos de clientes', async () => {
    createWrapper(<ClientsPage />);

    expect(await screen.findByText('Cliente Demo')).toBeInTheDocument();
    expect(screen.getByText('123456785')).toBeInTheDocument();
    expect(screen.getByText('cliente@demo.cl')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
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
    vi.mocked(api.post).mockResolvedValue({ data: { client } } as AxiosResponse<{ client: Client }>);
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
