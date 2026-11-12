import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDetailPage from '../QuotationDetailPage';

import type { Quotation, QuotationPaymentSummary } from '../../../types/entities';
import type { QuotationPaymentMethod, Role } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../components/common/CustomerEmailPanel', () => ({ default: () => null }));
vi.mock('../../../components/quotations/PaymentFormModal', () => ({
  default: ({ saldoPendiente }: { saldoPendiente: number }) => <div role="dialog" aria-label="Registrar abono">Saldo disponible: {saldoPendiente}</div>,
  PAYMENT_METHOD_LABELS: {},
}));

let quotation: Quotation;
let payments: QuotationPaymentSummary;

const renderPage = (search = '?edit=true') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/quotations/10${search}`]}>
      <Routes>
        <Route path="/quotations/:id" element={<QuotationDetailPage />} />
        <Route path="/quotations/:quotationId/convert-to-ot" element={<p>Recepción de la cotización</p>} />
      </Routes>
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
    payments = { quotationId: 10, total: 11900, pagado: 0, saldoPendiente: 11900, estadoPago: 'por_pagar', payments: [] };
    useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor' },
      isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data:
      url === '/quotations/10' ? { quotation } : url === '/quotations/10/payments'
        ? payments
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

  it.each<[Role, boolean]>([
    ['desarrollador', true], ['admin', true], ['jefe', true], ['vendedor', true],
    ['mecanico', false], ['bodeguero', false], ['finanzas', false],
  ])('ofrece convertir una COT sin OT según los permisos de %s', async (role, allowed) => {
    quotation.workOrderId = null;
    quotation.workOrder = null;
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderPage('');
    await screen.findByRole('heading', { name: quotation.codigo });
    const link = screen.queryByRole('link', { name: 'Convertir a OT' });
    if (allowed) expect(link).toHaveAttribute('href', '/quotations/10/convert-to-ot');
    else expect(link).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['comercial', 'taller'] as const)('usa el permiso explícito de %s para abrir recepción sin crear una OT', async (modulo) => {
    quotation.workOrderId = null;
    quotation.workOrder = null;
    useAuthStore.setState({ user: { id: 1, nombre: 'Usuario', email: 'user@test.local', role: 'bodeguero',
      permissions: [{ modulo, accion: modulo === 'comercial' ? 'update' : 'create' }] } });
    renderPage('');
    fireEvent.click(await screen.findByRole('link', { name: 'Convertir a OT' }));
    expect(await screen.findByText('Recepción de la cotización')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('oculta conversión al revocar los permisos explícitos', async () => {
    quotation.workOrderId = null;
    quotation.workOrder = null;
    renderPage('');
    await screen.findByRole('link', { name: 'Convertir a OT' });
    act(() => useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor',
      permissions: [{ modulo: 'comercial', accion: 'read' }] } }));
    expect(screen.queryByRole('link', { name: 'Convertir a OT' })).not.toBeInTheDocument();
  });

  it.each(['linked', 'archived'] as const)('no ofrece convertir una cotización %s', async (state) => {
    if (state === 'archived') {
      quotation.workOrderId = null;
      quotation.workOrder = null;
      quotation.archivedAt = '2026-11-12T12:00:00Z';
    }
    renderPage('');
    await screen.findByRole('heading', { name: quotation.codigo });
    expect(screen.queryByRole('link', { name: 'Convertir a OT' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver PDF / Imprimir' })).toBeEnabled();
  });

  it.each<[Role, boolean]>([
    ['desarrollador', true], ['admin', true], ['jefe', true], ['vendedor', false],
    ['mecanico', false], ['bodeguero', false], ['finanzas', false],
  ])('ofrece Gestionar trabajo según el acceso de %s', async (role, allowed) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderPage('');
    await screen.findByRole('heading', { name: quotation.codigo });
    const link = screen.queryByRole('link', { name: 'Gestionar trabajo' });
    if (allowed) expect(link).toHaveAttribute('href', '/work-orders?manage=20');
    else expect(link).not.toBeInTheDocument();
  });

  it('no ofrece Gestionar trabajo al jefe sin taller:read', async () => {
    useAuthStore.setState({ user: { id: 1, nombre: 'Jefe', email: 'user@test.local', role: 'jefe',
      permissions: [{ modulo: 'comercial', accion: 'read' }] } });
    renderPage('');
    await screen.findByRole('heading', { name: quotation.codigo });
    expect(screen.queryByRole('link', { name: 'Gestionar trabajo' })).not.toBeInTheDocument();
  });

  it.each<[QuotationPaymentMethod, string]>([
    ['transferencia', 'Transferencia bancaria'], ['efectivo', 'Efectivo'],
    ['efectivo_transferencia', 'Efectivo o transferencia'], ['a_convenir', 'A convenir'],
  ])('muestra las condiciones guardadas con forma de pago %s', async (formaPago, label) => {
    quotation.formaPago = formaPago;
    quotation.disponibilidadTrabajo = 'Desde el lunes, previa coordinación';
    quotation.validezDias = 14;
    renderPage('');
    const section = within(await screen.findByRole('region', { name: 'Condiciones de la cotización' }));
    expect(section.getByText(label)).toBeInTheDocument();
    expect(section.getByText(quotation.disponibilidadTrabajo)).toBeInTheDocument();
    expect(section.getByText('14 días')).toBeInTheDocument();
  });

  it('usa los valores comerciales predeterminados para cotizaciones antiguas', async () => {
    renderPage('');
    const section = within(await screen.findByRole('region', { name: 'Condiciones de la cotización' }));
    expect(section.getByText('Transferencia bancaria')).toBeInTheDocument();
    expect(section.getByText('Sin disponibilidad registrada.')).toBeInTheDocument();
    expect(section.getByText('5 días')).toBeInTheDocument();
  });

  it.each(['archived', 'paid', 'pending-transfer'] as const)('bloquea el botón y ?payment=true cuando la COT está %s', async (state) => {
    if (state === 'archived') quotation.archivedAt = '2026-11-12T12:00:00Z';
    else if (state === 'paid') {
      payments.pagado = payments.total;
      payments.saldoPendiente = 0;
      payments.estadoPago = 'total';
    } else {
      payments.payments = [{ id: 1, monto: 11900, estado: 'por_verificar' } as QuotationPaymentSummary['payments'][number]];
    }
    renderPage('?payment=true');
    await screen.findByRole('heading', { name: quotation.codigo });
    await waitFor(() => expect(screen.queryByLabelText('Cargando pagos')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Registrar Abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('descuenta solo transferencias por verificar al abrir un abono', async () => {
    payments.payments = [
      { id: 1, monto: 1900, estado: 'por_verificar' },
      { id: 2, monto: 11900, estado: 'rechazado' },
    ] as QuotationPaymentSummary['payments'];
    renderPage('');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar Abono' }));
    expect(screen.getByRole('dialog', { name: 'Registrar abono' })).toHaveTextContent('Saldo disponible: 10000');
    act(() => useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor',
      permissions: [{ modulo: 'comercial', accion: 'read' }] } }));
    expect(screen.queryByRole('button', { name: 'Registrar Abono' })).not.toBeInTheDocument();
    // An open draft remains mounted; PaymentFormModal disables submission.
    expect(screen.getByRole('dialog', { name: 'Registrar abono' })).toBeInTheDocument();
  });

  it('no abre un abono cuando falla la consulta de pagos', async () => {
    vi.mocked(api.get).mockImplementation((url) => url === '/quotations/10/payments'
      ? Promise.reject(new Error('No se pudo cargar el saldo'))
      : Promise.resolve({ data: { quotation } } as AxiosResponse));
    renderPage('?payment=true');
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible completar la operación');
    expect(screen.queryByRole('button', { name: 'Registrar Abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument();
  });
});
