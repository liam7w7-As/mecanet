import { create } from 'zustand';

export type ToastKind = 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let toastSequence = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) =>
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id: (toastSequence += 1), kind, message }],
    })),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export const notifySuccess = (message: string): void => {
  useToastStore.getState().push('success', message);
};

export const notifyError = (message: string): void => {
  useToastStore.getState().push('error', message);
};
