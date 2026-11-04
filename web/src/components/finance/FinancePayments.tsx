import { Check, CircleCheck, Clock3, ListFilter, ReceiptText, Search, X } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';

import PaymentReceiptLink from './PaymentReceiptLink';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFinancePayments } from '../../hooks/useFinance';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import Pagination from '../common/Pagination';

import type { Payment } from '../../types/entities';
import type { PaymentMethod, PaymentStatus } from '@unithor/shared';

const statusLabels = {
  confirmado: 'Confirmado',
  por_verificar: 'Por verificar',
  rechazado: 'Rechazado',
};
const methods: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  otro: 'Otro',
};
const statuses = [
  { value: '', label: 'Todos', icon: ListFilter },
  { value: 'confirmado', label: 'Confirmados', icon: CircleCheck },
  { value: 'por_verificar', label: 'Pendientes', icon: Clock3 },
  { value: 'rechazado', label: 'Rechazados', icon: X },
] as const;

export default function FinancePayments({
  canReview,
  onReview,
}: {
  canReview: boolean;
  onReview: (payment: Payment, decision: 'aprobar' | 'rechazar') => void;
}) {
  const [params, setParams] = useSearchParams();
  const rawStatus =
    params.get('paymentStatus') ?? (params.get('tab') === 'verifications' ? 'por_verificar' : '');
  const status =
    rawStatus === 'confirmado' || rawStatus === 'por_verificar' || rawStatus === 'rechazado'
      ? rawStatus
      : '';
  const method = Object.keys(methods).find((value) => value === params.get('paymentMethod')) as
    PaymentMethod | undefined;
  const search = params.get('paymentSearch') ?? '';
  const requestedPage = Number(params.get('paymentPage'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = params.get('paymentFrom') ?? '';
  const to = params.get('paymentTo') ?? '';
  const validRange = !from || !to || from <= to;
  const query = useFinancePayments(
    {
      page,
      pageSize: 20,
      search: useDebouncedValue(search, 300) || undefined,
      estado: status || undefined,
      metodo: method,
      fechaDesde: from || undefined,
      fechaHasta: to || undefined,
    },
    validRange,
  );
  const setFilter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', 'payments');
        if (status && !next.has('paymentStatus') && key !== 'paymentStatus')
          next.set('paymentStatus', status);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'paymentPage') next.delete('paymentPage');
        return next;
      },
      { replace: true },
    );
  const clear = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', 'payments');
        [
          'paymentStatus',
          'paymentMethod',
          'paymentSearch',
          'paymentFrom',
          'paymentTo',
          'paymentPage',
        ].forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );

  return (
    <section className="finance-payments" aria-label="Listado de abonos">
      <div className="finance-payment-toolbar">
        <label className="finance-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar abonos</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setFilter('paymentSearch', event.target.value)}
            placeholder="Cotización, cliente o transacción"
          />
        </label>
        <label className="finance-compact-filter">
          Método
          <select
            aria-label="Método de los abonos"
            value={method ?? ''}
            onChange={(event) => setFilter('paymentMethod', event.target.value)}
          >
            <option value="">Todos los métodos</option>
            {Object.entries(methods).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="finance-compact-filter">
          Desde
          <input
            aria-label="Abonos desde"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFilter('paymentFrom', event.target.value)}
          />
        </label>
        <label className="finance-compact-filter">
          Hasta
          <input
            aria-label="Abonos hasta"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setFilter('paymentTo', event.target.value)}
          />
        </label>
      </div>
      <div className="finance-list-toolbar">
        <div className="finance-filter-pills" role="group" aria-label="Filtrar abonos por estado">
          {statuses.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              aria-pressed={status === value}
              onClick={() => setFilter('paymentStatus', value)}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <span className="finance-record-note" role="status">
          {query.isPending ? 'Cargando…' : (query.data?.total ?? 0) + ' abonos'}
        </span>
        {(search || status || method || from || to) && (
          <button type="button" className="finance-clear-filters" onClick={clear}>
            Limpiar filtros
          </button>
        )}
      </div>
      {!validRange && (
        <p role="alert" className="finance-alert">
          La fecha desde debe ser anterior o igual a la fecha hasta.
        </p>
      )}
      {query.isError && (
        <div className="finance-alert" role="alert">
          {getApiErrorMessage(query.error, 'No se pudieron cargar los abonos.')}
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      <div className="finance-record-list" aria-busy={query.isFetching}>
        {validRange &&
          (query.isPending
            ? Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="finance-record-skeleton animate-pulse" />
              ))
            : query.data?.items.map((payment) => {
                const state: PaymentStatus = payment.estado ?? 'confirmado';
                return (
                  <article key={payment.id} className="finance-payment-row">
                    <ReceiptText className="finance-record-icon" aria-hidden="true" />
                    <div className="finance-payment-identity">
                      <Link to={'/quotations/' + payment.quotationId}>
                        {payment.quotation?.codigo ?? 'COT #' + payment.quotationId}
                      </Link>
                      <small>{formatDateTime(payment.fecha)}</small>
                    </div>
                    <div className="finance-payment-client">
                      <strong>{payment.quotation?.client?.nombre ?? 'Sin cliente'}</strong>
                      <small>
                        {payment.referencia || payment.numeroTransaccion || 'Sin referencia'}
                      </small>
                      {payment.bancoOrigen && (
                        <small>
                          {payment.bancoOrigen} · {payment.numeroTransaccion ?? 'Sin N°'}
                        </small>
                      )}
                    </div>
                    <div className="finance-payment-status">
                      <span className={'finance-status finance-status--' + state}>
                        {statusLabels[state]}
                      </span>
                      <small>
                        {payment.metodo
                          ? (methods[payment.metodo] ?? payment.metodo)
                          : 'Sin método'}
                      </small>
                    </div>
                    <div className="finance-payment-amount">
                      <small>Monto</small>
                      <strong>{formatClp(payment.monto)}</strong>
                    </div>
                    <div className="finance-payment-actions">
                      <PaymentReceiptLink payment={payment} />
                      {state === 'por_verificar' && canReview && (
                        <div>
                          <button
                            type="button"
                            className="finance-approve"
                            onClick={() => onReview(payment, 'aprobar')}
                          >
                            <Check aria-hidden="true" />
                            Aprobar
                          </button>
                          <button
                            type="button"
                            className="finance-reject"
                            onClick={() => onReview(payment, 'rechazar')}
                          >
                            <X aria-hidden="true" />
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              }))}
        {validRange && !query.isPending && !query.isError && query.data?.items.length === 0 && (
          <div className="finance-empty">
            <ReceiptText aria-hidden="true" />
            <h3>No hay abonos para estos filtros</h3>
            <p>Cambie el período, el método o el texto de búsqueda.</p>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={query.data?.totalPages ?? 0}
          total={query.data?.total ?? 0}
          onPageChange={(next) => setFilter('paymentPage', String(next))}
        />
      </div>
    </section>
  );
}
