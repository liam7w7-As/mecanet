import { randomUUID } from 'node:crypto';

import { getWorkOrderStatusLabel } from '@unithor/shared';
import { z } from 'zod';

import { env } from '../config/env.js';
import { Client } from '../models/Client.js';
import {
  CustomerEmail,
  type CustomerEmailKind,
  type CustomerEmailPayload,
} from '../models/CustomerEmail.js';
import { Quotation } from '../models/Quotation.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';

import type { Transaction } from 'sequelize';

let wakeup: (() => void) | undefined;
export const setEmailQueueWakeup = (callback?: () => void): void => {
  wakeup = callback;
};
export const wakeEmailQueue = (): void => {
  wakeup?.();
};

export const resolveCustomerEmail = async (
  kind: CustomerEmailKind,
  entityId: number,
  transaction?: Transaction,
) => {
  if (kind === 'quotation') {
    const quotation = await Quotation.findByPk(entityId, { transaction });
    if (!quotation) return null;
    const client = quotation.clientId
      ? await Client.findByPk(quotation.clientId, { transaction })
      : null;
    return {
      recipient: client?.email ?? null,
      name: client?.nombre ?? 'Cliente',
      code: quotation.codigo,
    };
  }
  const workOrder = await WorkOrder.findByPk(entityId, { transaction });
  if (!workOrder) return null;
  const client = workOrder.clientId
    ? await Client.findByPk(workOrder.clientId, { transaction })
    : null;
  const contact = workOrder.contactClientId
    ? await Client.findByPk(workOrder.contactClientId, { transaction })
    : null;
  // Use the designated contact's current address, never another billing recipient.
  return {
    recipient:
      workOrder.contactClientId !== null
        ? (contact?.email ?? null)
        : workOrder.contactName
          ? workOrder.contactEmail
          : (client?.email ?? null),
    name: workOrder.contactName ?? client?.nombre ?? 'Cliente',
    code: workOrder.codigo,
  };
};

export const enqueueCustomerEmail = async (
  input: {
    kind: CustomerEmailKind;
    entityId: number;
    userId: number | null;
    category?: 'document' | 'progress';
    dedupeKey?: string;
    payload?: CustomerEmailPayload;
    target?: { recipient: string | null; name: string; code: string };
  },
  transaction: Transaction,
): Promise<CustomerEmail | null> => {
  const target =
    input.target ?? (await resolveCustomerEmail(input.kind, input.entityId, transaction));
  if (!target) return null;
  const recipient = z.string().email().safeParse(target.recipient?.trim());
  const category = input.category ?? 'document';
  const payload = input.payload ?? {};
  const dedupeKey = input.dedupeKey ?? 'manual:' + randomUUID();
  const defaults = {
    dedupeKey,
    kind: input.kind,
    entityId: input.entityId,
    category,
    recipient: recipient.success ? recipient.data : null,
    recipientName: target.name,
    subject:
      (category === 'progress'
        ? 'Avance de trabajo'
        : input.kind === 'quotation'
          ? 'Cotización'
          : 'Orden de trabajo') +
      ' ' +
      target.code +
      ' | UNITHOR',
    payload,
    requestedBy: input.userId,
    status: !env.MAIL_ENABLED
      ? ('disabled' as const)
      : !recipient.success
        ? ('missing_recipient' as const)
        : payload.expectedPhotoSlots?.length
          ? ('waiting_photos' as const)
          : category === 'document'
            ? ('waiting_documents' as const)
            : ('pending' as const),
    nextAttemptAt: new Date(),
  };
  // A newly created entity has exactly one creation job in this transaction.
  // Avoid the extra lookup/savepoint used for idempotent manual resends.
  const email = dedupeKey.startsWith('created:')
    ? await CustomerEmail.create(defaults, { transaction })
    : (await CustomerEmail.findOrCreate({ where: { dedupeKey }, defaults, transaction }))[0];
  transaction.afterCommit(() => {
    wakeEmailQueue();
  });
  return email;
};

export const enqueueWorkOrderProgress = async (
  workOrderId: number,
  userId: number,
  transaction: Transaction,
  eventKey: string,
  percentage?: number,
): Promise<void> => {
  const workOrder = await WorkOrder.findByPk(workOrderId, { transaction });
  if (!workOrder) return;
  const items = await WorkOrderItem.findAll({
    where: { workOrderId },
    attributes: ['descripcion', 'estadoOperativo'],
    order: [['id', 'ASC']],
    transaction,
  });
  const completed = items.filter((item) => item.estadoOperativo === 'completado');
  const message = [
    `Estado de su vehículo: ${getWorkOrderStatusLabel(workOrder.estado)}.`,
    ...(percentage !== undefined ? [`Avance informado: ${percentage}%.`] : []),
    `Trabajos completados: ${completed.length} de ${items.length}.`,
    ...completed.map((item) => `• ${item.descripcion}`),
  ].join('\n');
  await enqueueCustomerEmail(
    {
      kind: 'work_order',
      entityId: workOrderId,
      userId,
      category: 'progress',
      dedupeKey: eventKey,
      payload: { message },
    },
    transaction,
  );
};
