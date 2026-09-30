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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-500/90 px-3.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sin conexión a internet (Modo Offline)</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
