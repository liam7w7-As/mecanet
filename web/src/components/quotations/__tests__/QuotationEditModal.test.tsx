import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import QuotationEditModal from '../QuotationEditModal';

import type { Quotation } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

describe('QuotationEditModal line identity', () => {
  it('preserves the identity of duplicate services when a description is edited', async () => {
    const quotation: Quotation = {
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
        estadoOperativo: 'pendiente',
        notasOperativas: null,
      })),
    };
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } } as AxiosResponse);
    vi.mocked(api.patch).mockResolvedValue({ data: { quotation } } as AxiosResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <QuotationEditModal quotation={quotation} onClose={vi.fn()} onSaved={onSaved} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getAllByDisplayValue('Trabajo duplicado')[0], {
      target: { value: 'Trabajo renombrado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith(
      '/quotations/10',
      expect.objectContaining({
        items: [
          expect.objectContaining({ id: 101, descripcion: 'Trabajo renombrado' }),
          expect.objectContaining({ id: 102, descripcion: 'Trabajo duplicado' }),
        ],
      }),
    );
  });
});
