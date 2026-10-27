import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  LoaderCircle,
  Timer,
  Users,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { PageLoader } from '../../components/common/LoadingIndicator';
import {
  downloadWorkshopDailyReportPdf,
  useWorkshopDailyReport,
} from '../../hooks/useWorkOrderLabor';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { notifyError, notifySuccess } from '../../stores/toast.store';

const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatHours = (value: number): string => `${value.toFixed(2)} h`;

const formatMinutes = (minutes: number): string => {
  const safe = Math.max(0, minutes);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
};

const ROLE_LABELS: Record<string, string> = {
  jefe: 'Jefe de taller',
  mecanico: 'Mecánico',
  admin: 'Administrador',
  desarrollador: 'Desarrollador',
};

export const WorkshopDailyReportPage = () => {
  const [fecha, setFecha] = useState(() => toDateInput(new Date()));
  const [downloading, setDownloading] = useState(false);
  const reportQuery = useWorkshopDailyReport(fecha);

  const downloadPdf = async (): Promise<void> => {
    setDownloading(true);
    try {
      await downloadWorkshopDailyReportPdf(fecha);
      notifySuccess('Reporte diario descargado.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el reporte diario.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-muted">Control interno de taller</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-primaryInk sm:text-3xl">
            Reporte diario de horas
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Avance de jefes de taller y mecánicos en la fecha seleccionada. No incluye precios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-lg border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-muted">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="h-8 rounded-md border border-brand-line bg-white px-2 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary"
              aria-label="Fecha del reporte"
            />
          </label>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primaryInkHover disabled:opacity-60"
            onClick={() => void downloadPdf()}
            disabled={downloading || reportQuery.isPending}
          >
            {downloading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Descargar PDF
          </button>
        </div>
      </header>

      {reportQuery.isPending ? (
        <PageLoader label="Generando reporte diario..." />
      ) : reportQuery.isError || !reportQuery.data ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-coral/30 bg-brand-coralPale p-5 text-sm text-brand-coralInk" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(reportQuery.error, 'No se pudo cargar el reporte diario.')}
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Horas registradas
              </p>
              <p className="mt-1 text-2xl font-black text-brand-primaryInk">
                {formatHours(reportQuery.data.totalHoras)}
              </p>
              <p className="mt-1 text-xs text-brand-muted">{reportQuery.data.totalSesiones} sesiones</p>
            </div>
            <div className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Trabajos completados
              </p>
              <p className="mt-1 text-2xl font-black text-brand-mintInk">
                {reportQuery.data.totalItemsCompletados}
              </p>
              <p className="mt-1 text-xs text-brand-muted">en la fecha seleccionada</p>
            </div>
            <div className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Personas en curso
              </p>
              <p className="mt-1 text-2xl font-black text-brand-goldInk">
                {reportQuery.data.usuarios.filter((user) => user.enCurso).length}
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                de {reportQuery.data.usuarios.length} activas
              </p>
            </div>
            <div className="rounded-xl border border-brand-line bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Órdenes con actividad
              </p>
              <p className="mt-1 text-2xl font-black text-brand-ink">
                {reportQuery.data.ordenes.length}
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                Generado {formatDateTime(reportQuery.data.generadoEn)}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-brand-line px-4 py-3">
              <Users className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
                Avance por persona
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-brand-line/40 text-xs uppercase tracking-wide text-brand-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Persona</th>
                    <th className="px-4 py-3 font-semibold">Rol</th>
                    <th className="px-4 py-3 text-right font-semibold">Horas</th>
                    <th className="px-4 py-3 text-right font-semibold">Sesiones</th>
                    <th className="px-4 py-3 text-right font-semibold">Completados</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reportQuery.data.usuarios.map((user) => (
                    <tr key={user.id} className="border-t border-brand-line align-top">
                      <td className="px-4 py-3 font-semibold text-brand-ink">
                        {user.nombre}
                        {user.detalle.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {user.detalle.map((detail, index) => (
                              <li
                                key={`${detail.workOrderId}-${detail.itemDescripcion}-${index}`}
                                className="text-xs font-normal text-brand-muted"
                              >
                                <span className="font-mono font-semibold text-brand-primaryInk">
                                  {detail.workOrderCodigo}
                                </span>{' '}
                                · {detail.itemDescripcion} · {formatMinutes(detail.minutos)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-brand-muted">
                        {ROLE_LABELS[user.rol] ?? user.rol}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-brand-primaryInk">
                        {formatHours(user.horas)}
                      </td>
                      <td className="px-4 py-3 text-right text-brand-muted">{user.sesiones}</td>
                      <td className="px-4 py-3 text-right text-brand-muted">
                        {user.itemsCompletados}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            user.enCurso
                              ? 'bg-brand-goldPale text-brand-goldInk'
                              : user.sesiones > 0
                                ? 'bg-brand-mintPale text-brand-mintInk'
                                : 'bg-brand-pale text-brand-muted'
                          }`}
                        >
                          {user.enCurso ? (
                            <Clock className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          {user.enCurso
                            ? 'En curso'
                            : user.sesiones > 0
                              ? 'Con actividad'
                              : 'Sin actividad'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-brand-line px-4 py-3">
              <FileText className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
                Órdenes con actividad
              </h2>
            </div>
            {reportQuery.data.ordenes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-muted">
                Sin actividad registrada en la fecha seleccionada.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-brand-line/40 text-xs uppercase tracking-wide text-brand-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">OT</th>
                      <th className="px-4 py-3 font-semibold">Patente</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 text-right font-semibold">Horas</th>
                      <th className="px-4 py-3 text-right font-semibold">Completados</th>
                      <th className="px-4 py-3 font-semibold">Mecánicos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportQuery.data.ordenes.map((order) => (
                      <tr key={order.id} className="border-t border-brand-line">
                        <td className="px-4 py-3 font-mono font-bold text-brand-primaryInk">
                          {order.codigo}
                        </td>
                        <td className="px-4 py-3 font-mono text-brand-ink">
                          {order.patente ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-brand-muted">{order.estado}</td>
                        <td className="px-4 py-3 text-right font-bold text-brand-primaryInk">
                          {formatHours(order.horas)}
                        </td>
                        <td className="px-4 py-3 text-right text-brand-muted">
                          {order.completados}
                        </td>
                        <td className="px-4 py-3 text-brand-muted">
                          {order.mecanicos.join(', ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default WorkshopDailyReportPage;
