import type { PwaCheckResult } from '../stores/pwa-update.store';

export const PWA_UPDATE_INTERVAL = 60_000;

export function reloadPwaPage(): void { window.location.reload(); }

/** Checking never activates a worker or reloads an open form. */
export function monitorPwaUpdates(registration: ServiceWorkerRegistration, callbacks: {
  waiting: () => void;
  activated: () => void;
  checking: (value: boolean) => void;
}) {
  let disposed = false;
  let pending: Promise<PwaCheckResult> | null = null;
  let lastCheck = 0;
  const workers = new Map<ServiceWorker, () => void>();
  const inspect = (): PwaCheckResult => {
    if (registration.waiting && (registration.active || navigator.serviceWorker?.controller)) {
      callbacks.waiting();
      return 'available';
    }
    if (navigator.serviceWorker?.controller && registration.active && registration.active !== navigator.serviceWorker.controller) {
      callbacks.activated();
      return 'available';
    }
    return registration.installing ? 'installing' : 'current';
  };
  const watch = (worker: ServiceWorker | null) => {
    if (!worker || workers.has(worker)) return;
    const upgrade = Boolean(registration.active || navigator.serviceWorker?.controller);
    const changed = () => {
      if (disposed) return;
      if (worker.state === 'installed') inspect();
      // clientsClaim=false intentionally preserves other tabs; activation still
      // completes the reload explicitly confirmed by this tab.
      if (worker.state === 'activated' && upgrade) callbacks.activated();
    };
    workers.set(worker, changed);
    worker.addEventListener('statechange', changed);
  };
  const found = () => watch(registration.installing);
  const check = (): Promise<PwaCheckResult> => {
    if (pending) return pending;
    if (disposed) return Promise.resolve('error');
    if (navigator.onLine === false) return Promise.resolve('offline');
    if (registration.waiting) return Promise.resolve(inspect());
    lastCheck = Date.now();
    callbacks.checking(true);
    pending = (async (): Promise<PwaCheckResult> => {
      try {
        await registration.update();
        if (disposed) return 'error';
        watch(registration.installing);
        watch(registration.waiting);
        return inspect();
      } catch {
        return 'error';
      } finally {
        pending = null;
        if (!disposed) callbacks.checking(false);
      }
    })();
    return pending;
  };
  const resume = () => {
    if (document.visibilityState !== 'visible') return;
    // Re-show an already downloaded update, including after "Más tarde".
    if (registration.waiting) { inspect(); return; }
    if (Date.now() - lastCheck >= 1000) void check();
  };
  registration.addEventListener('updatefound', found);
  watch(registration.waiting);
  watch(registration.installing);
  inspect();
  void check();
  const timer = window.setInterval(resume, PWA_UPDATE_INTERVAL);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  return {
    check,
    dispose: () => {
      disposed = true;
      clearInterval(timer);
      registration.removeEventListener('updatefound', found);
      for (const [worker, handler] of workers) worker.removeEventListener('statechange', handler);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
    },
  };
}
