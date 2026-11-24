import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useWorkshopDailyLog } from '../useWorkshopDailyLog';

import type { WorkshopTimeEntry, WorkshopTimeJournal, WorkshopTimeRequestRecord } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const base = { workOrderId: 12, workOrderCode: 'OT-26-12', itemId: 20, description: 'Puerta', userId: 9 };
const entry: WorkshopTimeEntry = {
  ...base, dpStageId: 51, id: 1, userName: 'Armador', kind: 'manual', overtime: false,
  status: 'cerrada', startedAt: '2026-11-20T12:00:00Z', endedAt: '2026-11-20T13:00:00Z',
  durationMinutes: 60, minutesOnDate: 60, note: null, supersededAt: null, scheduledEndAt: null,
};
const request: WorkshopTimeRequestRecord = {
  ...base, dpStageId: 54, id: 2, userName: 'Armador', kind: 'manual', overtime: false,
  status: 'pendiente', startedAt: '2026-11-20T13:00:00Z', endedAt: '2026-11-20T13:30:00Z',
  durationMinutes: 30, minutesOnDate: 30, note: 'Prueba de montaje', activityStatus: 'en_proceso',
  sourceSessionId: null, replacementSessionId: null, createdBy: 9, createdAt: '2026-11-20T13:30:00Z',
  reviewedBy: null, reviewedAt: null, reviewNote: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ user: { id: 9, role: 'mecanico', nombre: 'Armador', email: 'test@example.invalid' }, isLoading: false, isAuthenticated: true });
});

describe('daily log stage identity', () => {
  it('keeps hours and eligibility separate for desarme and montaje of the same piece', async () => {
    const journal: WorkshopTimeJournal = {
      entries: [entry], requests: [request], workers: [{ id: 9, nombre: 'Armador' }],
      date: '2026-11-20', totals: { registeredMinutes: 60, pendingMinutes: 30, scheduledMinutes: null, unregisteredMinutes: null },
    };
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/workshop-time' ? journal : { items: [
      { ...base, patente: 'AB-CD-12', division: 'DP', dpStageId: 51, dpStageLabel: 'Desarme', blocked: false },
      { ...base, patente: 'AB-CD-12', division: 'DP', dpStageId: 54, dpStageLabel: 'Montaje', blocked: true },
    ] } }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useWorkshopDailyLog('2026-11-20'), { wrapper });
    await waitFor(() => expect(result.current.eligible.isSuccess && result.current.journal.isSuccess).toBe(true));
    const services = result.current.orders[0].services;
    expect(services).toHaveLength(2);
    expect(services.find((service) => service.dpStageId === 51)).toMatchObject({ eligible: true, registeredMinutes: 60, pendingMinutes: 0 });
    expect(services.find((service) => service.dpStageId === 54)).toMatchObject({ eligible: false, registeredMinutes: 0, pendingMinutes: 30, blocked: true });
  });
});
