import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import VehiclesPage from '../VehiclesPage';

import type {
  FleetDocument,
  FleetVehicle,
  FleetVehicleDetail,
  PaginatedResponse,
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

const fleetVehicle: FleetVehicle = {
  id: 3,
  patente: 'FLAB12',
  codigoInterno: 'FLT-003',
  marca: 'Toyota',
  modelo: 'Hilux',
  ano: 2024,
  color: 'Blanco',
  vinChasis: 'VINFLOTA123',
  motor: null,
  kilometraje: 18400,
  combustible: 'diesel',
  transmision: 'manual',
  estadoOperativo: 'disponible',
  sucursal: 'Casa matriz',
  responsable: 'María Soto',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  documentSummary: {
    total: 1,
    expired: 0,
    expiringSoon: 1,
    nextExpiry: {
      documentId: 11,
      nombre: 'Revisión técnica',
      fechaVencimiento: '2026-11-02',
      state: 'critico',
      daysRemaining: 5,
    },
  },
};

const document: FleetDocument = {
  id: 11,
  fleetVehicleId: 3,
  nombre: 'Revisión técnica',
  referencia: 'RT-2026-011',
  notas: 'Renovar antes del viaje a regiones',
  fechaEmision: '2026-10-02',
  fechaVencimiento: '2026-11-02',
  archivoNombre: null,
  mimeType: null,
  sizeBytes: null,
  version: 0,
  tieneArchivo: false,
  subidoPor: null,
  expiry: { state: 'critico', daysRemaining: 5 },
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

const fleetVehicleDetail: FleetVehicleDetail = {
  ...fleetVehicle,
  documents: [document],
};

const paginated = <T,>(items: T[]): PaginatedResponse<T> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: items.length > 0 ? 1 : 0,
});

const renderFlota = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/vehicles?tab=flota']}>
        <Routes>
          <Route path="/vehicles" element={<VehiclesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('FleetVehiclesPage', () => {
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
      if (url === '/fleet-vehicles') {
        return Promise.resolve({ data: paginated([fleetVehicle]) } as AxiosResponse<
          PaginatedResponse<FleetVehicle>
        >);
      }
      if (url === '/fleet-vehicles/3') {
        return Promise.resolve({ data: { fleetVehicle: fleetVehicleDetail } } as AxiosResponse<{
          fleetVehicle: FleetVehicleDetail;
        }>);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  it('lista solo la flota interna con su estado y alerta documental', async () => {
    renderFlota();

    expect(await screen.findByText('FLAB12')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Flota/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = within(screen.getByRole('region', { name: 'Listado de vehículos de flota' }));
    expect(list.getByText('Disponible')).toBeInTheDocument();
    expect(list.getByText('1 por vencer en 30 días')).toBeInTheDocument();
    expect(list.getByText('02-11-2026')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/vehicles', expect.anything());
  });

  it('abre la ficha de flota desde la URL y muestra documentos sin archivo', async () => {
    renderFlota();

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de FLAB12' }));

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }),
    );
    expect(await dialog.findByRole('heading', { name: 'FLAB12' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/fleet-vehicles/3');
    expect(dialog.getByText('Revisión técnica')).toBeInTheDocument();
    expect(dialog.getByText('Vence en 5 días')).toBeInTheDocument();
    expect(dialog.getByText('Sin archivo')).toBeInTheDocument();
    expect(dialog.getByText('María Soto')).toBeInTheDocument();
    expect(dialog.getByText('Diésel')).toBeInTheDocument();
    expect(dialog.getByText('Manual')).toBeInTheDocument();
    expect(dialog.getAllByText('02-11-2026').length).toBeGreaterThan(0);
  });
});
