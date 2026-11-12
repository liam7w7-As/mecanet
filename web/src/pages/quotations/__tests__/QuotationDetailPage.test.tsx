import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDetailPage from '../QuotationDetailPage';

import type { Quotation } from '../../../types/entities';
import type { Role } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../components/common/CustomerEmailPanel', () => ({ default: () => null }));
vi.mock('../../../components/quotations/PaymentFormModal', () => ({
  default: () => <div role="dialog" aria-label="Registrar abono" />,
  PAYMENT_METHOD_LABELS: {},
}));

let quotation: Quotation;

const renderPage = (search = '?edit=true') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/quotations/10${search}`]}>
      <Routes><Route path="/quotations/:id" element={<QuotationDetailPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
};

describe('QuotationDetailPage action access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotation = {
      id: 10, codigo: 'COT-26-10', workOrderId: 20, clientId: 1, vehicleId: null, asesorId: 1,
      estadoPago: 'por_pagar', subtotal: 10000, total: 10000, pagado: 0, notas: null,
      createdAt: '2026-11-12T12:00:00Z', updatedAt: '2026-11-12T12:00:00Z',
      workOrder: { id: 20, codigo: 'OT-26-20', estado: 'en_progreso' },
      items: [{ id: 101, catalogItemId: null, descripcion: 'Servicio original', tipoLinea: 'estandar',
        unidadMedida: 'servicio', cantidad: 1, precioUnitario: 10000, subtotal: 10000,
        estadoOperativo: 'pendiente', notasOperativas: 'Nota original' }],
    };
    useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor' },
      isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data:
      url === '/quotations/10' ? { quotation } : url === '/quotations/10/payments'
        ? { quotationId: 10, total: 11900, pagado: 0, saldoPendiente: 11900, estadoPago: quotation.estadoPago, payments: [] }
        : { items: [], total: 0 },
    } as AxiosResponse));
  });

  it.each<[Role, boolean]>([
    ['desarrollador', true], ['admin', true], ['jefe', true], ['vendedor', true],
    ['mecanico', false], ['bodeguero', false], ['finanzas', false],
  ])('protege ?edit=true según comercial:update de %s', async (role, allowed) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderPage();
    await screen.findByRole('heading', { name: quotation.codigo });
    const edit = screen.queryByRole('button', { name: 'Editar cotización' });
    const dialog = screen.queryByRole('dialog', { name: 'Editar cotización' });
    if (allowed) {
      expect(edit).toBeInTheDocument();
      expect(dialog).toBeInTheDocument();
      expect(screen.getByLabelText('Precio unitario 1')).toBeEnabled();
    } else {
      expect(edit).not.toBeInTheDocument();
      expect(dialog).not.toBeInTheDocument();
    }
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('conserva el borrador y bloquea guardar al revocar comercial:update durante la edición', async () => {
    renderPage();
    await screen.findByRole('dialog', { name: 'Editar cotización' });
    fireEvent.change(screen.getByLabelText('Notas comerciales'), { target: { value: 'Borrador comercial' } });
    act(() => useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor',
      permissions: [{ modulo: 'comercial', accion: 'read' }] } }));
    expect(screen.getByRole('dialog', { name: 'Editar cotización' })).toBeInTheDocument();
    expect(screen.getByLabelText('Notas comerciales')).toHaveValue('Borrador comercial');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form')!);
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Editar cotización' })).not.toBeInTheDocument();
  });

  it.each(['total', 'entregada', 'cancelada'])('abre solo los campos permitidos para %s', async (state) => {
    if (state === 'total') quotation.estadoPago = 'total';
    else quotation.workOrder!.estado = state;
    renderPage();
    await screen.findByRole('dialog', { name: 'Editar cotización' });
    expect(screen.getByLabelText('Precio unitario 1')).toBeDisabled();
    expect(screen.getByLabelText('Notas comerciales')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it.each<[Role, boolean]>([['bodeguero', false], ['finanzas', true]])('protege ?payment=true con el permiso de abono para %s', async (role, allowed) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderPage('?payment=true');
    await screen.findByRole('heading', { name: quotation.codigo });
    const paymentDialog = screen.queryByRole('dialog', { name: 'Registrar abono' });
    if (allowed) expect(paymentDialog).toBeInTheDocument();
    else expect(paymentDialog).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each<[Role, boolean]>([['finanzas', false], ['jefe', true]])('muestra la referencia OT según acceso a taller de %s', async (role, allowed) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderPage('');
    await screen.findByRole('heading', { name: quotation.codigo });
    expect(screen.getByText(/OT-26-20/)).toBeInTheDocument();
    const orderLink = screen.queryByRole('link', { name: 'OT-26-20' });
    if (allowed) expect(orderLink).toHaveAttribute('href', '/work-orders/20');
    else expect(orderLink).not.toBeInTheDocument();
  });
});
