import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CalendarDays,
  ChevronDown,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ReceiptText,
  BarChart3,
  Scale,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import CurrencyInput from '../../components/common/CurrencyInput';
import FormDialog from '../../components/common/FormDialog';
import FinanceAnalyticsDashboard from '../../components/finance/FinanceAnalyticsDashboard';
import FinancePayments from '../../components/finance/FinancePayments';
import PaymentReceiptLink from '../../components/finance/PaymentReceiptLink';
import {
  useCashMovements,
  useCloseCashDayMutation,
  useCreateCashMovementMutation,
  useDailyCashSummary,
  useFinanceSummary,
  useVerifyPaymentMutation,
  useVoidCashMovementMutation,
} from '../../hooks/useFinance';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { CashMovement } from '../../hooks/useFinance';
import type { Payment } from '../../types/entities';
import type { CashMovementCategory, CashMovementType, PaymentMethod } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  otro: 'Otro',
};

const categoryLabels: Record<CashMovementCategory, string> = {
  apertura_caja: 'Apertura de caja',
  gasto_operativo: 'Gasto operativo',
  compra_repuesto: 'Compra de repuesto',
  pago_proveedor: 'Pago a proveedor',
  devolucion: 'Devolución',
  retiro: 'Retiro de caja',
  ajuste: 'Ajuste contable',
  otro: 'Otro',
};

const defaultMovementForm = (fecha: string) => ({
  tipo: 'egreso' as CashMovementType,
  categoria: 'gasto_operativo' as CashMovementCategory,
  monto: '',
  metodo: 'efectivo' as PaymentMethod,
  descripcion: '',
  referencia: '',
  fecha: `${fecha}T12:00`,
});

interface MetricProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}

const Metric = ({ label, value, detail, icon: Icon, tone }: MetricProps) => (
  <div className="workspace-finance-metric min-h-36 min-w-0 border border-brand-line bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-brand-muted">{label}</p>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p className="mt-4 break-words text-xl font-bold text-brand-primaryInk sm:text-2xl">{value}</p>
    <p className="mt-1 text-xs text-brand-muted">{detail}</p>
  </div>
);

interface ReviewState {
  payment: Payment;
  decision: 'aprobar' | 'rechazar';
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const FinancePage = () => {
  const user = useAuthStore((state) => state.user);
  const canCreate = Boolean(user && hasUserPermission(user, 'finanzas', 'create'));
  const canReview = Boolean(user && hasUserPermission(user, 'finanzas', 'update'));
  const canVoid = Boolean(user && hasUserPermission(user, 'finanzas', 'delete'));
  const [financeParams, setFinanceParams] = useSearchParams();
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const requestedTab = financeParams.get('tab');
  const activeTab =
    requestedTab === 'cash' || requestedTab === 'analytics' ? requestedTab : 'payments';
  const summaryQuery = useFinanceSummary();
  const verifyMutation = useVerifyPaymentMutation();
  const closeDayMutation = useCloseCashDayMutation();
  const createMovementMutation = useCreateCashMovementMutation();
  const voidMovementMutation = useVoidCashMovementMutation();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const dailyQuery = useDailyCashSummary(selectedDate);
  const movementsQuery = useCashMovements(selectedDate);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [comment, setComment] = useState('');
  const [showClosure, setShowClosure] = useState(false);
  const [declaredCash, setDeclaredCash] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [showMovement, setShowMovement] = useState(false);
  const [movementForm, setMovementForm] = useState(() => defaultMovementForm(todayIso()));
  const [voidTarget, setVoidTarget] = useState<CashMovement | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const summary = summaryQuery.data;
  const daily = dailyQuery.data;

  const openReview = (payment: Payment, decision: ReviewState['decision']): void => {
    verifyMutation.reset();
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
    closeDayMutation.reset();
    setDeclaredCash(String(daily?.totals.expectedCash ?? 0));
    setClosureNotes('');
    setShowClosure(true);
  };

  const openMovement = (): void => {
    createMovementMutation.reset();
    setMovementForm(defaultMovementForm(selectedDate));
    setShowMovement(true);
  };

  const submitMovement = (): void => {
    createMovementMutation.mutate(
      {
        tipo: movementForm.tipo,
        categoria: movementForm.categoria,
        monto: Number(movementForm.monto),
        metodo: movementForm.metodo,
        descripcion: movementForm.descripcion.trim(),
        referencia: movementForm.referencia.trim() || undefined,
        fecha: new Date(movementForm.fecha).toISOString(),
      },
      {
        onSuccess: () => {
          notifySuccess('Movimiento registrado correctamente.');
          setShowMovement(false);
        },
        onError: (error) =>
          notifyError(getApiErrorMessage(error, 'No se pudo registrar el movimiento.')),
      },
    );
  };

  const submitVoidMovement = (): void => {
    if (!voidTarget) return;
    voidMovementMutation.mutate(
      { id: voidTarget.id, data: { motivo: voidReason.trim() } },
      {
        onSuccess: () => {
          notifySuccess('Movimiento anulado y saldo recalculado.');
          setVoidTarget(null);
          setVoidReason('');
        },
        onError: (error) =>
          notifyError(getApiErrorMessage(error, 'No se pudo anular el movimiento.')),
      },
    );
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
    <div className="workspace-page workspace-finance insights-page min-w-0 space-y-5">
      <header className="insights-page-heading">
        <h1>Finanzas y Contabilidad</h1>
        <p>Cobranza, caja y análisis ejecutivo</p>
      </header>
      {(summaryQuery.isError || dailyQuery.isError || movementsQuery.isError) && (
        <div className="finance-alert" role="alert">
          <AlertCircle aria-hidden="true" />
          {getApiErrorMessage(
            summaryQuery.error ?? dailyQuery.error ?? movementsQuery.error,
            'No fue posible cargar el panel financiero.',
          )}
        </div>
      )}
      {summaryQuery.isPending && (
        <div className="finance-kpi-grid" aria-label="Cargando panel financiero">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="finance-kpi-skeleton animate-pulse" />
          ))}
        </div>
      )}
      {summary && (
        <div className="finance-overview">
          <section
            id="finance-indicators"
            className={'finance-kpi-grid' + (metricsExpanded ? ' is-expanded' : '')}
            aria-label="Indicadores financieros"
          >
            <Metric
              label="Recaudación del mes"
              value={formatClp(summary.metrics.revenueMonth)}
              detail="Pagos confirmados desde el día 1"
              icon={WalletCards}
              tone="bg-brand-goldPale text-brand-goldInk"
            />
            <Metric
              label="Neto de caja hoy"
              value={formatClp(summary.metrics.netCashToday)}
              detail="Ingresos confirmados y manuales menos egresos"
              icon={Scale}
              tone="bg-cyan-100 text-cyan-800"
            />
            <Metric
              label="Saldo por cobrar"
              value={formatClp(summary.metrics.receivableTotal)}
              detail={`${summary.metrics.receivableCount} cotización(es) con saldo`}
              icon={ReceiptText}
              tone="bg-brand-pale text-brand-primaryInk"
            />
            {metricsExpanded && (
              <>
                <Metric
                  label="Recaudación de hoy"
                  value={formatClp(summary.metrics.revenueToday)}
                  detail="Pagos confirmados durante la jornada"
                  icon={Banknote}
                  tone="bg-brand-mintPale text-brand-mintInk"
                />
                <Metric
                  label="Egresos de hoy"
                  value={formatClp(summary.metrics.expensesToday)}
                  detail={`${formatClp(summary.metrics.expensesMonth)} acumulados en el mes`}
                  icon={ArrowDownCircle}
                  tone="bg-brand-coralPale text-brand-coralInk"
                />
                <Metric
                  label="Transferencias pendientes"
                  value={String(summary.metrics.pendingTransferCount)}
                  detail={`${formatClp(summary.metrics.pendingTransferAmount)} por verificar`}
                  icon={Clock3}
                  tone="bg-brand-goldPale text-brand-goldInk"
                />
              </>
            )}
          </section>
          <div className="finance-overview-actions">
            {summary.metrics.pendingTransferCount > 0 && (
              <button
                type="button"
                className="finance-pending-shortcut"
                onClick={() =>
                  setFinanceParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('tab', 'payments');
                      next.set('paymentStatus', 'por_verificar');
                      [
                        'paymentPage',
                        'paymentSearch',
                        'paymentMethod',
                        'paymentFrom',
                        'paymentTo',
                      ].forEach((key) => next.delete(key));
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                {summary.metrics.pendingTransferCount} transferencia(s) por verificar
              </button>
            )}
            <button
              type="button"
              className="finance-metrics-toggle"
              aria-expanded={metricsExpanded}
              aria-controls="finance-indicators"
              onClick={() => setMetricsExpanded((current) => !current)}
            >
              {metricsExpanded ? 'Menos indicadores' : 'Más indicadores'}
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div className="finance-section-toolbar">
        <div className="insights-tabs" role="tablist" aria-label="Sección de finanzas">
          {(
            [
              { id: 'payments', label: 'Abonos', icon: WalletCards },
              { id: 'cash', label: 'Caja', icon: Banknote },
              { id: 'analytics', label: 'Análisis', icon: BarChart3 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              id={'finance-tab-' + id}
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={'finance-panel-' + id}
              onClick={() =>
                setFinanceParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.set('tab', id);
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <Link className="insights-secondary" to="/reports?section=finance">
          <ReceiptText aria-hidden="true" />
          Reportes
        </Link>
        {canCreate && (
          <button
            type="button"
            className="insights-primary"
            onClick={openMovement}
            disabled={!daily || daily.isClosed}
          >
            <Plus aria-hidden="true" />
            Movimiento de caja
          </button>
        )}
      </div>
      {activeTab === 'payments' && (
        <div
          id="finance-panel-payments"
          role="tabpanel"
          aria-labelledby="finance-tab-payments"
          className="finance-payments-panel"
        >
          <FinancePayments canReview={canReview} onReview={openReview} />
          {summary && (
            <aside className="finance-receivable-panel">
              <div className="border-b border-brand-line px-5 py-4">
                <h2 className="font-bold text-brand-primaryInk">Cobranza pendiente</h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Cotizaciones priorizadas por actividad reciente.
                </p>
              </div>
              <div className="divide-y divide-brand-line">
                {summary.pendingQuotations.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-brand-muted">
                    No hay saldos pendientes.
                  </p>
                ) : (
                  summary.pendingQuotations.map((quotation) => (
                    <Link
                      key={quotation.id}
                      to={`/quotations/${quotation.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-brand-pale"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-bold text-brand-primaryInk">
                          {quotation.codigo}
                        </span>
                        <span className="block truncate text-xs text-brand-muted">
                          {quotation.client?.nombre ?? 'Sin cliente'}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-bold text-brand-ink">
                          {formatClp(quotation.saldoPendiente)}
                        </span>
                        <span className="block text-xs text-brand-muted">pendiente</span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
      )}
      {activeTab === 'cash' && (
        <div
          id="finance-panel-cash"
          role="tabpanel"
          aria-labelledby="finance-tab-cash"
          className="finance-cash-body"
        >
          <section
            className="min-w-0 overflow-hidden border border-brand-line bg-white shadow-sm"
            aria-labelledby="cash-count-title"
          >
            <div className="flex flex-col gap-3 border-b border-brand-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 id="cash-count-title" className="font-bold text-brand-primaryInk">
                  Arqueo y cierre diario
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Totales confirmados agrupados por método de pago.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-brand-ink sm:flex-none">
                  <CalendarDays className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
                  <span className="sr-only">Fecha del arqueo</span>
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayIso()}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-10 min-w-0 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary sm:w-auto"
                    aria-label="Fecha del arqueo"
                  />
                </label>
                {canCreate && (
                  <button
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                    onClick={openMovement}
                    disabled={!canCreate || daily?.isClosed}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nuevo movimiento
                  </button>
                )}
              </div>
            </div>
            {dailyQuery.isPending ? (
              <div className="flex min-h-36 items-center justify-center">
                <LoaderCircle
                  className="h-6 w-6 animate-spin text-brand-primaryInk"
                  aria-label="Cargando arqueo"
                />
              </div>
            ) : (
              daily && (
                <div className="grid lg:grid-cols-[2fr_1fr]">
                  <div className="grid grid-cols-2 border-b border-brand-line sm:grid-cols-3 lg:border-b-0 lg:border-r">
                    {Object.entries(daily.totals.byMethod).map(([method, amount]) => (
                      <div
                        key={method}
                        className="border-b border-r border-brand-line p-4 last:border-r-0"
                      >
                        <p className="text-xs font-semibold uppercase text-brand-muted">
                          {methodLabels[method] ?? method}
                        </p>
                        <p className="mt-2 break-words text-base font-bold text-brand-ink sm:text-lg">
                          {formatClp(amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-brand-muted">
                          Resultado neto
                        </p>
                        <p className="mt-2 text-2xl font-bold text-brand-primaryInk">
                          {formatClp(daily.totals.netTotal)}
                        </p>
                      </div>
                      <span
                        className={`rounded px-2 py-1 text-xs font-bold ${daily.isClosed ? 'bg-brand-mintPale text-brand-mintInk' : 'bg-brand-pale text-brand-primaryInk'}`}
                      >
                        {daily.isClosed ? 'Caja cerrada' : 'Caja abierta'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 border-t border-brand-line pt-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-brand-muted">Pagos confirmados</span>
                        <strong>{formatClp(daily.totals.confirmedTotal)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">Ingresos manuales</span>
                        <strong className="text-brand-mintInk">
                          + {formatClp(daily.totals.manualIncomeTotal)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">Egresos</span>
                        <strong className="text-brand-coralInk">
                          - {formatClp(daily.totals.expenseTotal)}
                        </strong>
                      </div>
                      <div className="flex justify-between border-t border-brand-line pt-2">
                        <span className="font-semibold text-brand-muted">Efectivo esperado</span>
                        <strong>{formatClp(daily.totals.expectedCash)}</strong>
                      </div>
                    </div>
                    {daily.totals.pendingTransferCount > 0 && (
                      <div className="mt-4 border-l-4 border-brand-gold bg-brand-goldPale px-3 py-2 text-sm text-brand-ink">
                        <strong>{daily.totals.pendingTransferCount}</strong> transferencia(s) por{' '}
                        {formatClp(daily.totals.pendingTransferAmount)} impiden cerrar la jornada.
                      </div>
                    )}
                    {daily.closure ? (
                      <div className="mt-4 space-y-2 border-t border-brand-line pt-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-brand-muted">Efectivo declarado</span>
                          <strong>{formatClp(daily.closure.efectivoDeclarado)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-brand-muted">Diferencia</span>
                          <strong
                            className={
                              daily.closure.diferenciaEfectivo === 0
                                ? 'text-brand-mintInk'
                                : 'text-brand-coralInk'
                            }
                          >
                            {formatClp(daily.closure.diferenciaEfectivo)}
                          </strong>
                        </div>
                        <p className="pt-2 text-xs text-brand-muted">
                          Cerrada por {daily.closure.closer?.nombre ?? 'usuario eliminado'} ·{' '}
                          {formatDateTime(daily.closure.closedAt)}
                        </p>
                      </div>
                    ) : canCreate ? (
                      <button
                        type="button"
                        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={daily.totals.pendingTransferCount > 0}
                        onClick={openClosure}
                      >
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                        Cerrar caja del día
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            )}
          </section>

          <section
            className="min-w-0 overflow-hidden border border-brand-line bg-white shadow-sm"
            aria-labelledby="cash-movements-title"
          >
            <div className="flex flex-col gap-2 border-b border-brand-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 id="cash-movements-title" className="font-bold text-brand-primaryInk">
                  Ingresos y egresos manuales
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Libro auditable de movimientos ajenos a pagos de cotizaciones.
                </p>
              </div>
              <span className="rounded bg-brand-pale px-2 py-1 text-xs font-bold text-brand-ink">
                {movementsQuery.data?.length ?? 0} movimiento(s)
              </span>
            </div>
            {movementsQuery.isPending ? (
              <div className="flex min-h-28 items-center justify-center">
                <LoaderCircle
                  className="h-6 w-6 animate-spin text-brand-primaryInk"
                  aria-label="Cargando movimientos"
                />
              </div>
            ) : !movementsQuery.data?.length ? (
              <p className="px-5 py-10 text-center text-sm text-brand-muted">
                No hay movimientos manuales registrados para esta fecha.
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto overscroll-x-contain">
                <table
                  role="table"
                  className="workspace-table w-full min-w-[900px] text-left text-sm"
                >
                  <thead
                    role="rowgroup"
                    className="bg-brand-line/40 text-xs uppercase text-brand-muted"
                  >
                    <tr role="row">
                      <th role="columnheader" className="px-4 py-3 font-semibold">
                        Tipo
                      </th>
                      <th role="columnheader" className="px-4 py-3 font-semibold">
                        Detalle
                      </th>
                      <th role="columnheader" className="px-4 py-3 font-semibold">
                        Método
                      </th>
                      <th role="columnheader" className="px-4 py-3 font-semibold">
                        Responsable
                      </th>
                      <th role="columnheader" className="px-4 py-3 text-right font-semibold">
                        Monto
                      </th>
                      <th role="columnheader" className="px-4 py-3 text-right font-semibold">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {movementsQuery.data.map((movement) => (
                      <tr
                        role="row"
                        key={movement.id}
                        className={`border-t border-brand-line ${movement.voidedAt ? 'bg-brand-line/40 opacity-60' : ''}`}
                      >
                        <td role="cell" data-label="Tipo" className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-bold ${movement.tipo === 'ingreso' ? 'bg-brand-mintPale text-brand-mintInk' : 'bg-brand-coralPale text-brand-coralInk'}`}
                          >
                            {movement.tipo === 'ingreso' ? (
                              <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {movement.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                          </span>
                        </td>
                        <td role="cell" data-label="Detalle" className="px-4 py-3">
                          <p
                            className={`font-semibold text-brand-ink ${movement.voidedAt ? 'line-through' : ''}`}
                          >
                            {movement.descripcion}
                          </p>
                          <p className="mt-0.5 text-xs text-brand-muted">
                            {categoryLabels[movement.categoria]}
                            {movement.referencia ? ` · ${movement.referencia}` : ''}
                          </p>
                          {movement.voidedAt && (
                            <p className="mt-1 text-xs font-medium text-brand-coralInk">
                              Anulado: {movement.voidReason}
                            </p>
                          )}
                        </td>
                        <td role="cell" data-label="Método" className="px-4 py-3 text-brand-muted">
                          {methodLabels[movement.metodo]}
                        </td>
                        <td
                          role="cell"
                          data-label="Responsable"
                          className="px-4 py-3 text-brand-muted"
                        >
                          {movement.creator?.nombre ?? 'Usuario eliminado'}
                          <span className="block text-xs text-brand-muted">
                            {formatDateTime(movement.fecha)}
                          </span>
                        </td>
                        <td
                          role="cell"
                          data-label="Monto"
                          className={`px-4 py-3 text-right font-bold ${movement.tipo === 'ingreso' ? 'text-brand-mintInk' : 'text-brand-coralInk'}`}
                        >
                          {movement.tipo === 'ingreso' ? '+' : '-'} {formatClp(movement.monto)}
                        </td>
                        <td role="cell" data-label="Acción" className="px-4 py-3 text-right">
                          {canVoid && !movement.voidedAt && !daily?.isClosed && (
                            <button
                              type="button"
                              className="h-8 rounded border border-brand-coral/30 px-3 text-xs font-semibold text-brand-coralInk hover:bg-brand-coralPale"
                              onClick={() => {
                                voidMovementMutation.reset();
                                setVoidReason('');
                                setVoidTarget(movement);
                              }}
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      {activeTab === 'analytics' && (
        <div id="finance-panel-analytics" role="tabpanel" aria-labelledby="finance-tab-analytics">
          <FinanceAnalyticsDashboard />
        </div>
      )}

      {showMovement && daily && (
        <FormDialog
          id="cash-movement-title"
          title="Registrar movimiento de caja"
          code={selectedDate}
          context="Ingreso o egreso manual"
          submitLabel="Registrar movimiento"
          dirty={JSON.stringify(movementForm) !== JSON.stringify(defaultMovementForm(selectedDate))}
          pending={createMovementMutation.isPending}
          onClose={() => setShowMovement(false)}
          onSubmit={(event) => {
            event.preventDefault();
            submitMovement();
          }}
          headerVariant="plain"
          className="finance-form reference-form-dialog"
          submitDisabled={
            !canCreate ||
            daily.isClosed ||
            Number(movementForm.monto) <= 0 ||
            movementForm.descripcion.trim().length < 2 ||
            !movementForm.fecha
          }
        >
          <div className="finance-form-fields">
            {' '}
            <div className="mt-5 grid grid-cols-2 gap-2" aria-label="Tipo de movimiento">
              {(['ingreso', 'egreso'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  className={`flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-bold ${movementForm.tipo === tipo ? 'border-brand-primaryInk bg-brand-primaryInk text-white' : 'border-brand-line text-brand-ink'}`}
                  onClick={() =>
                    setMovementForm((current) => ({
                      ...current,
                      tipo,
                      categoria: tipo === 'ingreso' ? 'apertura_caja' : 'gasto_operativo',
                    }))
                  }
                >
                  {tipo === 'ingreso' ? (
                    <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  {tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-brand-ink">
                Categoría
                <select
                  value={movementForm.categoria}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      categoria: event.target.value as CashMovementCategory,
                    }))
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Método
                <select
                  value={movementForm.metodo}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      metodo: event.target.value as PaymentMethod,
                    }))
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                >
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Monto
                <CurrencyInput
                  value={movementForm.monto}
                  onChange={(value) => setMovementForm((current) => ({ ...current, monto: value }))}
                  className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                  aria-label="Monto"
                />
              </label>
              <label className="text-sm font-semibold text-brand-ink">
                Fecha y hora
                <input
                  type="datetime-local"
                  value={movementForm.fecha}
                  max={`${todayIso()}T23:59`}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, fecha: event.target.value }))
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Descripción
              <input
                value={movementForm.descripcion}
                maxLength={255}
                onChange={(event) =>
                  setMovementForm((current) => ({ ...current, descripcion: event.target.value }))
                }
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                placeholder="Ej. Compra urgente de insumos"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Referencia opcional
              <input
                value={movementForm.referencia}
                maxLength={120}
                onChange={(event) =>
                  setMovementForm((current) => ({ ...current, referencia: event.target.value }))
                }
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                placeholder="N.º documento, proveedor o comprobante"
              />
            </label>
            {createMovementMutation.isError && (
              <p className="finance-alert" role="alert">
                {getApiErrorMessage(createMovementMutation.error)}
              </p>
            )}
          </div>
        </FormDialog>
      )}
      {voidTarget && (
        <FormDialog
          id="void-movement-title"
          title="Anular movimiento"
          code={formatClp(voidTarget.monto)}
          context={voidTarget.descripcion}
          submitLabel="Confirmar anulación"
          dirty={voidReason !== ''}
          pending={voidMovementMutation.isPending}
          onClose={() => setVoidTarget(null)}
          onSubmit={(event) => {
            event.preventDefault();
            submitVoidMovement();
          }}
          headerVariant="plain"
          className="finance-form finance-form--destructive reference-form-dialog"
          submitDisabled={!canVoid || voidReason.trim().length < 2}
        >
          <div className="finance-form-fields">
            {' '}
            <p className="mt-2 text-sm leading-6 text-brand-muted">
              Se anulará {voidTarget.descripcion} por {formatClp(voidTarget.monto)}. El registro
              permanecerá visible para auditoría.
            </p>
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Motivo de anulación
              <textarea
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                maxLength={500}
                rows={3}
                className="mt-2 w-full rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary"
              />
            </label>
            {voidMovementMutation.isError && (
              <p className="finance-alert" role="alert">
                {getApiErrorMessage(voidMovementMutation.error)}
              </p>
            )}
          </div>
        </FormDialog>
      )}
      {review && (
        <FormDialog
          id="review-payment-title"
          title={
            review.decision === 'aprobar' ? 'Confirmar transferencia' : 'Rechazar transferencia'
          }
          code={review.payment.quotation?.codigo ?? 'COT #' + review.payment.quotationId}
          context={formatClp(review.payment.monto)}
          submitLabel={review.decision === 'aprobar' ? 'Confirmar pago' : 'Rechazar pago'}
          dirty={comment !== ''}
          pending={verifyMutation.isPending}
          onClose={() => setReview(null)}
          onSubmit={(event) => {
            event.preventDefault();
            submitReview();
          }}
          headerVariant="plain"
          className={
            'finance-form reference-form-dialog' +
            (review.decision === 'rechazar' ? ' finance-form--destructive' : '')
          }
          submitDisabled={!canReview}
        >
          <div className="finance-form-fields">
            {' '}
            <p className="mt-2 text-sm leading-6 text-brand-muted">
              {review.decision === 'aprobar'
                ? `Se sumarán ${formatClp(review.payment.monto)} al monto pagado de la cotización.`
                : 'El monto dejará de reservar saldo y no se sumará como pago.'}
            </p>
            <dl className="my-4 grid grid-cols-2 gap-3 border-y border-brand-line py-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-brand-muted">Banco de procedencia</dt>
                <dd className="mt-1 break-words font-semibold text-brand-ink">
                  {review.payment.bancoOrigen || 'No registrado'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-brand-muted">Número de transacción</dt>
                <dd className="mt-1 break-words font-semibold text-brand-ink">
                  {review.payment.numeroTransaccion || 'No registrado'}
                </dd>
              </div>
            </dl>
            <PaymentReceiptLink payment={review.payment} />
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Comentario de revisión
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                rows={3}
                className="mt-2 w-full rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary"
                placeholder="Referencia bancaria, motivo del rechazo u observación"
              />
            </label>
            {verifyMutation.isError && (
              <p className="finance-alert" role="alert">
                {getApiErrorMessage(verifyMutation.error)}
              </p>
            )}
          </div>
        </FormDialog>
      )}
      {showClosure && daily && (
        <FormDialog
          id="close-cash-title"
          title={'Cerrar caja del ' + selectedDate}
          code="Arqueo diario"
          context={formatClp(daily.totals.expectedCash) + ' de efectivo esperado'}
          submitLabel="Confirmar cierre"
          dirty={declaredCash !== String(daily.totals.expectedCash) || closureNotes !== ''}
          pending={closeDayMutation.isPending}
          onClose={() => setShowClosure(false)}
          onSubmit={(event) => {
            event.preventDefault();
            submitClosure();
          }}
          headerVariant="plain"
          className="finance-form reference-form-dialog"
          submitDisabled={
            !canCreate ||
            daily.isClosed ||
            daily.totals.pendingTransferCount > 0 ||
            declaredCash === '' ||
            !Number.isFinite(Number(declaredCash)) ||
            Number(declaredCash) < 0
          }
        >
          <div className="finance-form-fields">
            {' '}
            <p className="mt-2 text-sm leading-6 text-brand-muted">
              El sistema espera {formatClp(daily.totals.expectedCash)} en efectivo después de sumar
              ingresos y restar egresos. Una vez cerrado el día no aceptará movimientos con esta
              fecha.
            </p>
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Efectivo contado
              <CurrencyInput
                value={declaredCash}
                onChange={setDeclaredCash}
                className="mt-2 h-10 w-full rounded-lg border border-brand-line px-3 font-normal outline-none focus:border-brand-primary"
                aria-label="Efectivo contado"
              />
            </label>
            <div className="mt-3 flex items-center justify-between bg-brand-line/40 px-3 py-2 text-sm">
              <span className="text-brand-muted">Diferencia proyectada</span>
              <strong
                className={
                  Number(declaredCash) === daily.totals.expectedCash
                    ? 'text-brand-mintInk'
                    : 'text-brand-coralInk'
                }
              >
                {formatClp(Number(declaredCash || 0) - daily.totals.expectedCash)}
              </strong>
            </div>
            <label className="mt-4 block text-sm font-semibold text-brand-ink">
              Observaciones
              <textarea
                value={closureNotes}
                onChange={(event) => setClosureNotes(event.target.value)}
                maxLength={1000}
                rows={3}
                className="mt-2 w-full rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary"
                placeholder="Diferencias, depósitos o notas del arqueo"
              />
            </label>
            {closeDayMutation.isError && (
              <p className="finance-alert" role="alert">
                {getApiErrorMessage(closeDayMutation.error)}
              </p>
            )}
          </div>
        </FormDialog>
      )}
    </div>
  );
};

export default FinancePage;
