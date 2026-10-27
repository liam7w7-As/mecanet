import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';

import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { CustomerEmail } from '../models/CustomerEmail.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import {
  generateOfficialWorkOrderEmailPdf,
  generateQuotationEmailPdf,
} from '../services/customer-document-pdf.service.js';
import {
  enqueueCustomerEmail,
  enqueueWorkOrderProgress,
  resolveCustomerEmail,
} from '../services/customer-email-queue.service.js';
import { getQuotationById } from '../services/quotation.service.js';
import { assertWorkOrderManagementAccess } from '../services/work-order.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CustomerEmailKind } from '../models/CustomerEmail.js';

export const customerEmailRouter = Router();
customerEmailRouter.use(authenticate);
const params = z.object({ id: z.coerce.number().int().positive() });
const body = z
  .object({
    requestId: z.string().uuid(),
    category: z.enum(['document', 'progress']).default('document'),
  })
  .strict();

for (const [path, kind, module] of [
  ['quotations', 'quotation', 'comercial'],
  ['work-orders', 'work_order', 'taller'],
] as const) {
  const assertAccess = async (id: number, userId: number) => {
    if (kind === 'quotation') await getQuotationById(id, userId);
    else await assertWorkOrderManagementAccess(id, userId);
  };
  customerEmailRouter.get(
    '/' + path + '/:id',
    authorize(module, 'read'),
    validate({ params }),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      await assertAccess(id, req.user!.id);
      const [target, history] = await Promise.all([
        resolveCustomerEmail(kind, id),
        CustomerEmail.findAll({ where: { kind, entityId: id }, order: [['id', 'DESC']], limit: 6 }),
      ]);
      const order = kind === 'work_order' ? await WorkOrder.findByPk(id) : null;
      const items = order
        ? await WorkOrderItem.findAll({
            where: { workOrderId: id },
            attributes: ['descripcion', 'estadoOperativo'],
            order: [['id', 'ASC']],
          })
        : [];
      const completed = items.filter((item) => item.estadoOperativo === 'completado');
      res.json({
        enabled: env.MAIL_ENABLED,
        recipient: target?.recipient ?? null,
        recipientName: target?.name,
        phone: order?.contactPhone ?? null,
        progressPreview: order
          ? 'Trabajos completados: ' +
            completed.length +
            ' de ' +
            items.length +
            '.\n' +
            completed.map((item) => '• ' + item.descripcion).join('\n')
          : null,
        history: history.map((email) => ({
          id: email.id,
          category: email.category,
          status: email.status,
          recipient: email.recipient,
          attempts: email.attempts,
          acceptedAt: email.acceptedAt,
          createdAt: email.createdAt,
          lastError: email.lastError,
          awaitingPhotos: email.status === 'waiting_photos',
        })),
      });
    }),
  );
  customerEmailRouter.post(
    '/' + path + '/:id/send',
    authorize(module, 'read'),
    validate({ params, body }),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const userId = req.user!.id;
      await assertAccess(id, userId);
      if (!env.MAIL_ENABLED)
        throw ApiError.badRequest(
          'El envío de correo aún no está activado. Configure SMTP y MAIL_ENABLED.',
        );
      const data = req.body as z.infer<typeof body>;
      if (kind === 'quotation' && data.category === 'progress')
        throw ApiError.badRequest('Los avances corresponden a una OT');
      const target = await resolveCustomerEmail(kind, id);
      if (!z.string().email().safeParse(target?.recipient?.trim()).success) {
        throw ApiError.badRequest(
          'El destinatario no tiene un correo válido. Complete el correo del cliente o contacto.',
        );
      }
      const result = await sequelize.transaction(async (transaction) => {
        // Serialize manual requests for this document; double clicks share the queued job.
        if (kind === 'quotation') {
          const { Quotation } = await import('../models/Quotation.js');
          await Quotation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        } else await WorkOrder.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        const active = await CustomerEmail.findOne({
          where: {
            kind,
            entityId: id,
            category: data.category,
            status: { [Op.in]: ['pending', 'sending', 'waiting_photos'] },
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (active) return active;
        await CustomerEmail.update(
          { status: 'cancelled' },
          {
            where: {
              kind,
              entityId: id,
              category: data.category,
              status: { [Op.in]: ['failed', 'missing_recipient'] },
            },
            transaction,
          },
        );
        const key = 'manual:' + kind + ':' + id + ':' + data.requestId;
        if (data.category === 'progress') {
          await enqueueWorkOrderProgress(id, userId, transaction, key);
          return CustomerEmail.findOne({ where: { dedupeKey: key }, transaction });
        }
        return enqueueCustomerEmail(
          {
            kind: kind as CustomerEmailKind,
            entityId: id,
            userId,
            dedupeKey: key,
            payload: { includeQuotation: kind === 'work_order' },
          },
          transaction,
        );
      });
      res
        .status(202)
        .json({
          email: { id: result?.id, status: result?.status },
          message: 'Correo programado para envío inmediato',
        });
    }),
  );
  customerEmailRouter.get(
    '/' + path + '/:id/pdf',
    authorize(module, 'read'),
    validate({ params }),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      await assertAccess(id, req.user!.id);
      const target = await resolveCustomerEmail(kind, id);
      const bytes =
        kind === 'quotation'
          ? await generateQuotationEmailPdf(id)
          : await generateOfficialWorkOrderEmailPdf(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + target?.code + '.pdf"');
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(Buffer.from(bytes));
    }),
  );
}
