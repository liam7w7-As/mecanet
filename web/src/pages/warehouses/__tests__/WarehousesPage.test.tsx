import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WarehousesPage from '../WarehousesPage';

import type { PaginatedResponse, StockBalance, StockMovement, Warehouse } from '../../../types/entities';
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

const warehouse: Warehouse = {
  id: 1,
  codigo: 'CENTRAL',
  nombre: 'Bodega Central',
  direccion: null,
  activo: true,
  totalItems: 1,
  totalUnidades: 10,
};

const balance: StockBalance = {
  warehouseId: 1,
  catalogItemId: 7,
  cantidad: 10,
  codigo: 'UNT101',
  nombre: 'Kit Hilux GR',
  precio: 0,
  stockMinimo: 2,
  bajoMinimo: false,
};

const movement: StockMovement = {
  id: 3,
  catalogItemId: 7,
  warehouseId: 1,
  tipo: 'ingreso',
  cantidad: 10,
  saldoResultante: 10,
  motivo: 'Saldo inicial',
  referencia: 'MIGRACION-030',
  createdBy: 1,
  fecha: '2026-09-23T10:00:00.000Z',
  codigo: 'UNT101',
  nombre: 'Kit Hilux GR',
  warehouseCodigo: 'CENTRAL',
  warehouseNombre: 'Bodega Central',
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><WarehousesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('WarehousesPage', () => {
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
      if (url === '/warehouses') {
        return Promise.resolve({
          data: { items: [warehouse], total: 1, page: 1, pageSize: 50, totalPages: 1 } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: { items: [movement], total: 1, page: 1, pageSize: 15, totalPages: 1 } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
  });

  it('muestra almacenes, saldos y kardex', async () => {
    renderPage();

    expect(await screen.findByText('Bodega Central')).toBeInTheDocument();
    expect(screen.getAllByText('CENTRAL').length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Kit Hilux GR')).toBeInTheDocument();
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument();
    expect(screen.getByText('Ingreso')).toBeInTheDocument();
  });

  it('marca los saldos bajo el mínimo configurado', async () => {
    const lowBalance: StockBalance = { ...balance, catalogItemId: 8, cantidad: 1, codigo: 'UNT102', nombre: 'Filtro aceite', stockMinimo: 5, bajoMinimo: true };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: { items: [warehouse], total: 1, page: 1, pageSize: 50, totalPages: 1 } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance, lowBalance] } } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Filtro aceite');

    expect(screen.getByText('Bajo mínimo')).toBeInTheDocument();
  });

  it('abre el modal de traslado cuando hay más de un almacén', async () => {
    const second: Warehouse = { ...warehouse, id: 2, codigo: 'NORTE', nombre: 'Bodega Norte', totalItems: 0, totalUnidades: 0 };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: { items: [warehouse, second], total: 2, page: 1, pageSize: 50, totalPages: 1 } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: { items: [movement], total: 1, page: 1, pageSize: 15, totalPages: 1 } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Bodega Central');

    fireEvent.click(screen.getByRole('button', { name: 'Trasladar' }));
    expect(await screen.findByRole('dialog', { name: 'Trasladar stock' })).toBeInTheDocument();
  });

  it('registra un movimiento de ingreso', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { movement },
    } as AxiosResponse<{ movement: StockMovement }>);
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: { items: [warehouse], total: 1, page: 1, pageSize: 50, totalPages: 1 } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: { items: [movement], total: 1, page: 1, pageSize: 15, totalPages: 1 } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/catalog') {
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 },
        } as AxiosResponse);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Bodega Central');

    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    expect(await screen.findByRole('dialog', { name: 'Movimiento · CENTRAL' })).toBeInTheDocument();
  });
});
