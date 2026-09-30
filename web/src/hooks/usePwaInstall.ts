import { useEffect, useState } from 'react';

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

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    globalDeferredPrompt = event as BeforeInstallPromptEvent;
  });
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
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsAppInstalled());
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>('desktop');

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsInstalled(checkIsAppInstalled());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      globalDeferredPrompt = event as BeforeInstallPromptEvent;
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      globalDeferredPrompt = null;
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    const promptToUse = installPrompt ?? globalDeferredPrompt;

    if (promptToUse) {
      try {
        await promptToUse.prompt();
        const choice = await promptToUse.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          globalDeferredPrompt = null;
          setInstallPrompt(null);
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
    hasNativePrompt: Boolean(installPrompt ?? globalDeferredPrompt),
    showInstructions,
    platform,
    triggerInstall,
    closeInstructions,
  };
};

export default usePwaInstall;
