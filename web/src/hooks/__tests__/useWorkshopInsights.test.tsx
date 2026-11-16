import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { insightAlerts, insightHistory, insightSettings } from '../../test/fixtures/workshop-insights';
import { useWorkOrderAlerts, useWorkOrderHistory, useWorkshopAlerts, useWorkshopAlertSettings, useUpdateWorkshopAlertSettingsMutation, workshopInsightsToday } from '../useWorkshopInsights';

import type { Role } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const role = (role: Role, id = 7) => useAuthStore.setState({ user: { id, nombre: role, email: 'qa@example.test', role } });
beforeEach(() => {
  vi.resetAllMocks(); role('jefe');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/history') ? { history: insightHistory } : url.endsWith('/alert-settings') ? { settings: insightSettings } : { summary: insightAlerts } }));
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Workshop insights queries', () => {
  it('does not fetch unopened or inactive insights', () => {
    renderHook(() => ({ alerts: useWorkOrderAlerts(41), overview: useWorkshopAlerts('2026-11-16'), history: useWorkOrderHistory(41, 10), settings: useWorkshopAlertSettings() }), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keys history by viewer, order, service and filters and refreshes through ordinary work-order invalidation', async () => {
    renderHook(() => ({ alerts: useWorkOrderAlerts(41, true), history: useWorkOrderHistory(41, 10, { page: 2, pageSize: 10, sameVehicle: true, fechaDesde: '2026-10-01', search: 'Hilux' }, true) }), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenCalledWith('/work-orders/41/items/10/history', expect.objectContaining({ params: { page: 2, pageSize: 10, sameVehicle: true, fechaDesde: '2026-10-01', search: 'Hilux' }, signal: expect.any(AbortSignal) }));
    expect(client.getQueryCache().getAll().every((query) => query.queryKey[0] === 'work-orders' && query.queryKey[1] === 'insights' && query.queryKey[2] === 7 && query.queryKey[3] === 'jefe')).toBe(true);
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-orders'] }); });
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it.each<Role>(['mecanico', 'vendedor', 'bodeguero'])('does not request history for %s', (value) => {
    role(value, 9);
    const { result } = renderHook(() => useWorkOrderHistory(41, 10, {}, true), { wrapper });
    expect(result.current.allowed).toBe(false); expect(result.current.data).toBeUndefined(); expect(api.get).not.toHaveBeenCalled();
  });

  it('allows personal alert and read-only settings queries for a mechanic', async () => {
    role('mecanico', 9);
    renderHook(() => ({ alerts: useWorkshopAlerts('2026-11-16', true), settings: useWorkshopAlertSettings(true) }), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenCalledWith('/work-orders/operations/alerts', expect.objectContaining({ params: { fecha: '2026-11-16' } }));
  });

  it('does not request invalid history filters or dates', () => {
    renderHook(() => ({ history: useWorkOrderHistory(41, 10, { pageSize: 31, fechaDesde: '2026-11-16', fechaHasta: '2026-10-01' }, true), alerts: useWorkshopAlerts('2026-02-31', true) }), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('requires administration for settings mutations and invalidates all insights after saving', async () => {
    const { result } = renderHook(useUpdateWorkshopAlertSettingsMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ timeTolerancePercent: 0.5 })).rejects.toThrow('Solo administración'); });
    expect(api.patch).not.toHaveBeenCalled();
    act(() => role('admin'));
    const admin = renderHook(useUpdateWorkshopAlertSettingsMutation, { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { settings: { ...insightSettings, timeTolerancePercent: 0.5 } } });
    await act(async () => { await admin.result.current.mutateAsync({ timeTolerancePercent: 0.5 }); });
    expect(api.patch).toHaveBeenCalledWith('/work-orders/operations/alert-settings', { timeTolerancePercent: 0.5 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-orders', 'insights'] });
  });

  it('does not expose a supervisor history response after the viewer changes to mechanic', async () => {
    let finish: ((value: { data: { history: typeof insightHistory } }) => void) | undefined;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useWorkOrderHistory(41, 10, {}, true), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    act(() => role('mecanico', 9));
    await act(async () => finish?.({ data: { history: insightHistory } }));
    expect(result.current.data).toBeUndefined(); expect(result.current.allowed).toBe(false);
  });

  it('defaults jornada to the Santiago calendar day rather than the browser timezone', () => {
    vi.setSystemTime(new Date('2026-11-16T03:30:00Z'));
    expect(workshopInsightsToday()).toBe('2026-11-16');
  });

  it.each([
    { name: 'order alerts', read: () => useWorkOrderAlerts(41) },
    { name: 'overview alerts', read: () => useWorkshopAlerts('2026-11-16') },
    { name: 'history', read: () => useWorkOrderHistory(41, 10) },
    { name: 'settings', read: () => useWorkshopAlertSettings() },
  ])('rejects missing $name payloads with descriptive errors instead of undefined or fabricated empty results', async ({ read }) => {
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => read(), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
    await act(async () => {
      const response = await result.current.refetch();
      expect(response.isError).toBe(true);
      expect(response.error?.message).toContain('La API no devolvió');
      expect(response.data).toBeUndefined();
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
