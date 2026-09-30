import { Download } from 'lucide-react';

import { usePwaInstall } from '../../hooks/usePwaInstall';

interface PwaInstallButtonProps {
  className?: string;
}

export const PwaInstallButton = ({ className = '' }: PwaInstallButtonProps) => {
  const { isInstallable, triggerInstall } = usePwaInstall();

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      onClick={() => void triggerInstall()}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-[#18335c] px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[#204379] active:scale-95 ${className}`}
      title="Instalar UNITHOR en este dispositivo"
    >
      <Download className="h-3.5 w-3.5" />
      <span>Instalar App</span>
    </button>
  );
};

export default PwaInstallButton;
