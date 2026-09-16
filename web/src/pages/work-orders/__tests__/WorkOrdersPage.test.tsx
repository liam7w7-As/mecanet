import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderCreatePage from '../WorkOrderCreatePage';
import WorkOrderDetailPage from '../WorkOrderDetailPage';
import WorkOrdersPage from '../WorkOrdersPage';

import type { EditableWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import type { CatalogItem, Client, PaginatedResponse, QuickSearchResult, WorkOrder } from '../../../types/entities';
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

const workOrder: WorkOrder = {
  id: 12,
  codigo: 'OT-2026-0012',
  clientId: 7,
  vehicleId: 4,
  estado: 'borrador',
  descripcion: 'Revisión de frenos',
  kilometrajeIngreso: 84500,
  fechaIngreso: '2026-09-15T10:00:00.000Z',
  fechaEntrega: null,
  createdBy: 1,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  client: { id: 7, rut: '123456785', nombre: 'Cliente Demo', telefono: '+56912345678' },
  vehicle: { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla' },
  creator: { id: 1, nombre: 'Desarrollador UNITHOR', email: 'dev@unithor.local' },
  items: [
    {
      id: 20,
      catalogItemId: null,
      descripcion: 'Cambio de pastillas',
      cantidad: 2,
      precioUnitario: 25000,
      subtotal: 50000,
    },
  ],
};

const listResponse: PaginatedResponse<WorkOrder> = {
  items: [workOrder],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptyCatalog: PaginatedResponse<CatalogItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 0,
};

const client: Client = {
  id: 7,
  rut: '123456785',
  nombre: 'Cliente Demo',
  tipo: 'cliente',
  email: 'cliente@demo.cl',
  telefono: '+56912345678',
  direccion: 'Avenida Demo 123',
  region: null,
  comuna: null,
  notas: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const clientsResponse: PaginatedResponse<Client> = {
  items: [client],
  total: 1,
  page: 1,
  pageSize: 8,
  totalPages: 1,
};

const quickSearchResponse: QuickSearchResult = {
  clients: [],
  vehicles: [
    {
      id: 4,
      patente: 'ABCD12',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2020,
      client: { id: 7, nombre: 'Cliente Demo', rut: '123456785' },
    },
  ],
};

const createWrapper = (children: React.ReactNode, route = '/work-orders') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('WorkOrdersPage', () => {
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
      if (url === '/catalog') {
        return Promise.resolve({ data: emptyCatalog } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
  });

  it('renderiza la tabla de órdenes de trabajo con datos', async () => {
    createWrapper(<WorkOrdersPage />);

    expect(await screen.findByText('OT-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByText('Cliente Demo')).toBeInTheDocument();
    expect(screen.getAllByText('Borrador')).toHaveLength(2);
  });

  it('actualiza la consulta al filtrar por estado', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');

    fireEvent.click(screen.getByRole('tab', { name: 'En progreso' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders', {
        params: expect.objectContaining({ estado: 'en_progreso' }),
      });
    });
  });

  it('recalcula subtotales y total al cambiar cantidad y precio', async () => {
    const EditorHarness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} />;
    };

    createWrapper(<EditorHarness />);

    fireEvent.change(screen.getByLabelText('Descripción 1'), { target: { value: 'Cambio de aceite' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '15000' } });

    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('30.000');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('30.000');
  });

  it('no muestra transiciones para una orden entregada', async () => {
    const deliveredOrder: WorkOrder = { ...workOrder, estado: 'entregada' };
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: deliveredOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByText('Esta orden está en un estado terminal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'En progreso' })).not.toBeInTheDocument();
  });

  it('solicita y procesa el PDF de la orden', async () => {
    const pdfBlob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const createObjectUrl = vi.fn(() => 'blob:work-order-pdf');
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}/pdf`) {
        return Promise.resolve({ data: pdfBlob } as AxiosResponse<Blob>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF de OT-2026-0012' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders/12/pdf', { responseType: 'blob' });
      expect(createObjectUrl).toHaveBeenCalledWith(pdfBlob);
      expect(anchorClick).toHaveBeenCalled();
    });
  });

  it('crea una OT desde el wizard y sube fotos de inspección', async () => {
    const createObjectUrl = vi.fn(() => 'blob:inspection-photo');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/clients') {
        return Promise.resolve({ data: clientsResponse } as AxiosResponse<PaginatedResponse<Client>>);
      }
      if (url === '/search/quick') {
        return Promise.resolve({ data: quickSearchResponse } as AxiosResponse<QuickSearchResult>);
      }
      if (url === '/catalog') {
        return Promise.resolve({ data: emptyCatalog } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/work-orders') {
        return Promise.resolve({ data: { workOrder: { ...workOrder, id: 77 } } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({
        data: {
          photo: {
            id: 1,
            slot: 'frontal',
            mimeType: 'image/png',
            sizeBytes: 5,
            uploadedBy: 1,
            createdAt: '2026-09-15T10:00:00.000Z',
            updatedAt: '2026-09-15T10:00:00.000Z',
            url: '/api/work-orders/77/inspection/photos/frontal',
          },
        },
      } as AxiosResponse);
    });

    createWrapper(
      <Routes>
        <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
        <Route path="/work-orders/:id" element={<p>Detalle generado</p>} />
      </Routes>,
      '/work-orders/new',
    );

    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    const vehicleSearch = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(vehicleSearch);
    fireEvent.change(vehicleSearch, {
      target: { value: 'AB' },
    });

    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    const photo = new File(['photo'], 'frontal.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
        clientId: 7,
        contactClientId: 7,
        billingClientId: 7,
        vehicleId: 4,
        inspection: expect.objectContaining({ llantaDelanteraIzquierda: 'no_revisado' }),
      }));
      expect(api.post).toHaveBeenCalledWith(
        '/work-orders/77/inspection/photos/frontal',
        expect.any(FormData),
      );
    });
  });
});
