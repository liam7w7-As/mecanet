import { z } from 'zod';

const DB_NAME = 'unithor-form-recovery';
const STORE = 'forms';
export interface SavedForm<T> {
  key: string;
  userId: number;
  draftId: string;
  version: 1;
  updatedAt: number;
  payload: T;
}
const keyFor = (userId: number, form: string) => userId + ':' + form;
const queues = new Map<string, Promise<unknown>>();
const ordered = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(key, pending);
  const cleanup = () => {
    if (queues.get(key) === pending) queues.delete(key);
  };
  void pending.then(cleanup, cleanup);
  return pending;
};
export const flushFormDrafts = async (): Promise<void> => {
  while (queues.size) await Promise.allSettled([...queues.values()]);
};
const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('El almacenamiento local no está disponible'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la recuperación'));
    request.onblocked = () => reject(new Error('El almacenamiento está ocupado'));
  });
const getRecord = async (key: string): Promise<unknown> => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      tx.oncomplete = () => resolve(request.result as unknown);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
};
const changeRecord = async (
  key: string,
  change: (current: unknown) => SavedForm<unknown> | null | undefined,
): Promise<void> => {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(key);
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const value = change(request.result as unknown);
          if (value === null) store.delete(key);
          else if (value !== undefined) store.put(value);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
};
const ownerOf = (value: unknown): string | null =>
  typeof value === 'object' &&
  value !== null &&
  'draftId' in value &&
  typeof value.draftId === 'string'
    ? value.draftId
    : null;

export const saveFormDraft = <T>(
  userId: number,
  form: string,
  payload: T,
  draftId: string,
): Promise<void> => {
  const key = keyFor(userId, form);
  return ordered(key, () =>
    changeRecord(key, (current) => {
      if (ownerOf(current) && ownerOf(current) !== draftId)
        throw new Error('Existe otra captura pendiente');
      const updatedAt = Date.now();
      return { key, userId, draftId, version: 1, updatedAt, payload };
    }),
  );
};
export const deleteFormDraft = (userId: number, form: string, draftId?: string): Promise<void> => {
  const key = keyFor(userId, form);
  return ordered(key, () =>
    changeRecord(key, (current) => (!draftId || ownerOf(current) === draftId ? null : undefined)),
  );
};
export const loadFormDraft = <T>(
  userId: number,
  form: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<SavedForm<T> | null> => {
  const key = keyFor(userId, form);
  return ordered(key, async () => {
    const value = await getRecord(key);
    if (value === undefined) return null;
    const result = z
      .object({
        key: z.literal(key),
        userId: z.literal(userId),
        draftId: z.string(),
        version: z.literal(1),
        updatedAt: z.number(),
        payload: schema,
      })
      .safeParse(value);
    if (!result.success) {
      await changeRecord(key, () => null);
      return null;
    }
    return result.data as SavedForm<T>;
  });
};
