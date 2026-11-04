import { Paperclip } from 'lucide-react';

import type { Payment } from '../../types/entities';

export default function PaymentReceiptLink({ payment }: { payment: Payment }) {
  return payment.comprobantePago ? (
    <a
      href={'/api/payments/' + payment.id + '/receipt'}
      target="_blank"
      rel="noopener noreferrer"
      className="finance-receipt-link"
      title="Ver comprobante en una nueva pestaña"
    >
      <Paperclip aria-hidden="true" />
      <span>Ver comprobante</span>
    </a>
  ) : (
    <span className="finance-record-note">Sin comprobante adjunto</span>
  );
}
