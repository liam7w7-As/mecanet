import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseFixture, supplierFixture } from './fixtures';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import PurchaseDetailPage from '../PurchaseDetailPage';

import type { Purchase } from '../../../types/entities';
import type { PermissionDefinition, Role } from '@unithor/shared';
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

const renderPage = (role: Role, permissions?: PermissionDefinition[], entry = '/purchases/7') => {
  useAuthStore.setState({
    user: {
      id: 1,
      nombre: 'Usuario de prueba',
      email: 'usuario@unithor.local',
      role,
      permissions,
    },
    isAuthenticated: true,
    isLoading: false,
  });

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="/purchases" element={<h1>Listado de compras</h1>} />
          <Route path="/work-orders/:id" element={<h1>Orden de trabajo</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
};

describe('PurchaseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/purchases/7') {
        return Promise.resolve({
          data: { purchase: purchaseFixture },
        } as AxiosResponse<{ purchase: typeof purchaseFixture }>);
      }
      if (url === '/suppliers/12') {
        return Promise.resolve({
          data: { supplier: supplierFixture },
        } as AxiosResponse<{ supplier: typeof supplierFixture }>);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  const mockExpress = () => {
    const purchase: Purchase = { ...purchaseFixture, express: true, formaPago: 'contado', items: purchaseFixture.items.map((item) => ({ ...item, stockReturnedAt: null })) };
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/purchases/7' ? { purchase } : { supplier: supplierFixture } }) as AxiosResponse);
    return purchase;
  };

  const mockMultiExpress = () => {
    const purchase = mockExpress();
    const line = purchase.items[0];
    purchase.items = [
      { ...line, id: 11, workOrderId: 9, workOrder: purchase.workOrder },
      { ...line, id: 12, descripcion: 'Ampolleta de otra OT', workOrderId: 22,
        workOrder: { id: 22, codigo: 'OT-2026-0022', estado: 'en_progreso' } },
    ];
    return purchase;
  };

  it.each(['jefe', 'admin', 'desarrollador'] as const)('permite enviar una express a stock general sin anular su egreso: %s', async (role) => {
    mockExpress();
    renderPage(role);
    expect(await screen.findByRole('button', { name: 'Enviar a stock general' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Anular compra' })).not.toBeInTheDocument();
  });

  it('envía a stock general, actualiza la ficha y conserva la compra registrada', async () => {
    const purchase = mockExpress();
    vi.mocked(api.post).mockImplementation(async () => {
      purchase.items[0].stockReturnedAt = new Date().toISOString();
      return { data: { purchase } } as AxiosResponse;
    });
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'El cliente no necesitó el accesorio' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enviar a stock general' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/return-to-stock', { motivo: 'El cliente no necesitó el accesorio' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar a stock general' })).not.toBeInTheDocument());
    expect(screen.getByText(/Accesorio enviado al stock general/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar a stock general' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('selecciona todos los pendientes y devuelve solo el producto elegido de su OT', async () => {
    const purchase = mockMultiExpress();
    vi.mocked(api.post).mockImplementation(async () => {
      purchase.items = purchase.items.map((item) => item.id === 12
        ? { ...item, stockReturnedAt: '2026-11-01T12:00:00Z', stockReturnReason: 'No se utilizó' }
        : item);
      return { data: { purchase } } as AxiosResponse;
    });
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    expect(dialog.getAllByRole('checkbox')).toHaveLength(2);
    dialog.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    const first = dialog.getByRole('checkbox', { name: /Filtro de aceite.*OT-2026-0009/ });
    const second = dialog.getByRole('checkbox', { name: /Ampolleta de otra OT.*OT-2026-0022/ });
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'No se utilizó' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enviar a stock general' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/return-to-stock', { motivo: 'No se utilizó', itemIds: [12] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Devolución parcial a stock: 1 de 2 productos.', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a stock general' })).toBeEnabled();
    const firstRow = within(screen.getByText('Filtro de aceite', { selector: 'span.block.font-semibold' }).closest('tr')!);
    const secondRow = within(screen.getByText('Ampolleta de otra OT').closest('tr')!);
    expect(firstRow.getByText('En OT')).toBeInTheDocument();
    expect(firstRow.getByRole('link', { name: 'OT: OT-2026-0009' })).toHaveAttribute('href', '/work-orders/9');
    expect(secondRow.getByRole('link', { name: 'OT: OT-2026-0022' })).toHaveAttribute('href', '/work-orders/22');
    expect(secondRow.getByText('Devuelto a stock general')).toBeInTheDocument();
    expect(secondRow.queryByText('En OT')).not.toBeInTheDocument();
    const association = within(screen.getByRole('heading', { name: 'Asociación' }).closest('section')!);
    expect(association.getByText('Órdenes de trabajo por producto')).toBeInTheDocument();
    expect(association.queryByRole('link')).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('bloquea una selección vacía y permite enviar todos los productos pendientes', async () => {
    const purchase = mockMultiExpress();
    vi.mocked(api.post).mockResolvedValue({ data: { purchase } } as AxiosResponse);
    renderPage('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    const checkboxes = dialog.getAllByRole('checkbox');
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    const submit = dialog.getByRole('button', { name: 'Enviar a stock general' });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(dialog.getByText('0 de 2 productos seleccionados.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Sin uso' } });
    fireEvent.click(submit);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/return-to-stock', { motivo: 'Sin uso', itemIds: [11, 12] }));
  });

  it('omite los productos ya devueltos y oculta casillas cuando solo queda uno pendiente', async () => {
    const purchase = mockMultiExpress();
    purchase.items[0].stockReturnedAt = '2026-11-01T12:00:00Z';
    vi.mocked(api.post).mockImplementation(async () => {
      purchase.items[1].stockReturnedAt = '2026-11-02T12:00:00Z';
      return { data: { purchase } } as AxiosResponse;
    });
    renderPage('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'No' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enviar a stock general' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/return-to-stock', { motivo: 'No', itemIds: [12] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/Todos los productos fueron enviados al stock general/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar a stock general' })).not.toBeInTheDocument();
  });

  it('usa la OT de cabecera solo como respaldo de los productos antiguos sin OT propia', async () => {
    const purchase = mockMultiExpress();
    purchase.items[0].workOrderId = null;
    purchase.items[0].workOrder = null;
    purchase.items[1].workOrder = null;
    renderPage('jefe');
    await screen.findByRole('heading', { name: 'COMP-000007' });
    const firstRow = within(screen.getByText('Filtro de aceite', { selector: 'span.block.font-semibold' }).closest('tr')!);
    const secondRow = within(screen.getByText('Ampolleta de otra OT').closest('tr')!);
    expect(firstRow.getByRole('link', { name: 'OT: OT-2026-0009' })).toHaveAttribute('href', '/work-orders/9');
    expect(secondRow.getByRole('link', { name: 'OT: #22' })).toHaveAttribute('href', '/work-orders/22');
    expect(secondRow.queryByText('OT: OT-2026-0009')).not.toBeInTheDocument();
  });

  it('oculta los selectores con un solo pendiente y excluye los ya devueltos', async () => {
    const purchase = mockMultiExpress();
    purchase.items[0].stockReturnedAt = '2026-11-01T12:00:00Z';
    vi.mocked(api.post).mockResolvedValue({ data: { purchase } } as AxiosResponse);
    renderPage('desarrollador');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'El producto restante no se usó' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enviar a stock general' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/return-to-stock', { motivo: 'El producto restante no se usó', itemIds: [12] }));
  });

  it('conserva la selección al cancelar y bloquea el envío al perder permisos', async () => {
    mockMultiExpress();
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    fireEvent.click(dialog.getAllByRole('checkbox')[0]);
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getAllByRole('checkbox')[0]).not.toBeChecked();
    act(() => useAuthStore.setState({ user: { ...useAuthStore.getState().user!, permissions: [{ modulo: 'compras', accion: 'read' }] } }));
    expect(dialog.getAllByRole('checkbox')[1]).toBeDisabled();
    const submit = dialog.getByRole('button', { name: 'Enviar a stock general' });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['vendedor', 'bodeguero', 'finanzas', 'mecanico'] as const)('oculta el envío a stock para %s', async (role) => {
    mockMultiExpress();
    renderPage(role);
    await screen.findByRole('heading', { name: 'COMP-000007' });
    expect(screen.queryByRole('button', { name: 'Enviar a stock general' })).not.toBeInTheDocument();
  });

  it('conserva el motivo y muestra el fallo si el accesorio no admite devolución', async () => {
    mockExpress();
    vi.mocked(api.post).mockRejectedValue(new Error('Accesorio utilizado'));
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a stock general' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Enviar a stock general' }));
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Conservar motivo de devolución' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enviar a stock general' }));
    await waitFor(() => expect(dialog.getByRole('alert')).toBeInTheDocument());
    expect(dialog.getByLabelText('Motivo')).toHaveValue('Conservar motivo de devolución');
    expect(dialog.getByRole('button', { name: 'Enviar a stock general' })).toBeEnabled();
  });

  it('oculta la devolución de stock al perder el permiso de compras', async () => {
    mockExpress();
    renderPage('jefe', [{ modulo: 'compras', accion: 'read' }]);
    await screen.findByRole('heading', { name: 'COMP-000007' });
    expect(screen.queryByRole('button', { name: 'Enviar a stock general' })).not.toBeInTheDocument();
  });

  it('muestra comprobante, ítems con stock, asociación y pago pendiente', async () => {
    renderPage('jefe');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Registrada el .* por Jefe de Taller/)).toBeInTheDocument();
    expect(screen.getByText('Repuestos Andes')).toBeInTheDocument();
    expect(screen.getByText('Datos incompletos')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);

    const items = within(screen.getByRole('region', { name: 'Totales de la compra' }));
    expect(items.getByText('Total')).toBeInTheDocument();

    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByText('REP-005 · Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByText('Recibido en ALM-01')).toBeInTheDocument();
    expect(screen.getByText('OT-2026-0009')).toHaveAttribute('href', '/work-orders/9');
    expect(screen.getByText('Factura')).toBeInTheDocument();
    expect(screen.getByText('F-9001')).toBeInTheDocument();
    expect(screen.getByText('factura-compra.pdf')).toBeInTheDocument();
    expect(screen.getByText(/application\/pdf · 2 KB/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Registrar pago/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pagar compra completa/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular compra/ })).not.toBeInTheDocument();
  });

  it('reserva anulación y edición de proveedor a administración', async () => {
    renderPage('admin');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anular compra/ })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Completar proveedor/ }).length,
    ).toBeGreaterThan(0);
  });

  it('deja solo lectura al bodeguero', async () => {
    renderPage('bodeguero');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar pago/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular compra/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Completar proveedor/ })).not.toBeInTheDocument();
    expect(screen.getByText('El pago total está pendiente.')).toBeInTheDocument();
  });

  it('usa permisos efectivos y bloquea el pago sin cerrar el formulario al revocarlos', async () => {
    renderPage('bodeguero', [
      { modulo: 'compras', accion: 'read' }, { modulo: 'compras', accion: 'update' },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    expect(screen.getByRole('dialog', { name: 'Pagar compra a crédito' })).toBeInTheDocument();
    act(() => useAuthStore.setState((state) => ({ user: state.user && {
      ...state.user, permissions: [{ modulo: 'compras', accion: 'read' }],
    } })));
    expect(screen.getByRole('dialog', { name: 'Pagar compra a crédito' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar pago total' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('oculta pagos al jefe con permisos efectivos de solo lectura', async () => {
    renderPage('jefe', [{ modulo: 'compras', accion: 'read' }]);
    await screen.findByRole('heading', { name: 'COMP-000007' });
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
  });

  it('muestra un error para IDs inválidos sin quedar cargando ni consultar la API', async () => {
    renderPage('jefe', undefined, '/purchases/invalida');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cargando compra')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('conserva el resultado del pago aunque falle la recarga del detalle', async () => {
    const paid = { ...purchaseFixture, pagadoAt: '2026-10-20T12:30:00.000Z', cashMovementId: 20 };
    vi.mocked(api.post).mockResolvedValue({ data: { purchase: paid } } as AxiosResponse);
    const { queryClient } = renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    vi.mocked(api.get).mockRejectedValue(new Error('Recarga fallida'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago total' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar compra completa' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    expect(queryClient.getQueryData(['purchases', 'detail', purchaseFixture.id, '1:jefe'])).toEqual(paid);
  });

  it.each([false, true])('distingue anulación sin pago y pago anulado (pagada: %s)', async (wasPaid) => {
    const originalGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === '/purchases/7'
      ? Promise.resolve({ data: { purchase: {
        ...purchaseFixture, estado: 'anulada', voidedAt: '2026-10-21T12:00:00.000Z',
        pagadoAt: wasPaid ? '2026-10-20T12:30:00.000Z' : null, cashMovementId: wasPaid ? 20 : null,
      } } } as AxiosResponse) : originalGet(url, config));
    renderPage('admin');
    await screen.findByRole('heading', { name: 'COMP-000007' });
    expect(screen.getAllByText(wasPaid ? 'Pago anulado' : 'Sin pago').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular compra' })).not.toBeInTheDocument();
  });

  it('conserva los datos de pago al cancelar y bloquea el cierre durante el registro', async () => {
    let finishPayment: ((value: AxiosResponse<{ purchase: typeof purchaseFixture }>) => void) | undefined;
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => { finishPayment = resolve; }));
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Pagar compra a crédito' }));
    fireEvent.change(dialog.getByLabelText('Banco'), { target: { value: 'BCI' } });
    fireEvent.change(dialog.getByLabelText('N.º de operación'), { target: { value: 'OP-700' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Banco')).toHaveValue('BCI');
    fireEvent.click(dialog.getByRole('button', { name: 'Registrar pago total' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/payment', {
      metodo: 'transferencia', referencia: null, banco: 'BCI', numeroOperacion: 'OP-700',
    }));
    expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    finishPayment?.({ data: { purchase: purchaseFixture } } as AxiosResponse<{ purchase: typeof purchaseFixture }>);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pagar compra a crédito' })).not.toBeInTheDocument());
  });

  it('conserva el motivo de anulación hasta confirmar y envía la misma operación', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { purchase: purchaseFixture } } as AxiosResponse);
    renderPage('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Anular compra' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Anular compra' }));
    fireEvent.change(dialog.getByLabelText('Motivo de la anulación'), { target: { value: 'Documento duplicado' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Motivo de la anulación')).toHaveValue('Documento duplicado');
    fireEvent.click(dialog.getByRole('button', { name: 'Anular compra' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/purchases/7/void', { motivo: 'Documento duplicado' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anular compra' })).not.toBeInTheDocument());
  });

  it.each(['pago', 'anulacion'] as const)('conserva el formulario de %s y bloquea enviarlo al perder permisos', async (operation) => {
    renderPage(operation === 'pago' ? 'jefe' : 'admin');
    fireEvent.click(await screen.findByRole('button', { name: operation === 'pago' ? 'Registrar pago' : 'Anular compra' }));
    const dialog = within(screen.getByRole('dialog'));
    const label = operation === 'pago' ? 'Banco' : 'Motivo de la anulación';
    const text = operation === 'pago' ? 'Banco Santander' : 'Conservar este motivo';
    fireEvent.change(dialog.getByLabelText(label), { target: { value: text } });
    act(() => useAuthStore.setState({ user: { ...useAuthStore.getState().user!, role: 'jefe', permissions: [{ modulo: 'compras', accion: 'read' }] } }));
    expect(dialog.getByLabelText(label)).toHaveValue(text);
    expect(dialog.getByLabelText(label)).toBeDisabled();
    const submit = dialog.getByRole('button', { name: operation === 'pago' ? 'Registrar pago total' : 'Anular compra' });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('protege la edición del proveedor sin guardar al cerrar el formulario', async () => {
    renderPage('admin');
    const openSupplier = (await screen.findAllByRole('button', { name: /Completar proveedor/ }))[0];
    await waitFor(() => expect(openSupplier).toBeEnabled());
    fireEvent.click(openSupplier);
    const dialog = within(await screen.findByRole('dialog', { name: 'Datos del proveedor' }));
    fireEvent.change(dialog.getByLabelText('Contacto'), { target: { value: 'Contacto de compras' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Contacto')).toHaveValue('Contacto de compras');
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: 'Datos del proveedor' })).not.toBeInTheDocument();
  });
});
