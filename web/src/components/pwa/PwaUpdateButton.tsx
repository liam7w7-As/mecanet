import { RefreshCw } from 'lucide-react';

import { usePwaUpdateStore } from '../../stores/pwa-update.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

export default function PwaUpdateButton({ onClick, className = '', menuItem = false }: {
  onClick?: () => void;
  className?: string;
  menuItem?: boolean;
}) {
  const check = usePwaUpdateStore((state) => state.check);
  const checking = usePwaUpdateStore((state) => state.checking);
  if (!('serviceWorker' in navigator)) return null;
  const run = async () => {
    if (!check || checking) return;
    onClick?.();
    const result = await check();
    if (result === 'current') notifySuccess('La aplicación ya está actualizada.');
    if (result === 'installing') notifySuccess('Descargando la nueva versión. Te avisaremos cuando esté lista.');
    if (result === 'offline') notifyError('Conéctate a internet para buscar actualizaciones.');
    if (result === 'error') notifyError('No se pudo buscar la actualización. Puedes volver a intentarlo.');
  };
  return <button type="button" role={menuItem ? 'menuitem' : undefined} className={className}
    disabled={!check || checking} onClick={() => void run()}>
    <RefreshCw aria-hidden="true" className={`h-4 w-4 shrink-0 ${checking ? 'animate-spin' : ''}`} />
    <span>{checking ? 'Buscando actualizaciones…' : 'Buscar actualizaciones'}</span>
  </button>;
}
