import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LoaderCircle, Mail, MessageCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { api } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api-error';
import { normalizeWhatsAppPhone } from '../../lib/whatsapp';
import { notifyError, notifySuccess } from '../../stores/toast.store';

type Kind = 'quotation' | 'work_order';
type Status =
  | 'disabled'
  | 'missing_recipient'
  | 'waiting_photos'
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';
interface EmailHistory {
  id: number;
  category: 'document' | 'progress';
  status: Status;
  recipient: string | null;
  attempts: number;
  acceptedAt: string | null;
  createdAt: string;
  lastError: string | null;
}
interface Overview {
  enabled: boolean;
  recipient: string | null;
  recipientName: string;
  phone: string | null;
  progressPreview: string | null;
  history: EmailHistory[];
}
const overviewSchema = z.object({
  enabled: z.boolean(),
  recipient: z.string().nullable(),
  recipientName: z.string(),
  phone: z.string().nullable(),
  progressPreview: z.string().nullable(),
  history: z.array(
    z.object({
      id: z.number(),
      category: z.enum(['document', 'progress']),
      status: z.enum([
        'disabled',
        'missing_recipient',
        'waiting_photos',
        'pending',
        'sending',
        'sent',
        'failed',
        'cancelled',
      ]),
      recipient: z.string().nullable(),
      attempts: z.number(),
      acceptedAt: z.string().nullable(),
      createdAt: z.string(),
      lastError: z.string().nullable(),
    }),
  ),
});
const LABEL: Record<Status, string> = {
  disabled: 'Correo desactivado',
  missing_recipient: 'Falta correo del destinatario',
  waiting_photos: 'Esperando fotos de recepción',
  pending: 'Pendiente de envío',
  sending: 'Enviando',
  sent: 'Aceptado por el servidor de correo',
  failed: 'Error de envío',
  cancelled: 'Envío cancelado',
};

export default function CustomerEmailPanel({ kind, id }: { kind: Kind; id: number }) {
  const client = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const path =
    '/customer-emails/' + (kind === 'quotation' ? 'quotations' : 'work-orders') + '/' + id;
  const key = ['customer-emails', kind, id];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => overviewSchema.parse((await api.get<Overview>(path)).data),
    refetchInterval: (state) =>
      state.state.data?.history.some(
        (email) =>
          ['pending', 'sending', 'waiting_photos'].includes(email.status) ||
          (email.status === 'failed' && email.attempts < 5),
      )
        ? 3_000
        : false,
  });
  const send = useMutation({
    mutationFn: async (category: 'document' | 'progress') =>
      api.post(path + '/send', { requestId: crypto.randomUUID(), category }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      setShowProgress(false);
      notifySuccess('Correo en cola para envío inmediato.');
    },
    onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo programar el correo.')),
  });
  if (query.isPending)
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-brand-muted" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Consultando envío al cliente...
      </div>
    );
  if (!query.data)
    return (
      <div className="px-4 py-3 text-xs text-brand-muted">
        No se pudo consultar el correo.{' '}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          Reintentar correo
        </button>
      </div>
    );
  const data = query.data;
  const latest = data.history[0];
  const canSend = data.enabled && Boolean(data.recipient) && !send.isPending;
  const documentInQueue = data.history.some(
    (email) =>
      email.category === 'document' &&
      ['pending', 'sending', 'waiting_photos'].includes(email.status),
  );
  const hasSent = data.history.some(
    (email) => email.category === 'document' && email.status === 'sent',
  );
  const statusText = !data.enabled
    ? 'Correo automático pendiente de activar'
    : !data.recipient
      ? LABEL.missing_recipient
      : latest
        ? LABEL[latest.status]
        : 'Sin envíos registrados';

  return (
    <section
      className="min-w-0 rounded-lg border border-brand-line bg-white p-4"
      aria-label="Correo al cliente"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-primaryInk" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-primaryInk">Correo al cliente</p>
            <p className="break-all text-xs text-brand-muted">
              {data.recipient ?? 'Complete el correo del cliente o contacto para poder enviar.'}
            </p>
            <p
              className={
                'mt-1 text-xs ' +
                (latest?.status === 'failed' ? 'text-red-700' : 'text-brand-muted')
              }
              role="status"
            >
              {statusText}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSend || documentInQueue}
            onClick={() => send.mutate('document')}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand-line px-3 text-xs font-semibold text-brand-primaryInk disabled:cursor-not-allowed disabled:opacity-50"
          >
            {send.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {hasSent ? 'Reenviar documento' : 'Enviar documento'}
          </button>
          {kind === 'work_order' && (
            <button
              type="button"
              onClick={() => setShowProgress((value) => !value)}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-primaryInk px-3 text-xs font-semibold text-white"
            >
              Enviar avance
            </button>
          )}
          {data.history.length > 0 && (
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((value) => !value)}
              className="inline-flex min-h-9 items-center gap-1 px-2 text-xs text-brand-muted"
            >
              Historial
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {latest?.status === 'waiting_photos' && (
        <p className="mt-2 text-xs text-amber-800">
          El documento se enviará automáticamente cuando terminen de subirse las fotos seleccionadas
          al crear la OT.
        </p>
      )}
      {showProgress && (
        <div className="mt-4 rounded-lg border border-brand-line bg-brand-pale p-4">
          <p className="text-sm font-semibold text-brand-primaryInk">Resumen para el cliente</p>
          <p className="mt-2 whitespace-pre-line break-words text-sm text-brand-ink">
            {data.progressPreview || 'Aún no hay servicios completados.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSend}
              onClick={() => send.mutate('progress')}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-primaryInk px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              Enviar avance por correo
            </button>
            {normalizeWhatsAppPhone(data.phone) && (
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={
                  'https://wa.me/' +
                  normalizeWhatsAppPhone(data.phone) +
                  '?text=' +
                  encodeURIComponent(
                    'Hola ' +
                      data.recipientName +
                      ', le compartimos el avance de su vehículo:\n' +
                      (data.progressPreview ?? ''),
                  )
                }
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800"
              >
                <MessageCircle className="h-4 w-4" />
                Compartir avance por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      {showHistory && (
        <ul className="mt-3 space-y-2 border-t border-brand-line pt-3 text-xs">
          {data.history.map((email) => (
            <li key={email.id} className="flex flex-wrap justify-between gap-1 text-brand-muted">
              <span>
                {email.category === 'document' ? 'Documento' : 'Avance'} ·{' '}
                {new Date(email.createdAt).toLocaleString('es-CL')}
              </span>
              <span>
                {LABEL[email.status]}
                {email.status === 'failed' ? ' · Intento ' + email.attempts + '/5' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
