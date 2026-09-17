import { CheckCircle2, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';

import { useToastStore } from '../../stores/toast.store';

const TOAST_LIFETIME_MS = 4500;

export const ToastViewport = () => {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), TOAST_LIFETIME_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isSuccess = toast.kind === 'success';
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              role={isSuccess ? 'status' : 'alert'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${
                isSuccess
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              )}
              <p className="min-w-0 flex-1 text-sm font-medium leading-5">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current opacity-60 hover:opacity-100"
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastViewport;
