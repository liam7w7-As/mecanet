import type { PaymentStatus } from '@unithor/shared';

const LABELS: Record<PaymentStatus, string> = {
  confirmado: 'Confirmado', por_verificar: 'Por verificar', rechazado: 'Rechazado',
};
const STYLES: Record<PaymentStatus, string> = {
  confirmado: 'bg-brand-mintPale text-brand-mintInk',
  por_verificar: 'bg-brand-goldPale text-brand-ink',
  rechazado: 'bg-brand-coralPale text-brand-coralInk',
};

export default function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>;
}
