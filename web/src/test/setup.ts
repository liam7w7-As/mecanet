import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';

import { flushFormDrafts } from '../lib/form-recovery';

// Node's structuredClone cannot clone jsdom Blob objects; browsers can.
const nativeClone = globalThis.structuredClone;
const browserClone = <T>(value: T): T => {
  if (value instanceof Blob) return value.slice(0, value.size, value.type) as T;
  if (Array.isArray(value)) return value.map(browserClone) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, browserClone(item)]),
    ) as T;
  }
  return nativeClone(value);
};
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: new IDBFactory(),
  });
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    writable: true,
    value: browserClone,
  });
});
afterEach(async () => {
  cleanup();
  await flushFormDrafts();
});

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
