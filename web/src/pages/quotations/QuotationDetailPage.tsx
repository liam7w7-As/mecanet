import { AlertCircle, ArrowLeft, Banknote, LoaderCircle, Pencil, Plus, ReceiptText, Trash2, UserRound, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import ConvertQuotationModal from '../../components/quotations/ConvertQuotationModal';
import PaymentFormModal, { PAYMENT_METHOD_LABELS } from '../../components/quotations/PaymentFormModal';
import QuotationEditModal from '../../components/quotations/QuotationEditModal';
import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import { useDeletePaymentMutation, useQuotationPayments } from '../../hooks/usePayments';
import { useQuotation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasRolePermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Payment } from '../../types/entities';
import type { PaymentMethod } from '@unithor/shared';

const getPaymentMethodLabel = (method: string | null): string =>
  method && method in PAYMENT_METHOD_LABELS
    ? PAYMENT_METHOD_LABELS[method as PaymentMethod]
    : method ?? 'Sin método';

export const QuotationDetailPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quotationId = Number(id);
  const quotationQuery = useQuotation(quotationId);
  const paymentsQuery = useQuotationPayments(quotationId);
  const deletePaymentMutation = useDeletePaymentMutation();
  const [showPaymentModal, setShowPaymentModal] = useState(searchParams.get('payment') === 'true');
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(searchParams.get('edit') === 'true');
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const user = useAuthStore((state) => state.user);
  const quotation = quotationQuery.data;
  const summary = paymentsQuery.data;
  const total = summary?.total ?? quotation?.total ?? 0;
  const paid = summary?.pagado ?? quotation?.pagado ?? 0;
  const balance = summary?.saldoPendiente ?? Math.max(0, total - paid);
  const canCreatePayment = Boolean(user && hasRolePermission(user.role, 'comercial', 'create'));
  const canDeletePayment = Boolean(user && hasRolePermission(user.role, 'comercial', 'delete'));
  const canEdit = Boolean(user && hasRolePermission(user.role, 'comercial', 'update'));
  const canConvert = Boolean(user && (hasRolePermission(user.role, 'comercial', 'update') || hasRolePermission(user.role, 'taller', 'create')));

  if (quotationQuery.isPending) {
    return <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-brand-blue" aria-label="Cargando cotización" /></div>;
  }

  if (quotationQuery.isError || !quotation) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700" role="alert"><p className="font-semibold">No fue posible cargar la cotización</p><p className="mt-1 text-sm">{getApiErrorMessage(quotationQuery.error, 'Cotización no encontrada.')}</p><Link to="/quotations" className="mt-4 inline-flex text-sm font-semibold underline">Volver al listado</Link></div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="flex items-start gap-3"><Link to="/quotations" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Volver a cotizaciones"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link><div><p className="text-sm font-medium text-slate-500">Gestión de cobro</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-mono text-2xl font-bold text-brand-blue sm:text-3xl">{quotation.codigo}</h1><QuotationStatusBadge status={summary?.estadoPago ?? quotation.estadoPago} /></div></div></div>{canEdit && quotation.estadoPago !== 'total' && <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue hover:bg-brand-light" onClick={() => setShowEditModal(true)}><Pencil className="h-4 w-4" aria-hidden="true" />Editar cotización</button>}</header>

      {(paymentsQuery.isError || deletePaymentMutation.isError) && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(paymentsQuery.error ?? deletePaymentMutation.error)}</div>}

      {quotation.workOrderId === null && <section className="flex flex-col gap-4 border-l-4 border-brand-yellow bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Wrench className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" aria-hidden="true" /><div><h2 className="font-bold text-brand-blue">Cotización independiente, aún sin OT</h2><p className="mt-1 text-sm text-slate-600">Cuando el cliente apruebe el presupuesto puede generar la orden del taller conservando todos los ítems.</p></div></div>{canConvert && <button type="button" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400" onClick={() => setShowConversionModal(true)}>Convertir en Orden de Trabajo</button>}</section>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Resumen financiero"><div className="grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0"><div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Total cotizado</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatClp(total)}</p></div><div className="p-5"><p className="text-xs font-semibold uppercase text-slate-500">Monto pagado</p><p className="mt-2 text-2xl font-bold text-emerald-700" data-testid="quotation-paid">{formatClp(paid)}</p></div><div className="bg-brand-light p-5"><p className="text-xs font-semibold uppercase text-brand-blue">Saldo pendiente</p><p className="mt-2 text-2xl font-bold text-brand-blue" data-testid="quotation-balance">{formatClp(balance)}</p></div></div></section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="quotation-info-title"><div className="border-b border-slate-200 px-5 py-4"><h2 id="quotation-info-title" className="font-bold text-brand-blue">Información comercial</h2></div><div className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0"><div className="p-5"><p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Cliente</p><p className="mt-3 font-semibold text-slate-900">{quotation.client?.nombre ?? 'Sin cliente'}</p><p className="mt-1 text-sm text-slate-500">{quotation.client?.rut ?? 'Sin identificación'}</p></div><div className="p-5"><p className="text-sm font-semibold text-slate-500">Vehículo</p><p className="mt-3 font-mono text-lg font-bold text-brand-blue">{quotation.vehicle?.patente ?? 'Sin vehículo'}</p><p className="mt-1 text-sm text-slate-500">{[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos técnicos'}</p></div><div className="p-5"><p className="text-sm font-semibold text-slate-500">Referencia</p><p className="mt-3 text-sm text-slate-700">Asesor: <strong>{quotation.asesor?.nombre ?? 'Sin registro'}</strong></p><p className="mt-2 text-sm text-slate-700">OT: {quotation.workOrder ? <Link to={`/work-orders/${quotation.workOrder.id}`} className="font-mono font-bold text-brand-blue hover:underline">{quotation.workOrder.codigo}</Link> : 'No vinculada'}</p></div></div><div className="border-t border-slate-200 px-5 py-4"><p className="text-xs font-semibold uppercase text-slate-500">Notas comerciales</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quotation.notas ?? 'Sin notas registradas.'}</p></div></section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="quotation-items-title"><div className="border-b border-slate-200 px-5 py-4"><h2 id="quotation-items-title" className="font-bold text-brand-blue">Conceptos cotizados</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Descripción</th><th className="px-4 py-3 text-right font-semibold">Cantidad</th><th className="px-4 py-3 text-right font-semibold">Precio unitario</th><th className="px-4 py-3 text-right font-semibold">Subtotal</th></tr></thead><tbody>{quotation.items?.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{item.descripcion}</td><td className="px-4 py-3 text-right text-slate-600">{item.cantidad}</td><td className="px-4 py-3 text-right text-slate-600">{formatClp(item.precioUnitario)}</td><td className="px-4 py-3 text-right font-semibold text-brand-blue">{formatClp(item.subtotal)}</td></tr>)}</tbody></table></div>{quotation.items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Sin conceptos cotizados.</p>}</section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="payments-title"><div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="payments-title" className="font-bold text-brand-blue">Historial de pagos y abonos</h2><p className="mt-1 text-sm text-slate-500">Todos los movimientos registrados para esta cotización.</p></div>{canCreatePayment && balance > 0 && <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark" onClick={() => setShowPaymentModal(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Registrar Abono</button>}</div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Método</th><th className="px-4 py-3 font-semibold">Usuario receptor</th><th className="px-4 py-3 text-right font-semibold">Monto</th><th className="px-4 py-3 text-right font-semibold">Acción</th></tr></thead><tbody>{summary?.payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(payment.fecha)}</td><td className="px-4 py-3 font-medium text-slate-800">{getPaymentMethodLabel(payment.metodo)}</td><td className="px-4 py-3 text-slate-600">{payment.creator?.nombre ?? 'Sin registro'}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatClp(payment.monto)}</td><td className="px-4 py-3"><div className="flex justify-end">{canDeletePayment && <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => setPaymentToDelete(payment)} aria-label={`Anular pago de ${formatClp(payment.monto)}`} title="Anular pago"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div></td></tr>)}</tbody></table></div>{paymentsQuery.isPending && <div className="flex min-h-28 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-brand-blue" aria-label="Cargando pagos" /></div>}{!paymentsQuery.isPending && summary?.payments.length === 0 && <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center"><Banknote className="h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-2 text-sm font-semibold text-slate-600">Aún no hay abonos registrados</p></div>}</section>

      {showPaymentModal && summary && <PaymentFormModal quotationId={quotation.id} codigo={quotation.codigo} saldoPendiente={balance} onClose={() => setShowPaymentModal(false)} />}
      {showConversionModal && <ConvertQuotationModal quotationId={quotation.id} codigo={quotation.codigo} notas={quotation.notas} onClose={() => setShowConversionModal(false)} onConverted={(workOrderId) => navigate(`/work-orders/${workOrderId}`)} />}
      {showEditModal && <QuotationEditModal quotation={quotation} onClose={() => setShowEditModal(false)} />}
      {paymentToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center px-4"><button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar anulación" onClick={() => setPaymentToDelete(null)} /><section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="void-payment-title"><ReceiptText className="h-8 w-8 text-red-700" aria-hidden="true" /><h2 id="void-payment-title" className="mt-4 text-xl font-bold text-brand-blue">Anular pago</h2><p className="mt-2 text-sm leading-6 text-slate-600">Se eliminará el abono de {formatClp(paymentToDelete.monto)} y el saldo pendiente de la cotización será recalculado.</p><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setPaymentToDelete(null)}>Cancelar</button><button type="button" className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={() => deletePaymentMutation.mutate({ paymentId: paymentToDelete.id, quotationId: quotation.id }, { onSuccess: () => setPaymentToDelete(null) })} disabled={deletePaymentMutation.isPending}>{deletePaymentMutation.isPending ? 'Anulando...' : 'Anular pago'}</button></div></section></div>}
    </div>
  );
};

export default QuotationDetailPage;
