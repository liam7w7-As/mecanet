import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useDeliverWarehouseRequestMutation } from '../useWarehouses';
import { useWorkOrderWorksheet } from '../useWorkOrderLabor';

import type { WorkOrderWorksheet, WorkOrderWorksheetItem } from '../../types/entities';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const worksheet = (awaitingWarehouseDelivery: boolean): WorkOrderWorksheet => {
  const item: WorkOrderWorksheetItem = {
    id: 71, descripcion: 'Filtro entregado por bodega', tipoLinea: 'parte', unidadMedida: 'unidad', cantidad: 2,
    estadoOperativo: 'pendiente', notasOperativas: null, horasHombreEstimadas: null, horasEstimadasTotales: null,
    horasHombreReales: null, excedeEstimado: false, assignedUser: null, laborValidatedAt: null,
    laborValidationNote: null, activeSession: null, totalMinutes: 0, observationsCount: 0, canWork: true,
    awaitingWarehouseDelivery,
  };
  return {
    workOrder: { id: 9, codigo: 'OT-26-9', estado: 'en_progreso', fechaIngreso: null, descripcion: null,
      vehiculo: { id: null, patente: null, marca: null, modelo: null } },
    items: [item], servicios: [], repuestos: [item], observations: [], progressReports: [], activeItemId: null, pausedOtherItems: 0,
    totals: { items: 1, completados: 0, enProceso: 0, pendientes: 1, horasEstimadas: 0, horasReales: 0, minutosReales: 0 },
  };
};

describe('Warehouse delivery and workshop synchronization', () => {
  beforeEach(() => vi.resetAllMocks());

  it('refreshes an active worksheet immediately after delivery instead of waiting for polling', async () => {
    let pendingDelivery = true;
    vi.mocked(api.get).mockImplementation(async () => ({ data: { worksheet: worksheet(pendingDelivery) } }));
    vi.mocked(api.post).mockImplementation(async () => {
      pendingDelivery = false;
      return { data: { request: { catalogItemId: 7 } } };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({ worksheet: useWorkOrderWorksheet(9), delivery: useDeliverWarehouseRequestMutation() }), { wrapper });
    await waitFor(() => expect(result.current.worksheet.data?.items[0].awaitingWarehouseDelivery).toBe(true));
    await act(async () => { await result.current.delivery.mutateAsync({ requestId: 41, warehouseId: 2 }); });
    await waitFor(() => expect(result.current.worksheet.data?.items[0].awaitingWarehouseDelivery).toBe(false));
    expect(api.post).toHaveBeenCalledWith('/warehouses/requests/41/deliver', { warehouseId: 2, comentario: undefined });
    expect(api.get).toHaveBeenCalledTimes(2);
    unmount();
    client.clear();
  });
});
