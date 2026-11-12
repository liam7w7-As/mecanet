import { RefreshCw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PwaReloadPrompt = () => {
  const reloadRequested = useRef(false);
  const [workerActivated, setWorkerActivated] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      // Otro tab puede activar el SW. Solo recargar si ESTE tab lo confirmó.
      if (reloadRequested.current) window.location.reload();
      else setWorkerActivated(true);
    },
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
    reloadRequested.current = true;
    setIsUpdating(true);
    setUpdateError(false);
    try {
      if (workerActivated) window.location.reload();
      else await updateServiceWorker(true);
    } catch (err) {
      console.error('[PWA] Error al actualizar la aplicación:', err);
      reloadRequested.current = false;
      setUpdateError(true);
      setIsUpdating(false);
    }
  };

  const dismiss = () => {
    setIsConfirming(false);
    setNeedRefresh(false);
    setOfflineReady(false);
    setWorkerActivated(false);
  };

  return (
    <AnimatePresence>
      {(needRefresh || workerActivated || offlineReady) && (
        <motion.aside
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          role="region"
          aria-label="Aviso de actualización de UNITHOR"
          className="pwa-reload-prompt tabbar-safe fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-md"
          style={{ boxShadow: '0 20px 40px -15px rgba(24, 51, 92, 0.25)' }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#18335c] text-white shadow-md">
              {needRefresh || workerActivated ? (
                <Sparkles className="h-5 w-5 text-cyan-300 animate-pulse" />
              ) : (
                <RefreshCw className="h-5 w-5 text-emerald-300" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-900">
                {needRefresh || workerActivated ? 'Nueva versión disponible' : 'Interfaz disponible sin conexión'}
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                {needRefresh || workerActivated
                  ? 'Guarda tus cambios antes de actualizar. La aplicación se recargará.'
                  : 'Consultar y guardar datos requiere conexión. Los datos privados no se almacenan en la caché de la aplicación.'}
              </p>

              {updateError && <p role="alert" className="mt-2 text-xs text-red-700">No se pudo actualizar. Puedes volver a intentarlo.</p>}
              {(needRefresh || workerActivated) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isConfirming && <p className="w-full text-xs text-slate-600">Los cambios sin guardar en esta pestaña se perderán al recargar.</p>}
                  <button
                    type="button"
                    onClick={() => { if (isConfirming) void handleUpdate(); else setIsConfirming(true); }}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#18335c] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[#204379] active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? 'Actualizando...' : isConfirming ? 'Actualizar y recargar' : 'Actualizar ahora'}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    disabled={isUpdating}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    Más tarde
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={dismiss}
              disabled={isUpdating}
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
