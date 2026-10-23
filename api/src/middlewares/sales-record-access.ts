import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import {
  assertSalesQuotationAccess,
  assertSalesWorkOrderAccess,
} from '../services/sales-access.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { RequestHandler } from 'express';

// Applies to every subroute too: PDF, photos, status, conversion and receipts.
export const salesRecordAccess =
  (resource: 'work-order' | 'quotation' | 'payment'): RequestHandler =>
  async (req, _res, next): Promise<void> => {
    try {
      if (req.user?.role !== 'vendedor') return next();
      const match = /^\/(\d+)(?:\/|$)/.exec(req.path);
      if (!match) return next();
      const id = Number(match[1]);
      if (resource === 'work-order') await assertSalesWorkOrderAccess(id, req.user.id);
      if (resource === 'quotation') await assertSalesQuotationAccess(id, req.user.id);
      if (resource === 'payment') {
        const payment = await Payment.findOne({
          where: { id },
          attributes: ['id'],
          include: [
            {
              model: Quotation,
              required: true,
              attributes: ['id'],
              where: { asesorId: req.user.id },
            },
          ],
        });
        if (!payment) throw ApiError.notFound('Pago no encontrado');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
