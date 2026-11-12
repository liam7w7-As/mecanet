import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseFixture, warehouseFixture } from './fixtures';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import PurchaseCreatePage from '../PurchaseCreatePage';

import type { PaginatedResponse, Purchase, Warehouse } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const emptyPage = <T,>(): PaginatedResponse<T> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
});

const renderPage = () => {
  useAuthStore.setState({
    user: {
      id: 1,
      nombre: 'Jefe de Taller',
      email: 'jefe@unithor.local',
      role: 'jefe',
    },
    isAuthenticated: true,
    isLoading: false,
  });

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/purchases/new']}>
        <Routes>
          <Route path="/purchases/new" element={<PurchaseCreatePage />} />
          <Route path="/purchases/:id" element={<h1>Detalle de compra</h1>} />
          <Route path="/purchases" element={<h1>Listado de compras</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const fillPurchase = (container: HTMLElement): void => {
  fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
    target: { value: 'Proveedor Nuevo' },
  });
  for (const [label, value] of [
    [/Folio/, 'F-1001'], [/Monto del comprobante/, '11900'],
    [/N.º de depósito u operación/, 'OP-1001'], [/^Banco$/, 'Banco de Chile'],
    [/Descripción/, 'Filtro de aceite'], [/Cantidad/, '2'], [/Precio unitario neto/, '5000'],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['%PDF-1.4 comprobante'], 'comprobante.pdf', { type: 'application/pdf' })] },
  });
};

describe('PurchaseCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            ...emptyPage<Warehouse>(),
            items: [warehouseFixture],
            total: 1,
            totalPages: 1,
          },
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/vehicles' || url === '/fleet-vehicles' || url === '/suppliers') {
        return Promise.resolve({ data: emptyPage<unknown>() } as AxiosResponse<
          PaginatedResponse<unknown>
        >);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { purchase: purchaseFixture as Purchase },
    } as AxiosResponse<{ purchase: Purchase }>);
  });

  it('exige el comprobante antes de enviar la compra', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Nueva compra' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }));

    expect(
      await screen.findByText('Debes adjuntar el comprobante de la compra.'),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('envía el payload y el archivo en un solo formulario multipart', async () => {
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Nueva compra' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: 'Proveedor Nuevo' },
    });
    fireEvent.change(screen.getByLabelText(/Folio/), { target: { value: 'F-1001' } });
    fireEvent.change(screen.getByLabelText(/Monto del comprobante/), {
      target: { value: '11900' },
    });
    fireEvent.change(screen.getByLabelText(/N.º de depósito u operación/), {
      target: { value: 'OP-1001' },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/), {
      target: { value: 'Banco de Chile' },
    });
    fireEvent.change(screen.getByLabelText(/Descripción/), {
      target: { value: 'Filtro de aceite' },
    });
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Precio unitario neto/), {
      target: { value: '5000' },
    });

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(['%PDF-1.4 comprobante'], 'comprobante.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByText('comprobante.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(api.post).mock.calls[0] ?? [];
    expect(url).toBe('/purchases');
    expect(body).toBeInstanceOf(FormData);

    const formData = body as FormData;
    const payload = JSON.parse(String(formData.get('payload'))) as {
      proveedorNombre: string;
      folio: string;
      montoComprobante: number;
      numeroOperacion: string;
      banco: string;
      conIva: boolean;
      formaPago: string;
      items: Array<{
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        afectaStock: boolean;
      }>;
    };

    expect(payload).toMatchObject({
      proveedorNombre: 'Proveedor Nuevo',
      folio: 'F-1001',
      montoComprobante: 11900,
      numeroOperacion: 'OP-1001',
      banco: 'Banco de Chile',
      conIva: true,
      formaPago: 'contado',
      items: [
        {
          descripcion: 'Filtro de aceite',
          cantidad: 2,
          precioUnitario: 5000,
          afectaStock: false,
        },
      ],
    });
    expect((formData.get('comprobante') as File).name).toBe('comprobante.pdf');

    expect(
      await screen.findByRole('heading', { name: 'Detalle de compra' }),
    ).toBeInTheDocument();
  });

  it('bloquea envíos repetidos y navegación pendiente, y permite corregir y reintentar tras un error', async () => {
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const { container } = renderPage();
    fillPurchase(container);
    const form = container.querySelector('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/Folio/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Registrar compra/ })).toBeDisabled();
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('link', { name: 'Volver a compras' }));
    expect(screen.getByRole('heading', { name: 'Nueva compra' })).toBeInTheDocument();
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);

    await act(async () => { fail(new Error('Sin conexión')); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Registrar compra/ })).toBeEnabled());
    expect(screen.getByLabelText(/Folio/)).toHaveValue('F-1001');
    expect(screen.getByText('comprobante.pdf')).toBeInTheDocument();
    const leaveAfterFailure = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaveAfterFailure);
    expect(leaveAfterFailure.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText(/Folio/), { target: { value: 'F-1002' } });
    fireEvent.submit(form);
    await screen.findByRole('heading', { name: 'Detalle de compra' });
    expect(api.post).toHaveBeenCalledTimes(2);
    const retried = vi.mocked(api.post).mock.calls[1][1] as FormData;
    expect(JSON.parse(String(retried.get('payload'))).folio).toBe('F-1002');
    expect((retried.get('comprobante') as File).name).toBe('comprobante.pdf');
  });

  it('conserva datos y comprobante al perder el permiso de creación sin enviar la compra', async () => {
    const { container } = renderPage();
    fillPurchase(container);
    act(() => useAuthStore.setState({ user: { ...useAuthStore.getState().user!, permissions: [{ modulo: 'compras', accion: 'read' }] } }));
    expect(screen.getByLabelText(/Folio/)).toHaveValue('F-1001');
    expect(screen.getByText('comprobante.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar compra/ })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva centavos del catálogo y del total copiado al comprobante', async () => {
    const originalGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === '/catalog'
      ? Promise.resolve({ data: { ...emptyPage(), items: [{
        id: 5, codigo: 'REP-005', nombre: 'Filtro decimal', precio: 12.5, stock: 0, tipo: 'parte',
      }] } } as AxiosResponse)
      : originalGet(url, config));
    const { container } = renderPage();
    fillPurchase(container);
    fireEvent.click(screen.getByRole('button', { name: 'Vincular repuesto de catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Filtro decimal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar total de la compra' }));
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String((vi.mocked(api.post).mock.calls[0][1] as FormData).get('payload')));
    expect(payload.items[0]).toMatchObject({ catalogItemId: 5, cantidad: 2, precioUnitario: 12.5 });
    expect(payload.montoComprobante).toBe(29.75);
    await screen.findByRole('heading', { name: 'Detalle de compra' });
  });
});
