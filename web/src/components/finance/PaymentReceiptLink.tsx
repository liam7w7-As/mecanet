import { Paperclip } from 'lucide-react';

import type { Payment } from '../../types/entities';

export default function PaymentReceiptLink({
  payment,
  compact = false,
}: {
  payment: Payment;
  compact?: boolean;
}) {
  return payment.comprobantePago ? (
    <a
      href={'/api/payments/' + payment.id + '/receipt'}
      target="_blank"
      rel="noopener noreferrer"
      className={'finance-receipt-link' + (compact ? ' finance-receipt-link--compact' : '')}
      title="Ver comprobante en una nueva pestaña"
    >
      <Paperclip aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>Ver comprobante</span>
    </a>
  ) : (
    <span className="finance-record-note">Sin comprobante adjunto</span>
  );
}
