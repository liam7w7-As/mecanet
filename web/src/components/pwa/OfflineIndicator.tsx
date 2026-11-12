import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

export const OfflineIndicator = () => {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <div className="pwa-network-position fixed inset-x-0 top-2 z-50 flex justify-center px-3 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex min-w-0 max-w-sm items-center gap-2 rounded-2xl border border-amber-300 bg-amber-500/90 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>Sin conexión. Consultar y guardar datos requiere internet.</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
