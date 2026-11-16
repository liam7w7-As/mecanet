import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import * as permissions from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { laborKeys, pricePolicyKeys, useCreatePriceSuggestionMutation, useReviewPriceSuggestionMutation, useUpdateWorkOrderPricePolicyMutation, useWorkOrderPricePolicy } from '../useWorkOrderLabor';

import type { WorkOrderPriceSuggestion } from '../../types/entities';
import type { Role } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
const suggestion: WorkOrderPriceSuggestion = { id: 1, workOrderId: 41, workOrderItemId: 10, itemDescripcion: 'Diagnóstico', horasEstimadas: null, horasReales: null, precioActualOt: 0, precioActualCatalogo: null, precioSugerido: 25000, alcance: 'ot', motivo: 'Diagnóstico completado', estado: 'pendiente', createdByName: 'Jefa', reviewNote: null, reviewedAt: null, createdAt: '2026-11-16T12:00:00Z' };
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const setRole = (role: Role) => useAuthStore.setState({ user: { id: 7, nombre: 'Usuario', email: 'qa@example.test', role } });

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  setRole('admin');
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('Per-order price policy hooks', () => {
  it('fetches the policy for a supervisor and keeps the cache scoped to the viewer', async () => {
    const policy = { approvalRequired: true, canConfigure: true };
    vi.mocked(api.get).mockResolvedValueOnce({ data: { policy } });
    const { result } = renderHook(() => useWorkOrderPricePolicy(41), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(policy));
    expect(api.get).toHaveBeenCalledWith('/work-orders/41/price-policy');
    expect(client.getQueryCache().findAll({ queryKey: pricePolicyKeys.detail(41) })[0].queryKey).toContain('admin');
  });

  it.each<Role>(['mecanico', 'vendedor', 'bodeguero'])('does not fetch supervisor policy for %s', (role) => {
    setRole(role);
    const { result } = renderHook(() => useWorkOrderPricePolicy(41), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('updates only this order’s approval policy and invalidates its managed order cache', async () => {
    client.setQueryData(['work-orders', 41], { id: 41, priceApprovalRequired: true });
    client.setQueryData(['work-orders', 42], { id: 42, priceApprovalRequired: true });
    const policy = { approvalRequired: false, canConfigure: true };
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { policy } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useUpdateWorkOrderPricePolicyMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, approvalRequired: false }); });
    expect(api.patch).toHaveBeenCalledWith('/work-orders/41/price-policy', { approvalRequired: false });
    expect(client.getQueryData(['work-orders', 41])).toMatchObject({ priceApprovalRequired: false });
    expect(client.getQueryData(['work-orders', 42])).toMatchObject({ priceApprovalRequired: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: pricePolicyKeys.detail(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-orders'] });
  });

  it('keeps saved policy untouched after a failed update', async () => {
    client.setQueryData(['work-orders', 41], { id: 41, priceApprovalRequired: true });
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión'));
    const { result } = renderHook(useUpdateWorkOrderPricePolicyMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: 41, approvalRequired: false })).rejects.toThrow('Sin conexión'); });
    expect(client.getQueryData(['work-orders', 41])).toMatchObject({ priceApprovalRequired: true });
  });

  it('refreshes OT, COT, payments, finance and delivery data after a directly applied creation', async () => {
    setRole('jefe');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { suggestion: { ...suggestion, estado: 'aprobada', appliedDirectly: true } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useCreatePriceSuggestionMutation, { wrapper });
    const data = { workOrderItemId: 10, precioSugerido: 25000, alcance: 'ot' as const, motivo: suggestion.motivo };
    await act(async () => { await result.current.mutateAsync({ id: 41, data }); });
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/price-suggestions', data);
    for (const queryKey of [laborKeys.suggestions(41), ['work-order-labor'], ['work-orders'], ['quotations'], ['quotation-payments'], ['finance'], ['catalog'], ['dashboard']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });

  it('keeps operational and financial caches unchanged while a new proposal is pending', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { suggestion } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useCreatePriceSuggestionMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, data: { workOrderItemId: 10, precioSugerido: 25000, alcance: 'ot', motivo: suggestion.motivo } }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: laborKeys.suggestions(41) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['quotations'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['work-orders'] });
  });

  it('refreshes the worksheet and financial caches after administration reviews a proposal', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { suggestion: { ...suggestion, estado: 'aprobada' } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useReviewPriceSuggestionMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, suggestionId: 1, data: { decision: 'aprobar' } }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: laborKeys.worksheet(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quotations'] });
  });

  it.each<Role>(['admin', 'jefe'])('blocks %s creation when workshop update permission is missing', async (role) => {
    vi.spyOn(permissions, 'hasUserPermission').mockImplementation((_user, _module, action) => action !== 'update');
    useAuthStore.setState({ user: { id: 7, nombre: 'Consulta', email: 'qa@example.test', role, permissions: [{ modulo: 'taller', accion: 'read' }] } });
    const { result } = renderHook(useCreatePriceSuggestionMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: 41, data: { workOrderItemId: 10, precioSugerido: 25000, alcance: 'ot', motivo: suggestion.motivo } })).rejects.toThrow('No tienes permiso'); });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('blocks chief administrative review and policy configuration even if hooks are called directly', async () => {
    setRole('jefe');
    const { result } = renderHook(() => ({ review: useReviewPriceSuggestionMutation(), policy: useUpdateWorkOrderPricePolicyMutation() }), { wrapper });
    await act(async () => {
      await expect(result.current.review.mutateAsync({ id: 41, suggestionId: 1, data: { decision: 'aprobar' } })).rejects.toThrow('No tienes permiso');
      await expect(result.current.policy.mutateAsync({ id: 41, approvalRequired: false })).rejects.toThrow('No tienes permiso');
    });
    expect(api.patch).not.toHaveBeenCalled();
  });
});
