import { RefreshCw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PwaReloadPrompt = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        console.info('[PWA] Service Worker registrado correctamente.');
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Error al registrar Service Worker:', error);
    },
  });

  const [isUpdating, setIsUpdating] = useState(false);

  // Auto-cerrar mensaje de offlineReady a los 4 segundos
  useEffect(() => {
    if (offlineReady) {
      const timer = setTimeout(() => {
        setOfflineReady(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [offlineReady, setOfflineReady]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.error('[PWA] Error al actualizar la aplicación:', err);
      setIsUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {(needRefresh || offlineReady) && (
        <motion.aside
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          role="region"
          aria-label="Aviso de actualización de UNITHOR"
          className="tabbar-safe fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-md"
          style={{ boxShadow: '0 20px 40px -15px rgba(24, 51, 92, 0.25)' }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#18335c] text-white shadow-md">
              {needRefresh ? (
                <Sparkles className="h-5 w-5 text-cyan-300 animate-pulse" />
              ) : (
                <RefreshCw className="h-5 w-5 text-emerald-300" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-900">
                {needRefresh ? 'Nueva versión disponible' : 'Listo para trabajar sin conexión'}
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                {needRefresh
                  ? 'Hay mejoras y nuevas funciones en UNITHOR listas para instalar.'
                  : 'La aplicación ha sido descargada para cargarse de forma instantánea.'}
              </p>

              {needRefresh && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#18335c] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[#204379] active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? 'Actualizando...' : 'Actualizar ahora'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNeedRefresh(false)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    Más tarde
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (needRefresh) setNeedRefresh(false);
                if (offlineReady) setOfflineReady(false);
              }}
              aria-label="Cerrar notificación"
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default PwaReloadPrompt;
