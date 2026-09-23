import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import CatalogPage from '../CatalogPage';

import type { StockAdjustmentResponse } from '../../../hooks/useCatalog';
import type { CatalogItem, PaginatedResponse } from '../../../types/entities';
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

const serviceItem: CatalogItem = {
  id: 1,
  tipo: 'estandar',
  codigo: 'SRV-001',
  nombre: 'Cambio de aceite',
  descripcion: 'Servicio preventivo',
  precio: 35000,
  stock: 0,
  stockMinimo: 0,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const partItem: CatalogItem = {
  id: 2,
  tipo: 'parte',
  codigo: 'REP-002',
  nombre: 'Filtro de aceite',
  descripcion: 'Filtro de motor',
  precio: 12000,
  stock: 3,
  stockMinimo: 2,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

let catalogResponse: PaginatedResponse<CatalogItem>;

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><CatalogPage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogResponse = {
      items: [serviceItem, partItem],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };
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
    vi.mocked(api.get).mockImplementation(() => Promise.resolve({ data: catalogResponse } as AxiosResponse<PaginatedResponse<CatalogItem>>));
  });

  it('renderiza el listado y las tabs de navegación', async () => {
    renderPage();

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Servicios Estándar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Repuestos / Partes' })).toBeInTheDocument();
    expect(screen.getByText('Stock crítico: 3')).toBeInTheDocument();
  });

  it('muestra el filtro de disponibilidad al seleccionar Repuestos', async () => {
    renderPage();
    await screen.findByText('Cambio de aceite');

    fireEvent.click(screen.getByRole('tab', { name: 'Repuestos / Partes' }));
    const stockFilter = screen.getByRole('checkbox', { name: 'Solo con stock disponible' });
    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeInTheDocument();
    fireEvent.click(stockFilter);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/catalog', {
        params: expect.objectContaining({ tipo: 'parte', soloConStock: true }),
      });
    });
  });

  it('deshabilita stock al crear un Servicio Estándar', async () => {
    renderPage();
    await screen.findByText('Cambio de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Servicio estándar' }));

    expect(screen.getByLabelText('Stock inicial')).toBeDisabled();
  });

  it('bloquea un egreso superior al stock disponible', async () => {
    renderPage();
    await screen.findByText('Filtro de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock de Filtro de aceite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salida / Egreso' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(await screen.findByText('El egreso no puede superar el stock disponible (3)')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('actualiza la fila después de un ajuste exitoso sin recargar la página', async () => {
    vi.mocked(api.post).mockImplementation(async () => {
      const updatedItem = { ...partItem, stock: 8 };
      catalogResponse = { ...catalogResponse, items: [serviceItem, updatedItem] };
      const response: StockAdjustmentResponse = {
        item: updatedItem,
        stockAnterior: 3,
        nuevoStock: 8,
        delta: 5,
        motivo: 'Recepción proveedor',
      };
      return { data: response } as AxiosResponse<StockAdjustmentResponse>;
    });
    renderPage();
    await screen.findByText('Filtro de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock de Filtro de aceite' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Motivo del movimiento (opcional)'), { target: { value: 'Recepción proveedor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/catalog/2/stock', { delta: 5, motivo: 'Recepción proveedor' }));
    await waitFor(() => expect(screen.getByTestId('stock-2')).toHaveTextContent('8'));
    expect(screen.queryByRole('dialog', { name: 'Ajustar stock' })).not.toBeInTheDocument();
  });
});

