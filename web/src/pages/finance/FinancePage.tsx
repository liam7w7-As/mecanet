import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  Download,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  Scale,
  WalletCards,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useCloseCashDayMutation,
  useDailyCashSummary,
  useFinanceSummary,
  useVerifyPaymentMutation,
} from '../../hooks/useFinance';
import { useDownloadCommercialExcel } from '../../hooks/usePayments';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { Payment } from '../../types/entities';
import type { LucideIcon } from 'lucide-react';

const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  otro: 'Otro',
};

const statusStyles = {
  confirmado: 'bg-emerald-100 text-emerald-800',
  por_verificar: 'bg-amber-100 text-amber-900',
  rechazado: 'bg-red-100 text-red-800',
};

const statusLabels = {
  confirmado: 'Confirmado',
  por_verificar: 'Por verificar',
  rechazado: 'Rechazado',
};

interface MetricProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}

const Metric = ({ label, value, detail, icon: Icon, tone }: MetricProps) => (
  <div className="min-h-36 border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p className="mt-4 text-2xl font-bold text-brand-blue">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>
);

interface ReviewState {
  payment: Payment;
  decision: 'aprobar' | 'rechazar';
}

const reportRange = (): { fechaDesde: string; fechaHasta: string } => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    fechaDesde: start.toISOString().slice(0, 10),
    fechaHasta: now.toISOString().slice(0, 10),
  };
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const FinancePage = () => {
  const summaryQuery = useFinanceSummary();
  const verifyMutation = useVerifyPaymentMutation();
  const closeDayMutation = useCloseCashDayMutation();
  const downloadMutation = useDownloadCommercialExcel();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const dailyQuery = useDailyCashSummary(selectedDate);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [comment, setComment] = useState('');
  const [showClosure, setShowClosure] = useState(false);
  const [declaredCash, setDeclaredCash] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const summary = summaryQuery.data;
  const daily = dailyQuery.data;

  const openReview = (payment: Payment, decision: ReviewState['decision']): void => {
    setComment('');
    setReview({ payment, decision });
  };

  const submitReview = (): void => {
    if (!review) return;
    verifyMutation.mutate(
      {
        paymentId: review.payment.id,
        data: { decision: review.decision, comentario: comment.trim() || undefined },
      },
      {
        onSuccess: () => {
          notifySuccess(
            review.decision === 'aprobar'
              ? 'Transferencia confirmada y saldo actualizado.'
              : 'Transferencia rechazada sin afectar el monto pagado.',
          );
          setReview(null);
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo revisar el pago.')),
      },
    );
  };

  const openClosure = (): void => {
    setDeclaredCash(String(daily?.totals.byMethod.efectivo ?? 0));
    setClosureNotes('');
    setShowClosure(true);
  };

  const submitClosure = (): void => {
    closeDayMutation.mutate(
      {
        fecha: selectedDate,
        efectivoDeclarado: Number(declaredCash),
        observaciones: closureNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          notifySuccess(`Caja del ${selectedDate} cerrada correctamente.`);
          setShowClosure(false);
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo cerrar la caja.')),
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Control de caja y cobranza</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Finanzas / Contabilidad</h1>
          <p className="mt-1 text-sm text-slate-500">Confirma transferencias, revisa recaudación y controla saldos pendientes.</p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => downloadMutation.mutate(reportRange())}
          disabled={downloadMutation.isPending}
        >
          {downloadMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Exportar mes a Excel
        </button>
      </header>

      {(summaryQuery.isError || dailyQuery.isError || downloadMutation.isError) && (
        <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(summaryQuery.error ?? dailyQuery.error ?? downloadMutation.error, 'No fue posible cargar el panel financiero.')}
        </div>
      )}

      {summaryQuery.isPending && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cargando panel financiero">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse border border-slate-200 bg-white" />)}
        </div>
      )}

      {summary && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores financieros">
            <Metric label="Recaudación de hoy" value={formatClp(summary.metrics.revenueToday)} detail="Pagos confirmados durante la jornada" icon={Banknote} tone="bg-emerald-100 text-emerald-700" />
            <Metric label="Recaudación del mes" value={formatClp(summary.metrics.revenueMonth)} detail="Pagos confirmados desde el día 1" icon={WalletCards} tone="bg-yellow-100 text-yellow-800" />
            <Metric label="Saldo por cobrar" value={formatClp(summary.metrics.receivableTotal)} detail={`${summary.metrics.receivableCount} cotización(es) con saldo`} icon={ReceiptText} tone="bg-blue-100 text-brand-blue" />
            <Metric label="Transferencias pendientes" value={String(summary.metrics.pendingTransferCount)} detail={`${formatClp(summary.metrics.pendingTransferAmount)} por verificar`} icon={Clock3} tone="bg-amber-100 text-amber-800" />
          </section>

          <section className="overflow-hidden border border-slate-200 bg-white shadow-sm" aria-labelledby="cash-count-title">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 id="cash-count-title" className="font-bold text-brand-blue">Arqueo y cierre diario</h2>
                <p className="mt-1 text-sm text-slate-500">Totales confirmados agrupados por método de pago.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                <span className="sr-only">Fecha del arqueo</span>
                <input type="date" value={selectedDate} max={todayIso()} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" aria-label="Fecha del arqueo" />
              </label>
            </div>
            {dailyQuery.isPending ? (
              <div className="flex min-h-36 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-brand-blue" aria-label="Cargando arqueo" /></div>
            ) : daily && (
              <div className="grid lg:grid-cols-[2fr_1fr]">
                <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-3 lg:border-b-0 lg:border-r">
                  {Object.entries(daily.totals.byMethod).map(([method, amount]) => <div key={method} className="border-b border-r border-slate-100 p-4 last:border-r-0"><p className="text-xs font-semibold uppercase text-slate-500">{methodLabels[method] ?? method}</p><p className="mt-2 text-lg font-bold text-slate-800">{formatClp(amount)}</p></div>)}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-slate-500">Total confirmado</p><p className="mt-2 text-2xl font-bold text-brand-blue">{formatClp(daily.totals.confirmedTotal)}</p></div><span className={`rounded px-2 py-1 text-xs font-bold ${daily.isClosed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-brand-blue'}`}>{daily.isClosed ? 'Caja cerrada' : 'Caja abierta'}</span></div>
                  {daily.totals.pendingTransferCount > 0 && <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{daily.totals.pendingTransferCount}</strong> transferencia(s) por {formatClp(daily.totals.pendingTransferAmount)} impiden cerrar la jornada.</div>}
                  {daily.closure ? <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">Efectivo esperado</span><strong>{formatClp(daily.closure.efectivoEsperado)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Efectivo declarado</span><strong>{formatClp(daily.closure.efectivoDeclarado)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Diferencia</span><strong className={daily.closure.diferenciaEfectivo === 0 ? 'text-emerald-700' : 'text-red-700'}>{formatClp(daily.closure.diferenciaEfectivo)}</strong></div><p className="pt-2 text-xs text-slate-500">Cerrada por {daily.closure.closer?.nombre ?? 'usuario eliminado'} · {formatDateTime(daily.closure.closedAt)}</p></div> : <button type="button" className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark disabled:cursor-not-allowed disabled:opacity-50" disabled={daily.totals.pendingTransferCount > 0} onClick={openClosure}><LockKeyhole className="h-4 w-4" aria-hidden="true" />Cerrar caja del día</button>}
                </div>
              </div>
            )}
          </section>

          <section className="overflow-hidden border border-slate-200 bg-white shadow-sm" aria-labelledby="pending-transfers-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <div>
                <h2 id="pending-transfers-title" className="font-bold text-brand-blue">Transferencias por verificar</h2>
                <p className="mt-1 text-sm text-slate-500">Estos montos reservan saldo, pero aún no cuentan como pagados.</p>
              </div>
              <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{summary.metrics.pendingTransferCount} pendiente(s)</span>
            </div>
            {summary.pendingTransfers.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
                <Check className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No hay transferencias pendientes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Cotización</th><th className="px-4 py-3 font-semibold">Cliente</th><th className="px-4 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Referencia</th><th className="px-4 py-3 text-right font-semibold">Monto</th><th className="px-4 py-3 text-right font-semibold">Decisión</th></tr></thead>
                  <tbody>{summary.pendingTransfers.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="px-4 py-3"><Link to={`/quotations/${payment.quotationId}`} className="font-mono font-bold text-brand-blue hover:underline">{payment.quotation?.codigo ?? `COT #${payment.quotationId}`}</Link></td>
                      <td className="px-4 py-3 text-slate-700">{payment.quotation?.client?.nombre ?? 'Sin cliente'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(payment.fecha)}</td>
                      <td className="max-w-56 px-4 py-3 text-slate-600">{payment.referencia || 'Sin referencia'}</td>
                      <td className="px-4 py-3 text-right font-bold text-brand-blue">{formatClp(payment.monto)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white" onClick={() => openReview(payment, 'aprobar')}><Check className="h-4 w-4" aria-hidden="true" />Aprobar</button><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700" onClick={() => openReview(payment, 'rechazar')}><X className="h-4 w-4" aria-hidden="true" />Rechazar</button></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-5 xl:grid-cols-[3fr_2fr]">
            <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-brand-blue">Movimientos recientes</h2><p className="mt-1 text-sm text-slate-500">Últimos pagos y verificaciones registradas.</p></div>
              <div className="divide-y divide-slate-100">
                {summary.recentPayments.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay movimientos registrados.</p> : summary.recentPayments.map((payment) => {
                  const status = payment.estado ?? 'confirmado';
                  return <div key={payment.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-brand-blue"><Landmark className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><Link to={`/quotations/${payment.quotationId}`} className="font-mono text-sm font-bold text-brand-blue hover:underline">{payment.quotation?.codigo ?? `COT #${payment.quotationId}`}</Link><span className="block truncate text-xs text-slate-500">{methodLabels[payment.metodo ?? ''] ?? payment.metodo ?? 'Sin método'} · {payment.creator?.nombre ?? 'Sin receptor'}</span></span><span className={`rounded px-2 py-1 text-xs font-semibold ${statusStyles[status]}`}>{statusLabels[status]}</span><span className="w-28 text-right text-sm font-bold text-slate-800">{formatClp(payment.monto)}</span></div>;
                })}
              </div>
            </div>

            <aside className="overflow-hidden border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-brand-blue">Cobranza pendiente</h2><p className="mt-1 text-sm text-slate-500">Cotizaciones priorizadas por actividad reciente.</p></div>
              <div className="divide-y divide-slate-100">
                {summary.pendingQuotations.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay saldos pendientes.</p> : summary.pendingQuotations.map((quotation) => <Link key={quotation.id} to={`/quotations/${quotation.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"><span className="min-w-0"><span className="block font-mono text-sm font-bold text-brand-blue">{quotation.codigo}</span><span className="block truncate text-xs text-slate-500">{quotation.client?.nombre ?? 'Sin cliente'}</span></span><span className="text-right"><span className="block text-sm font-bold text-slate-800">{formatClp(quotation.saldoPendiente)}</span><span className="block text-xs text-slate-500">pendiente</span></span></Link>)}
              </div>
            </aside>
          </section>
        </>
      )}

      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar revisión" onClick={() => setReview(null)} />
          <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="review-payment-title">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${review.decision === 'aprobar' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{review.decision === 'aprobar' ? <Check className="h-5 w-5" aria-hidden="true" /> : <X className="h-5 w-5" aria-hidden="true" />}</div>
            <h2 id="review-payment-title" className="mt-4 text-xl font-bold text-brand-blue">{review.decision === 'aprobar' ? 'Confirmar transferencia' : 'Rechazar transferencia'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{review.decision === 'aprobar' ? `Se sumarán ${formatClp(review.payment.monto)} al monto pagado de la cotización.` : 'El monto dejará de reservar saldo y no se sumará como pago.'}</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Comentario de revisión<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue" placeholder="Referencia bancaria, motivo del rechazo u observación" /></label>
            <div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setReview(null)}>Cancelar</button><button type="button" className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60 ${review.decision === 'aprobar' ? 'bg-emerald-700' : 'bg-red-700'}`} onClick={submitReview} disabled={verifyMutation.isPending}>{verifyMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{review.decision === 'aprobar' ? 'Confirmar pago' : 'Rechazar pago'}</button></div>
          </section>
        </div>
      )}

      {showClosure && daily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar formulario de caja" onClick={() => setShowClosure(false)} />
          <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="close-cash-title">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-yellow text-brand-dark"><Scale className="h-5 w-5" aria-hidden="true" /></div>
            <h2 id="close-cash-title" className="mt-4 text-xl font-bold text-brand-blue">Cerrar caja del {selectedDate}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">El sistema espera {formatClp(daily.totals.byMethod.efectivo)} en efectivo. Una vez cerrado el día no aceptará movimientos con esta fecha.</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Efectivo contado<input type="number" min="0" step="1" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" autoFocus /></label>
            <div className="mt-3 flex items-center justify-between bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-600">Diferencia proyectada</span><strong className={Number(declaredCash) === daily.totals.byMethod.efectivo ? 'text-emerald-700' : 'text-red-700'}>{formatClp(Number(declaredCash || 0) - daily.totals.byMethod.efectivo)}</strong></div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Observaciones<textarea value={closureNotes} onChange={(event) => setClosureNotes(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue" placeholder="Diferencias, depósitos o notas del arqueo" /></label>
            <div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setShowClosure(false)}>Cancelar</button><button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={submitClosure} disabled={closeDayMutation.isPending || declaredCash === ''}>{closeDayMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Confirmar cierre</button></div>
          </section>
        </div>
      )}
    </div>
  );
};

export default FinancePage;
