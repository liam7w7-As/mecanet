import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useCatalogEvents } from '../useCatalogEvents';

import type { UserPublic } from '../../stores/auth.store';
import type { ReactNode } from 'react';

class FakeEventSource extends EventTarget {
  static connections: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string, readonly options: EventSourceInit) {
    super();
    FakeEventSource.connections.push(this);
  }
}

const admin: UserPublic = { id: 1, role: 'admin', nombre: 'Admin', email: 'admin@test.cl' };

describe('catalog SSE subscription lifecycle', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.connections = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    client = new QueryClient();
    useAuthStore.setState({ user: admin });
  });
  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useAuthStore.setState({ user: null });
  });

  it('shares one credentialed connection and invalidates active catalog caches', () => {
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    const first = renderHook(useCatalogEvents, { wrapper });
    const second = renderHook(useCatalogEvents, { wrapper });
    expect(FakeEventSource.connections).toHaveLength(1);
    const source = FakeEventSource.connections[0];
    expect(source.url).toBe('/api/catalog/events');
    expect(source.options).toEqual({ withCredentials: true });
    act(() => { source.dispatchEvent(new Event('catalog-changed')); });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['catalog'] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['dp-configuration'] });
    first.unmount();
    expect(source.close).not.toHaveBeenCalled();
    second.unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('closes the connection on logout or loss of read permissions', () => {
    renderHook(useCatalogEvents, { wrapper });
    const source = FakeEventSource.connections[0];
    act(() => { useAuthStore.setState({ user: { ...admin, role: 'vendedor', permissions: [] } }); });
    expect(source.close).toHaveBeenCalledOnce();
    act(() => { useAuthStore.setState({ user: null }); });
    expect(FakeEventSource.connections).toHaveLength(1);
  });

  it('renews authentication through Axios before reconnecting and refreshes after ready', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: {} });
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    const rendered = renderHook(useCatalogEvents, { wrapper });
    act(() => { FakeEventSource.connections[0].onerror?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(get).toHaveBeenCalledWith('/catalog', expect.objectContaining({ params: { page: 1, pageSize: 1 } }));
    expect(FakeEventSource.connections).toHaveLength(2);
    act(() => { FakeEventSource.connections[1].dispatchEvent(new Event('ready')); });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['catalog'] });
    rendered.unmount();
  });

  it('does not retry forever after permission denial and cancels retry on unmount', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    const rendered = renderHook(useCatalogEvents, { wrapper });
    act(() => { FakeEventSource.connections[0].onerror?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(FakeEventSource.connections).toHaveLength(1);
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not connect without a session', () => {
    useAuthStore.setState({ user: null });
    renderHook(useCatalogEvents, { wrapper });
    expect(FakeEventSource.connections).toHaveLength(0);
  });
});
