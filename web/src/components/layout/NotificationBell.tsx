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
        className={cn('icon-button', panel.open && 'bg-brand-pale text-brand-primaryInk')}
        aria-label={count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
        aria-expanded={panel.open}
        title="Notificaciones"
      >
        {count > 0 ? (
          <BellRing className="icon text-brand-primaryInk" aria-hidden="true" />
        ) : (
          <Bell className="icon" aria-hidden="true" />
        )}
        {count > 0 && (
          <span
            className="cart-count absolute -right-0.5 -top-0.5 flex items-center justify-center px-1 text-[11px] font-semibold"
            data-testid="notification-badge"
          >
            {badge}
          </span>
        )}
      </button>

      {panel.open && (
        <div
          className="popover popover-notifications"
          role="dialog"
          aria-label="Notificaciones"
        >
          <header className="flex items-center justify-between gap-2 border-b border-brand-line px-4 py-3">
            <div>
              <p className="text-base font-semibold text-brand-ink">Notificaciones</p>
              <p className="text-xs text-brand-muted">
                {count > 0 ? `${count} sin leer` : 'Estás al día'}
              </p>
            </div>
            {count > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-line px-2.5 py-1.5 text-xs font-semibold text-brand-primaryInk transition-colors hover:bg-brand-pale disabled:opacity-50"
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
              <div className="flex min-h-32 items-center justify-center text-brand-primaryInk" role="status">
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Cargando notificaciones</span>
              </div>
            ) : notificationsQuery.isError ? (
              <p className="px-4 py-6 text-center text-sm text-brand-coralInk">
                No fue posible cargar tus notificaciones.
              </p>
            ) : items.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center px-4 py-6 text-center">
                <ClipboardList className="h-8 w-8 text-brand-line" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-brand-ink">Sin notificaciones</p>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Aquí verás las solicitudes, pagos y cambios que te conciernan.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-brand-line">
                {items.map((item) => {
                  const presentation = getNotificationPresentation(item.tipo);
                  const Icon = ICONS[presentation.icon];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void openRead(item.id, item.href)}
                        className={cn(
                          'flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition-colors hover:bg-brand-pale',
                          item.leida ? 'border-l-transparent opacity-60' : NOTIFICATION_LEVEL_STYLES[item.nivel],
                        )}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-pale text-brand-primaryInk">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', presentation.dot)} aria-hidden="true" />
                            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-brand-muted">
                              {presentation.label}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm font-semibold text-brand-ink">
                            {item.titulo}
                          </span>
                          <span className="mt-0.5 block text-xs text-brand-muted">{item.mensaje}</span>
                          <span className="mt-1 block text-[11px] text-brand-muted/70">
                            {formatRelativeTime(item.createdAt)}
                            {item.actor ? ` · ${item.actor.nombre}` : ''}
                          </span>
                        </span>
                        {!item.leida && (
                          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-brand-primaryInk" title="Sin leer">
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

          <footer className="border-t border-brand-line px-4 py-2 text-center">
            <button
              type="button"
              onClick={() => {
                panel.close();
                navigate('/dashboard');
              }}
              className="text-xs font-semibold text-brand-primaryInk hover:underline"
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
