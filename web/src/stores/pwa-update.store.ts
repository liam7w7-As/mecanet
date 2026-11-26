import { create } from 'zustand';

export type PwaCheckResult = 'available' | 'current' | 'installing' | 'offline' | 'error';

interface PwaUpdateState {
  checking: boolean;
  check: (() => Promise<PwaCheckResult>) | null;
}

export const usePwaUpdateStore = create<PwaUpdateState>(() => ({ checking: false, check: null }));
