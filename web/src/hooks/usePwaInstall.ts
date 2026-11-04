import { useEffect, useState, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Captura global temprana del evento por si se dispara antes de montar componentes React
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
const setDeferredPrompt = (prompt: BeforeInstallPromptEvent | null): void => {
  globalDeferredPrompt = prompt;
  promptListeners.forEach((listener) => listener());
};
const subscribeToPrompt = (listener: () => void): (() => void) => {
  promptListeners.add(listener);
  return () => { promptListeners.delete(listener); };
};
const getDeferredPrompt = (): BeforeInstallPromptEvent | null => globalDeferredPrompt;
const getServerPrompt = (): null => null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setDeferredPrompt(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setDeferredPrompt(null));
}

export type DevicePlatform = 'ios' | 'android' | 'desktop';

export const detectPlatform = (): DevicePlatform => {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

export const checkIsAppInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandaloneDisplay =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
  const isIosStandalone =
    (window.navigator as unknown as { standalone?: boolean })?.standalone === true;

  return isStandaloneDisplay || isIosStandalone;
};

export const usePwaInstall = () => {
  const installPrompt = useSyncExternalStore(subscribeToPrompt, getDeferredPrompt, getServerPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsAppInstalled());
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>('desktop');

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsInstalled(checkIsAppInstalled());

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstructions(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    const promptToUse = getDeferredPrompt();

    if (promptToUse) {
      // El navegador permite invocar cada evento una sola vez, incluso si
      // se cancela. Todos los botones deben consumir la misma referencia.
      setDeferredPrompt(null);
      try {
        await promptToUse.prompt();
        const choice = await promptToUse.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setShowInstructions(false);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('[PWA] Error al invocar prompt nativo de instalación:', err);
      }
    }

    // Si no hay prompt nativo disponible (ej. iOS Safari, dev mode o Chrome en móvil previo a heurísticas),
    // mostramos el modal visual con instrucciones paso a paso para el dispositivo correspondiente.
    setShowInstructions(true);
    return false;
  };

  const closeInstructions = () => {
    setShowInstructions(false);
  };

  return {
    isInstallable: !isInstalled,
    isInstalled,
    hasNativePrompt: Boolean(installPrompt),
    showInstructions,
    platform,
    triggerInstall,
    closeInstructions,
  };
};

export default usePwaInstall;
