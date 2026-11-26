import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { monitorPwaUpdates, PWA_UPDATE_INTERVAL } from '../pwa-updates';

function registrationFixture() {
  const active = Object.assign(new EventTarget(), { state: 'activated' as ServiceWorkerState });
  const registration = Object.assign(new EventTarget(), {
    active: active as unknown as ServiceWorker | null,
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
    update: vi.fn<() => Promise<ServiceWorkerRegistration>>(),
  });
  registration.update.mockResolvedValue(registration as unknown as ServiceWorkerRegistration);
  return registration;
}

describe('PWA update detection while resuming a mobile app', () => {
  let dispose: (() => void) | undefined;
  const callbacks = { waiting: vi.fn(), activated: vi.fn(), checking: vi.fn() };
  const mount = (registration: ReturnType<typeof registrationFixture>) => {
    const monitor = monitorPwaUpdates(registration as unknown as ServiceWorkerRegistration, callbacks);
    dispose = monitor.dispose;
    return monitor;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
    vi.clearAllMocks();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: null } });
  });
  afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.useRealTimers(); Reflect.deleteProperty(navigator, 'serviceWorker'); });

  it('checks immediately and deduplicates simultaneous checks without activating or reloading', async () => {
    const registration = registrationFixture();
    const monitor = mount(registration);
    expect(await monitor.check()).toBe('current');
    expect(registration.update).toHaveBeenCalledOnce();
    expect(callbacks.activated).not.toHaveBeenCalled();
    expect(callbacks.waiting).not.toHaveBeenCalled();
    expect(callbacks.checking.mock.calls).toEqual([[true], [false]]);
  });
  it('checks periodically only while visible and checks again when returning from background', async () => {
    const registration = registrationFixture();
    await mount(registration).check();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(PWA_UPDATE_INTERVAL);
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(PWA_UPDATE_INTERVAL);
    expect(registration.update).toHaveBeenCalledTimes(3);
  });
  it('checks after reconnecting or restoring the app without duplicate focus/page events', async () => {
    const registration = registrationFixture();
    const monitor = mount(registration);
    await monitor.check();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await monitor.check()).toBe('offline');
    expect(registration.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
  it('rediscovers an already waiting update when resuming, including after dismissal', async () => {
    const registration = registrationFixture();
    await mount(registration).check();
    registration.waiting = Object.assign(new EventTarget(), { state: 'installed' }) as unknown as ServiceWorker;
    window.dispatchEvent(new Event('focus'));
    expect(callbacks.waiting).toHaveBeenCalledOnce();
    expect(callbacks.activated).not.toHaveBeenCalled();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
  it('observes activation without clientsClaim/controllerchange', async () => {
    const registration = registrationFixture();
    const monitor = mount(registration);
    await monitor.check();
    const worker = Object.assign(new EventTarget(), { state: 'installing' as ServiceWorkerState });
    registration.installing = worker as unknown as ServiceWorker;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = worker as unknown as ServiceWorker;
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(callbacks.waiting).toHaveBeenCalled();
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    expect(callbacks.activated).toHaveBeenCalledOnce();
  });
  it('does not describe the first install as an update', async () => {
    const registration = registrationFixture();
    registration.active = null;
    const worker = Object.assign(new EventTarget(), { state: 'installing' as ServiceWorkerState });
    registration.installing = worker as unknown as ServiceWorker;
    await mount(registration).check();
    worker.state = 'activated'; worker.dispatchEvent(new Event('statechange'));
    expect(callbacks.activated).not.toHaveBeenCalled();
  });
  it('allows retry after an update error and removes all checks on unmount', async () => {
    const registration = registrationFixture();
    registration.update.mockRejectedValueOnce(new Error('Network unavailable'));
    const monitor = mount(registration);
    expect(await monitor.check()).toBe('error');
    expect(await monitor.check()).toBe('current');
    monitor.dispose();
    await vi.advanceTimersByTimeAsync(PWA_UPDATE_INTERVAL * 2);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(await monitor.check()).toBe('error');
  });
});
