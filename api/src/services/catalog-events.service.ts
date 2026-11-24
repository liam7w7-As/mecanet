import { randomUUID } from 'node:crypto';

// Only invalidation signals are broadcast. Records and prices are fetched again
// through the ordinary authenticated/authorized catalog endpoints.
const listeners = new Set<(revision: string) => void>();

export const publishCatalogChange = (): void => {
  const revision = randomUUID();
  for (const listener of listeners) {
    try {
      listener(revision);
    } catch {
      // A disconnected streaming client must not fail an already committed save.
      listeners.delete(listener);
    }
  }
};

export const subscribeCatalogChanges = (listener: (revision: string) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
