import {
  Banknote,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ClipboardList,
  FileText,
  LoaderCircle,
  Truck,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  NOTIFICATION_LEVEL_STYLES,
  getNotificationPresentation,
  useMarkNotificationsRead,
  useNotificationCount,
  useNotificationPanel,
  useNotifications,
} from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { notifySuccess } from '../../stores/toast.store';

import type { LucideIcon } from 'lucide-react';

const ICONS: Record<'bell' | 'wrench' | 'cash' | 'truck' | 'file', LucideIcon> = {
  bell: Bell,
  wrench: Wrench,
  cash: Banknote,
  truck: Truck,
  file: FileText,
};

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { count, badge, isLoading } = useNotificationCount();
  const panel = useNotificationPanel(() => undefined);
  const notificationsQuery = useNotifications(false);
  const markRead = useMarkNotificationsRead();

  const items = notificationsQuery.data?.items ?? [];
  const openRead = async (id: number, href: string): Promise<void> => {
    if (!notificationsQuery.data?.items.find((item) => item.id === id)?.leida) {
      await markRead.mutateAsync({ ids: [id] });
    }
    panel.close();
    navigate(href);
  };

  const markAllRead = async (): Promise<void> => {
    await markRead.mutateAsync({ todas: true });
    notifySuccess('Todas las notificaciones quedaron como leídas.');
  };

  return (
    <div className="relative" ref={panel.containerRef}>
      <button
        type="button"
        onClick={panel.toggle}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
          panel.open
            ? 'border-brand-blue bg-brand-light text-brand-blue'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
        aria-label={count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
        aria-expanded={panel.open}
        title="Notificaciones"
      >
        {count > 0 ? (
          <BellRing className="h-5 w-5 text-brand-blue" aria-hidden="true" />
        ) : (
          <Bell className="h-5 w-5" aria-hidden="true" />
        )}
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
            data-testid="notification-badge"
          >
            {badge}
          </span>
        )}
      </button>

      {panel.open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Notificaciones"
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-brand-blue">Notificaciones</p>
              <p className="text-xs text-slate-500">
                {count > 0 ? `${count} sin leer` : 'Estás al día'}
              </p>
            </div>
            {count > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {markRead.isPending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Marcar leídas
              </button>
            )}
          </header>

          <div className="max-h-[26rem] overflow-y-auto">
            {notificationsQuery.isPending ? (
              <div className="flex min-h-32 items-center justify-center text-brand-blue" role="status">
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Cargando notificaciones</span>
              </div>
            ) : notificationsQuery.isError ? (
              <p className="px-4 py-6 text-center text-sm text-red-600">
                No fue posible cargar tus notificaciones.
              </p>
            ) : items.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center px-4 py-6 text-center">
                <ClipboardList className="h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-700">Sin notificaciones</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Aquí verás las solicitudes, pagos y cambios que te conciernan.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const presentation = getNotificationPresentation(item.tipo);
                  const Icon = ICONS[presentation.icon];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void openRead(item.id, item.href)}
                        className={cn(
                          'flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                          item.leida ? 'border-l-transparent opacity-60' : NOTIFICATION_LEVEL_STYLES[item.nivel],
                        )}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', presentation.dot)} aria-hidden="true" />
                            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {presentation.label}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm font-semibold text-slate-800">
                            {item.titulo}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600">{item.mensaje}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {formatRelativeTime(item.createdAt)}
                            {item.actor ? ` · ${item.actor.nombre}` : ''}
                          </span>
                        </span>
                        {!item.leida && (
                          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-brand-blue" title="Sin leer">
                            <Check className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <button
              type="button"
              onClick={() => {
                panel.close();
                navigate('/dashboard');
              }}
              className="text-xs font-semibold text-brand-blue hover:underline"
            >
              Ver bandeja operativa
            </button>
          </footer>
        </div>
      )}

      {isLoading && <span className="sr-only">Cargando notificaciones</span>}
    </div>
  );
};

export default NotificationBell;
