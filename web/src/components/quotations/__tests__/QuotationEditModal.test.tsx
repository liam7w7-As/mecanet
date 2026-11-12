import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationEditModal from '../QuotationEditModal';

import type { Quotation } from '../../../types/entities';
import type { Role } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const makeQuotation = (): Quotation => ({
      id: 10,
      codigo: 'COT-26-10',
      workOrderId: 20,
      clientId: 1,
      vehicleId: 1,
      asesorId: 1,
      estadoPago: 'por_pagar',
      subtotal: 20000,
      total: 20000,
      pagado: 0,
      notas: null,
      descuentoTipo: 'fijo',
      descuentoValor: 500,
      workOrder: { id: 20, codigo: 'OT-26-20', estado: 'en_progreso' },
      createdAt: '2026-10-27T12:00:00Z',
      updatedAt: '2026-10-27T12:00:00Z',
      items: [101, 102].map((id) => ({
        id,
        catalogItemId: null,
        descripcion: 'Trabajo duplicado',
        tipoLinea: 'estandar',
        unidadMedida: 'servicio',
        cantidad: 1,
        precioUnitario: 10000,
        subtotal: 10000,
        descuentoTipo: id === 101 ? 'porcentaje' : 'fijo',
        descuentoValor: id === 101 ? 10 : 1000,
        estadoOperativo: id === 101 ? 'completado' : 'pendiente',
        notasOperativas: id === 101 ? 'Trabajo revisado por el mecánico' : null,
      })),
});

const renderEditor = (quotation: Quotation) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSaved = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuotationEditModal quotation={quotation} onClose={vi.fn()} onSaved={onSaved} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, onSaved };
};

describe('QuotationEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor' },
      isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } } as AxiosResponse);
    vi.mocked(api.patch).mockResolvedValue({ data: { quotation: makeQuotation() } } as AxiosResponse);
  });

  it('preserves the identity, discounts and notes of duplicate services when a description is edited', async () => {
    const { onSaved } = renderEditor(makeQuotation());
    fireEvent.change(screen.getAllByDisplayValue('Trabajo duplicado')[0], {
      target: { value: 'Trabajo renombrado' },
    });
    expect(screen.getByRole('combobox', { name: 'Avance 1' })).toHaveValue('completado');
    expect(screen.getByRole('textbox', { name: 'Nota operativa 1' })).toHaveValue('Trabajo revisado por el mecánico');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith(
      '/quotations/10',
      expect.objectContaining({
        items: [
          expect.objectContaining({ id: 101, descripcion: 'Trabajo renombrado', estadoOperativo: 'completado', notasOperativas: 'Trabajo revisado por el mecánico' }),
          expect.objectContaining({ id: 102, descripcion: 'Trabajo duplicado', estadoOperativo: 'pendiente', notasOperativas: null }),
        ],
        descuentoTipo: 'fijo', descuentoValor: 500,
      }),
    );
    const payload = vi.mocked(api.patch).mock.calls[0][1] as { items: Array<Record<string, unknown>> };
    expect(payload.items[0]).toMatchObject({ descuentoTipo: 'porcentaje', descuentoValor: 10 });
    expect(payload.items[1]).toMatchObject({ descuentoTipo: 'fijo', descuentoValor: 1000 });
    // COT has no labor-hours field: retain IDs so backend updates the existing OT lines.
    payload.items.forEach((item) => expect(item).not.toHaveProperty('horasHombreEstimadas'));
  });

  it.each<Role>(['mecanico', 'bodeguero', 'finanzas'])('impide envíos directos del editor para %s sin comercial:update', (role) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderEditor(makeQuotation());
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Notas comerciales')).toBeDisabled();
    fireEvent.submit(save.closest('form')!);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('bloquea un borrador abierto al revocar el permiso comercial', () => {
    renderEditor(makeQuotation());
    fireEvent.change(screen.getByLabelText('Notas comerciales'), { target: { value: 'Borrador' } });
    act(() => useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor', permissions: [] } }));
    expect(screen.getByLabelText('Notas comerciales')).toHaveValue('Borrador');
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest('form')!);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('permite notas y condiciones de una COT pagada sin enviar líneas ni descuentos', async () => {
    const quotation = makeQuotation();
    quotation.estadoPago = 'total';
    renderEditor(quotation);
    expect(screen.getByLabelText('Precio unitario 1')).toBeDisabled();
    expect(screen.getByLabelText('Avance 1')).toBeDisabled();
    expect(screen.getByLabelText('Tipo de descuento general')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Notas comerciales'), { target: { value: 'Entrega coordinada' } });
    fireEvent.change(screen.getByLabelText('Disponibilidad del trabajo'), { target: { value: 'Lunes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/quotations/10', {
      notas: 'Entrega coordinada', formaPago: 'transferencia', disponibilidadTrabajo: 'Lunes', validezDias: 5,
    }));
  });

  it.each(['entregada', 'cancelada'])('excluye líneas al guardar condiciones de una OT %s', async (state) => {
    const quotation = makeQuotation();
    quotation.workOrder!.estado = state;
    renderEditor(quotation);
    expect(screen.getByLabelText('Precio unitario 1')).toBeDisabled();
    expect(screen.getByLabelText('Nota operativa 1')).toBeDisabled();
    // The endpoint only synchronizes the OT when items are sent; a general discount remains allowed.
    expect(screen.getByLabelText('Tipo de descuento general')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Descuento general'), { target: { value: '700' } });
    fireEvent.change(screen.getByLabelText('Notas comerciales'), { target: { value: 'Condiciones acordadas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/quotations/10', {
      notas: 'Condiciones acordadas', formaPago: 'transferencia', disponibilidadTrabajo: null, validezDias: 5,
      descuentoTipo: 'fijo', descuentoValor: 700,
    }));
  });
});
