import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { laborKeys } from '../useWorkOrderLabor';
import { useConfirmWorkOrderQualityMutation, useReviewWorkOrderItemQualityMutation, useWorkOrderQuality, workOrderQualityKeys } from '../useWorkOrderQuality';
import { workOrderKeys } from '../useWorkOrders';

import type { WorkOrderQuality } from '../useWorkOrderQuality';
import type { Role } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const quality: WorkOrderQuality = { workOrderId: 41, estado: 'en_progreso', approvedAt: null, approvedBy: null, approvalNote: null, canConfirm: false,
  items: [{ id: 10, descripcion: 'Suspensión', tipoLinea: 'especifico', estadoOperativo: 'pendiente', qualityStatus: 'rechazado', qualityReviewedAt: '2026-11-16T12:00:00Z', qualityReviewedBy: 7, qualityNote: 'Corregir fuga' }], history: [] };

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('Work order quality hooks', () => {
  it('fetches the quality contract with a viewer-specific cache', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { quality } });
    const { result } = renderHook(() => useWorkOrderQuality(41), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(quality));
    expect(api.get).toHaveBeenCalledWith('/work-orders/41/quality');
    expect(client.getQueryCache().findAll({ queryKey: workOrderQualityKeys.detail(41) })[0].queryKey[2]).toContain('7:jefe');
  });

  it.each<Role>(['vendedor', 'bodeguero', 'finanzas'])('does not fetch quality for %s', async (role) => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Otro', email: 'qa@example.test', role } });
    const { result } = renderHook(() => useWorkOrderQuality(41), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('posts rejection without a members key and updates managed order and worksheet caches without changing hours or history', async () => {
    const savedItem = { id: 10, estadoOperativo: 'completado', horasHombreReales: 3, assignments: [{ userId: 9 }], sessions: [{ id: 8, minutes: 180 }] };
    const savedOrder = { id: 41, estado: 'finalizada', qualityApprovedAt: '2026-11-15T12:00:00Z', items: [savedItem] };
    const mechanicKey = [...workOrderKeys.detail(41), 'mechanic', 9];
    client.setQueryData(workOrderKeys.detail(41), savedOrder);
    client.setQueryData(mechanicKey, { ...savedOrder, items: [savedItem] });
    client.setQueryData(laborKeys.worksheet(41), { workOrder: savedOrder, items: [savedItem], servicios: [savedItem], repuestos: [], observations: [{ id: 3 }] });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { quality } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useReviewWorkOrderItemQualityMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, itemId: 10, data: { decision: 'rechazar', nota: 'Corregir fuga' } }); });
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/items/10/quality', { decision: 'rechazar', nota: 'Corregir fuga' });
    for (const queryKey of [workOrderKeys.detail(41), mechanicKey]) {
      expect(client.getQueryData(queryKey)).toMatchObject({ estado: 'en_progreso', qualityApprovedAt: null, items: [{ estadoOperativo: 'pendiente', qualityStatus: 'rechazado', horasHombreReales: 3, assignments: savedItem.assignments, sessions: savedItem.sessions }] });
    }
    expect(client.getQueryData(laborKeys.worksheet(41))).toMatchObject({ workOrder: { qualityApprovedAt: null }, observations: [{ id: 3 }], servicios: [{ estadoOperativo: 'pendiente', horasHombreReales: 3 }] });
    for (const queryKey of [workOrderQualityKeys.detail(41), ['work-order-labor'], ['work-orders'], ['quotations'], ['dashboard'], ['workshop-time']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });

  it('posts optional reassignment as part of the same rejection mutation', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { quality } });
    const data = { decision: 'rechazar' as const, nota: 'Corrección eléctrica', members: [{ userId: 10, specialtyId: 3, estimatedHours: null }] };
    const { result } = renderHook(useReviewWorkOrderItemQualityMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, itemId: 10, data }); });
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/items/10/quality', data);
  });

  it('confirms with optional notes and immediately updates the managed order final status', async () => {
    client.setQueryData(workOrderKeys.detail(41), { id: 41, estado: 'en_progreso', items: [] });
    const final = { ...quality, estado: 'finalizada', approvedAt: '2026-11-16T12:00:00Z', approvedBy: 7, approvalNote: null };
    vi.mocked(api.post).mockResolvedValueOnce({ data: { quality: final } });
    const { result } = renderHook(useConfirmWorkOrderQualityMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41 }); });
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/quality/confirm', {});
    expect(client.getQueryData(workOrderKeys.detail(41))).toMatchObject({ estado: 'finalizada', qualityApprovedAt: final.approvedAt, qualityApprovedBy: 7, qualityApprovalNote: null });
  });

  it('does not alter saved caches when a review fails', async () => {
    const saved = { id: 41, estado: 'en_progreso', items: [] };
    client.setQueryData(workOrderKeys.detail(41), saved);
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useReviewWorkOrderItemQualityMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: 41, itemId: 10, data: { decision: 'aprobar' } })).rejects.toThrow('Sin conexión'); });
    expect(client.getQueryData(workOrderKeys.detail(41))).toEqual(saved);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each<Role>(['mecanico', 'vendedor'])('blocks quality mutation from %s even if called directly', async (role) => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Usuario', email: 'qa@example.test', role } });
    const { result } = renderHook(useReviewWorkOrderItemQualityMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: 41, itemId: 10, data: { decision: 'aprobar' } })).rejects.toThrow('No tienes permiso'); });
    expect(api.post).not.toHaveBeenCalled();
  });
});
