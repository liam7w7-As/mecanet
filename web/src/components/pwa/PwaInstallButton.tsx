import { Download } from 'lucide-react';

import PwaInstallModal from './PwaInstallModal';
import { usePwaInstall } from '../../hooks/usePwaInstall';

interface PwaInstallButtonProps {
  className?: string;
}

export const PwaInstallButton = ({ className = '' }: PwaInstallButtonProps) => {
  const { canShowInstallHelp, hasNativePrompt, showInstructions, platform, triggerInstall, closeInstructions } =
    usePwaInstall();

  // Si la app ya está instalada y ejecutándose en modo standalone, no mostramos el botón
  if (!canShowInstallHelp) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void triggerInstall()}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[#18335c] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#204379] active:scale-95 mr-1 sm:mr-2 shrink-0 ${className}`}
        title={hasNativePrompt ? 'Instalar UNITHOR en este dispositivo' : 'Ver instrucciones de instalación'}
        aria-label={hasNativePrompt ? 'Instalar aplicación UNITHOR' : 'Cómo instalar UNITHOR'}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{hasNativePrompt ? 'Instalar App' : 'Cómo instalar'}</span>
        <span className="sm:hidden">{hasNativePrompt ? 'Instalar' : 'Instalación'}</span>
      </button>

      <PwaInstallModal
        isOpen={showInstructions}
        platform={platform}
        onClose={closeInstructions}
      />
    </>
  );
};

export default PwaInstallButton;
